import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { makeLastMidnightFixture } from './verify_last_midnight.ts';
import { exportSaveJson } from '../src/engine/saveManager.ts';
import { getAccessibleRoomIds } from '../src/engine/actionResolver.ts';
import { EVENTS } from '../src/engine/events.ts';

const ORIGIN = process.env.HAUNTED_TEST_ORIGIN || 'http://127.0.0.1:4173';
const READ_KEY = 'thtr_active_save_v1';
const errors = [];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const fixture = makeLastMidnightFixture();
const rawFixture = exportSaveJson(fixture.state);
assert.equal(fixture.state.scenario.id, 'the_last_midnight');

function statePath(state, from, to) {
  if (from === to) return [];
  const queue = [[from]];
  const seen = new Set([from]);
  for (let index = 0; index < queue.length; index++) {
    const path = queue[index];
    const id = path[path.length - 1];
    for (const next of getAccessibleRoomIds(state, id, state.players[0])) {
      if (seen.has(next)) continue;
      const candidate = [...path, next];
      if (next === to) return candidate.slice(1);
      seen.add(next);
      queue.push(candidate);
    }
  }
  return null;
}
const safeName = v => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function saved(page) {
  return page.evaluate(key => {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw).gameState : null;
  }, READ_KEY);
}
async function savedRaw(page) {
  return page.evaluate(key => window.localStorage.getItem(key), READ_KEY);
}
async function waitVersion(page, minimum) {
  await page.waitForFunction(({ key, minimum }) => {
    const raw = window.localStorage.getItem(key);
    if (!raw) return document.body.textContent.includes('Morning Reclaimed') ||
      document.body.textContent.includes('The Thirteenth Hour');
    return JSON.parse(raw).gameState.version > minimum;
  }, { key: READ_KEY, minimum }, { timeout: 15_000 });
}
async function chooseModal(page, state) {
  if (state.activeEvent) {
    const dialog = page.getByRole('dialog');
    if (state.activeEvent.resolved) {
      await dialog.getByRole('button', { name: 'Continue Expedition' }).click();
    } else {
      const event = EVENTS.find(e => e.id === state.activeEvent.eventId);
      assert.ok(event, 'Active event definition exists');
      const choice = event.choices.find(c => !c.requiredItemId && !c.requiredFlag) ?? event.choices[0];
      await dialog.getByRole('button', { name: new RegExp(safeName(choice.label)) }).click();
    }
    return true;
  }
  if (state.activePuzzle) {
    await page.getByRole('button', { name: 'Step back from mechanism' }).click();
    return true;
  }
  return false;
}
async function clickAlignClock(page) {
  let target = page.getByRole('button', { name: /Align Clock/ });
  if (await target.count() === 0 || !await target.first().isVisible()) {
    await page.getByRole('button', { name: /More \(\d+\)/ }).click();
    target = page.getByRole('button', { name: /Align Clock/ });
  }
  await target.first().click();
}
async function clickRoomInPlan(page, room) {
  await page.getByRole('button', { name: '2D Floor Plan' }).click();
  const dialog = page.getByRole('dialog', { name: 'Blackwood Estate Floor Plan' });
  const floorName = room.floor === 1 ? 'Upper Story' : room.floor === 0 ? 'Ground Story' : 'Basement Vaults';
  await dialog.getByRole('button', { name: floorName }).click();
  const target = dialog.getByRole('button', { name: new RegExp(safeName(room.name)) });
  await target.first().click();
}
async function importFile(page) {
  await page.locator('input[type=file]').first().setInputFiles({
    name: 'last-midnight-v1.json', mimeType: 'application/json',
    buffer: Buffer.from(rawFixture),
  });
}
async function expectContains(page, text) {
  await page.getByText(text, { exact: false }).first().waitFor({ timeout: 20_000 });
}
async function launchSolo(page) {
  await page.getByRole('button', { name: 'Begin Expedition' }).click();
  await page.getByRole('button', { name: 'Enter Blackwood House' }).click();
}

const browser = await chromium.launch({
  executablePath: process.env.HAUNTED_CHROMIUM_PATH || undefined,
  headless: true,
  args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--enable-webgl'],
});
try {
  // P003: real UI denial, persistently visible warning, manual recovery export.
  const blocked = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  await blocked.addInitScript(() => {
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function(k,v) {
      if (k === 'thtr_active_save_v1') throw new DOMException('Storage quota refused', 'QuotaExceededError');
      return write.call(this, k, v);
    };
  });
  const blockedPage = await blocked.newPage();
  blockedPage.on('pageerror', e => errors.push('storage-run: ' + e.message));
  await blockedPage.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
  await launchSolo(blockedPage);
  await expectContains(blockedPage, 'Save storage warning');
  await expectContains(blockedPage, 'Autosave failed');
  const recovery = blockedPage.waitForEvent('download');
  await blockedPage.getByRole('button', { name: 'Download Current Save' }).click();
  const downloaded = await recovery;
  assert.match(downloaded.suggestedFilename(), /^haunted-recovery-.*\.json$/);
  assert.equal(await savedRaw(blockedPage), null, 'Denied storage did not claim a saved run');
  console.log('BROWSER_PASS P003 storage denial, persistent warning and recovery JSON download');
  await blocked.close();

  // P003: staged menu import cancellation must not alter saved bytes.
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push('normal-run: ' + e.message));
  await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
  await launchSolo(page);
  const originalRaw = await savedRaw(page);
  assert.ok(originalRaw, 'Starting solo play writes a recoverable v1 save');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Continue Expedition' }).waitFor();
  await importFile(page);
  await page.getByRole('group', { name: 'Confirm save replacement' }).waitFor();
  assert.equal(await savedRaw(page), originalRaw, 'Staging must not overwrite original bytes');
  await page.getByRole('button', { name: 'Cancel Import' }).click();
  assert.equal(await savedRaw(page), originalRaw, 'Cancel preserves original bytes');
  // The separate Settings save-import path must obey the same cancel contract.
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'Manor Settings' });
  await settings.getByRole('tab', { name: 'Saves' }).click();
  await settings.locator('input[type=file]').setInputFiles({
    name: 'last-midnight-v1.json', mimeType: 'application/json', buffer: Buffer.from(rawFixture),
  });
  await settings.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal(await savedRaw(page), originalRaw, 'Settings cancellation preserves original bytes');
  await settings.getByRole('button', { name: 'Close settings' }).click();
  await importFile(page);
  await page.getByRole('button', { name: 'Confirm Save Replacement' }).click();
  await expectContains(page, 'The Last Midnight');
  let state = await saved(page);
  assert.equal(state.scenario.id, 'the_last_midnight');
  assert.equal(state.seed, fixture.seed);
  console.log('BROWSER_PASS P003 UI staged/cancelled/confirmed import');

  // P004: walk with actual floor-plan buttons; align with the actual HUD action.
  let didReload = false;
  for (let step = 0; step < 90; step++) {
    state = await saved(page);
    if (!state) break; // Successful ending clears active save after archive.
    if (state.phase === 'ended') break;
    const originalVersion = state.version;
    if (await chooseModal(page, state)) {
      await waitVersion(page, originalVersion);
      continue;
    }
    const player = state.players[0];
    if (player.actionPoints === 0) {
      await page.getByRole('button', { name: /End Turn/ }).click();
      await waitVersion(page, originalVersion);
      continue;
    }
    const current = state.rooms[player.roomId];
    if (current.hasClockMechanism && !current.clockAligned) {
      await clickAlignClock(page);
      await waitVersion(page, originalVersion);
      const after = await saved(page);
      if (!didReload && after && after.scenario.progress >= 1) {
        const stateBeforeReload = after.version;
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.getByRole('button', { name: 'Continue Expedition' }).click();
        const resumed = await saved(page);
        assert.equal(resumed.version, stateBeforeReload);
        assert.equal(resumed.scenario.progress, after.scenario.progress);
        didReload = true;
      }
      continue;
    }
    const goal = Object.values(state.rooms)
      .filter(r => r.hasClockMechanism && !r.clockAligned)
      .map(r => ({ room: r, path: statePath(state, current.id, r.id) }))
      .filter(v => v.path !== null)
      .sort((a,b) => a.path.length - b.path.length || a.room.id.localeCompare(b.room.id))[0];
    assert.ok(goal, 'There is always a reachable remaining clock');
    const dest = state.rooms[goal.path[0]];
    assert.ok(dest, 'Room step exists');
    await clickRoomInPlan(page, dest);
    await waitVersion(page, originalVersion);
  }
  await expectContains(page, 'Morning Reclaimed');
  assert.ok(didReload, 'Mid-Revelation browser save/resume exercised');
  const archive = await page.evaluate(() => JSON.parse(window.localStorage.getItem('thtr_expedition_archive_v1') || '[]'));
  assert.ok(archive.some(e => e.seed === fixture.seed && e.victory), 'Victory recorded in browser archive');
  await page.getByRole('button', { name: 'Main Menu', exact: true }).click();
  await page.getByRole('button', { name: 'Memory Archive' }).click();
  await expectContains(page, fixture.seed);
  console.log('BROWSER_PASS P004 three clocks via floor plan/HUD, reload/resume, victory, archive and return menu');
  await context.close();

  // P004: browser countdown route reaches the actual loss ending.
  const contextLoss = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const lossPage = await contextLoss.newPage();
  lossPage.on('pageerror', e => errors.push('loss-run: ' + e.message));
  await lossPage.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
  await importFile(lossPage);
  for (let i = 0; i < 30; i++) {
    const state = await saved(lossPage);
    if (!state || state.phase === 'ended') break;
    const before = state.version;
    if (await chooseModal(lossPage, state)) {
      await waitVersion(lossPage, before);
      continue;
    }
    await lossPage.getByRole('button', { name: /End Turn/ }).click();
    await waitVersion(lossPage, before);
  }
  await expectContains(lossPage, 'The Thirteenth Hour');
  const lossArchive = await lossPage.evaluate(() => JSON.parse(window.localStorage.getItem('thtr_expedition_archive_v1') || '[]'));
  assert.ok(lossArchive.some(e => e.seed === fixture.seed && !e.victory));
  console.log('BROWSER_PASS P004 countdown failure, ending and archived defeat');
  await contextLoss.close();

  if (errors.length) throw new Error('Uncaught browser script errors: ' + JSON.stringify(errors.slice(0, 8)));
  console.log('PASS: full Chromium browser P003/P004 journey', JSON.stringify({ seed: fixture.seed, browser: browser.version() }));
} finally {
  await browser.close();
}

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import { chromium } from 'playwright';
import { makeLastMidnightFixture } from './verify_last_midnight.ts';
import { exportSaveJson } from '../src/engine/saveManager.ts';

const project = 'Haunted_Exploration';
const scenarioId = 'p006-loopback-menu-midnight-return-v1';
const origin = process.env.HAUNTED_TEST_ORIGIN || 'http://127.0.0.1:4173';
const outDir = process.env.HAUNTED_PERF_OUT || 'performance-evidence';
const fixedViewport = { width: 1280, height: 720 };
const sampleMs = 30000;
const slowThresholdMs = 50;
const errors = [];

function quantile(raw, q) {
  if (raw.length === 0) return null;
  const values = [...raw].sort((a, b) => a - b);
  return Number(values[Math.max(0, Math.ceil(q * values.length) - 1)].toFixed(3));
}
function mean(values) {
  return values.length ? Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(3)) : null;
}
function metricsByName(raw) {
  return Object.fromEntries((raw.metrics || []).map(({ name, value }) => [name, value]));
}
function durationDelta(before, after, key) {
  const b = before[key];
  const a = after[key];
  return typeof b === 'number' && typeof a === 'number' ? Number((a - b).toFixed(5)) : null;
}

const browser = await chromium.launch({
  executablePath: process.env.HAUNTED_CHROMIUM_PATH || undefined,
  headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl'],
});

const context = await browser.newContext({ viewport: fixedViewport, deviceScaleFactor: 1 });
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message));
const cdp = await context.newCDPSession(page);
await cdp.send('Performance.enable');
await page.addInitScript(() => {
  window.__HAUNTED_LONGTASKS__ = [];
  if (typeof PerformanceObserver !== 'undefined') {
    try {
      const observer = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          window.__HAUNTED_LONGTASKS__.push({ startTime: entry.startTime, duration: entry.duration });
          if (window.__HAUNTED_LONGTASKS__.length > 1000) window.__HAUNTED_LONGTASKS__.shift();
        }
      });
      observer.observe({ entryTypes: ['longtask'] });
    } catch {
      // Browser may not support longtask observers; mark evidence unavailable.
    }
  }
});

const startedAt = Date.now();
const phases = [];
let navigation = null;
let fixture = null;

async function phase(label) {
  await page.evaluate(() => {
    const probe = window.__HAUNTED_P006__;
    if (!probe) throw new Error('P006 instrumentation unavailable: start refused');
    probe.start();
  });
  const before = metricsByName(await cdp.send('Performance.getMetrics'));
  const phaseStart = await page.evaluate(() => performance.now());
  await page.waitForTimeout(sampleMs);
  const phaseEnd = await page.evaluate(() => performance.now());
  const after = metricsByName(await cdp.send('Performance.getMetrics'));
  const raw = await page.evaluate(() => {
    const probe = window.__HAUNTED_P006__;
    const result = probe.read();
    probe.stop();
    return {
      ...result,
      longTasks: (window.__HAUNTED_LONGTASKS__ || []).slice(),
      jsHeapUsedSize: performance.memory?.usedJSHeapSize ?? null,
    };
  });
  const frames = raw.samples.filter(x => Number.isFinite(x.intervalMs) && x.intervalMs > 0);
  const intervals = frames.map(x => x.intervalMs);
  const cpuUpdate = frames.map(x => x.simulationMs);
  const submission = frames.map(x => x.renderSubmissionMs);
  const intervalSummary = {
    count: intervals.length,
    p50Ms: quantile(intervals, 0.5),
    p95Ms: quantile(intervals, 0.95),
    p99Ms: quantile(intervals, 0.99),
    maxMs: intervals.length ? Math.max(...intervals) : null,
    slowFramePercentage: intervals.length
      ? Number((100 * intervals.filter(x => x > slowThresholdMs).length / intervals.length).toFixed(2)) : null,
  };
  const longTaskWindow = raw.longTasks.filter(x => x.startTime >= phaseStart && x.startTime <= phaseEnd);
  const summary = {
    label,
    phaseStart, phaseEnd,
    durationMs: Number((phaseEnd - phaseStart).toFixed(2)),
    renderingMode: raw.softwareGL ? 'software-webgl' : 'hardware-webgl',
    pixelRatio: raw.pixelRatio,
    postprocessing: raw.postprocessing,
    canvas: raw.canvas,
    scene: raw.scene,
    frameIntervals: intervalSummary,
    simulation: { meanMs: mean(cpuUpdate), p95Ms: quantile(cpuUpdate, 0.95), p99Ms: quantile(cpuUpdate, 0.99) },
    renderSubmission: { meanMs: mean(submission), p95Ms: quantile(submission, 0.95), p99Ms: quantile(submission, 0.99) },
    renderer: raw.renderer,
    longTasks: { count: longTaskWindow.length, p95Ms: quantile(longTaskWindow.map(x => x.duration), 0.95) },
    cdp: {
      taskDurationSeconds: durationDelta(before, after, 'TaskDuration'),
      scriptDurationSeconds: durationDelta(before, after, 'ScriptDuration'),
      layoutDurationSeconds: durationDelta(before, after, 'LayoutDuration'),
      jsHeapBytes: after.JSHeapUsedSize ?? raw.jsHeapUsedSize,
    },
  };
  const minimumFrames = raw.softwareGL ? 12 : 60;
  const adequateSamples = intervals.length >= minimumFrames;
  phases.push({ ...summary, adequateSamples, minimumFrames, rawFrames: frames });
  console.log('P006_PHASE', JSON.stringify({ ...summary, adequateSamples, minimumFrames }));
  // Collect all phase evidence even when samples are sparse. Never claim PASS
  // based on an interrupted or unrepresentative first phase.
  return summary;
}

async function importFixture() {
  if (!fixture) {
    fixture = makeLastMidnightFixture();
    assert.equal(fixture.state.scenario.id, 'the_last_midnight');
  }
  await page.locator('input[type=file]').first().setInputFiles({
    name: 'last-midnight-p006.json',
    mimeType: 'application/json',
    buffer: Buffer.from(exportSaveJson(fixture.state)),
  });
  await page.getByText('The Last Midnight', { exact: false }).first().waitFor({ timeout: 30_000 });
}

async function goBackToMenu() {
  await page.getByRole('button', { name: 'Tabletop menu' }).click();
  await page.getByRole('menuitem', { name: 'Return to Study' }).click();
  await page.getByRole('button', { name: 'Continue Expedition' }).waitFor();
}

try {
  await page.goto(origin + '/?perf=1', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Begin Expedition' }).waitFor({ timeout: 30_000 });
  const readyAt = Date.now();
  navigation = await page.evaluate(() => {
    const e = performance.getEntriesByType('navigation')[0];
    return e ? { domainLookupEnd: e.domainLookupEnd, domContentLoadedEventEnd: e.domContentLoadedEventEnd, loadEventEnd: e.loadEventEnd, responseEnd: e.responseEnd } : null;
  });
  await phase('menu-first-steady');
  await importFixture();
  await phase('midnight-first-steady');
  await goBackToMenu();
  await phase('menu-after-first-unload');
  await page.getByRole('button', { name: 'Continue Expedition' }).click();
  await page.getByText('The Last Midnight', { exact: false }).first().waitFor();
  await phase('midnight-second-steady');
  await goBackToMenu();
  await phase('menu-after-second-unload');

  if (errors.length) throw new Error('Browser script errors: ' + JSON.stringify(errors.slice(0, 12)));
  const first = phases[0];
  const third = phases[2];
  const fifth = phases[4];
  const recovered = {
    first: {
      geometries: third.renderer.geometries - first.renderer.geometries,
      textures: third.renderer.textures - first.renderer.textures,
      programs: third.renderer.programs === null || first.renderer.programs === null
        ? null : third.renderer.programs - first.renderer.programs,
    },
    second: {
      geometries: fifth.renderer.geometries - first.renderer.geometries,
      textures: fifth.renderer.textures - first.renderer.textures,
      programs: fifth.renderer.programs === null || first.renderer.programs === null
        ? null : fifth.renderer.programs - first.renderer.programs,
    },
  };
  const workloadSignature = {
    project, scenarioId, scenarioVersion: 2,
    browser: browser.version(),
    userAgent: await page.evaluate(() => navigator.userAgent),
    platform: await page.evaluate(() => navigator.platform),
    viewport: fixedViewport,
    devicePixelRatio: 1,
    mode: first.renderingMode,
    postprocessing: first.postprocessing,
    canvas: first.canvas,
    quality: 'existing-scene-default',
    device: 'GitHub-hosted Ubuntu x64 virtual machine with software-rendering flags',
    realDevice: false,
    cpuModel: os.cpus()[0]?.model ?? 'unknown',
    cpus: os.cpus().length,
    totalMemoryBytes: os.totalmem(),
    network: 'local Vite HTTP loopback',
    capture: 'MansionSceneManager existing-loop opt-in instrumentation + Chromium CDP',
    phaseDurationMs: sampleMs,
    seed: fixture?.seed ?? null,
  };
  // Provisional interpretation policy LOCKED before looking at numbers:
  // software WebGL intentionally adds a GPU-fence and >=80 ms pacing delay;
  // a low measured FPS alone is not a release failure.
  const provisionalBudgets = {
    hardwareP95FrameIntervalMs: 33.3,
    hardwareP99FrameIntervalMs: 60,
    slowFrameThresholdMs: slowThresholdMs,
    maxPostUnloadTextureGrowth: 3,
    maxPostUnloadGeometryGrowth: 5,
    minimumSoftwareFrameSamples: 12,
    minimumHardwareFrameSamples: 60,
  };
  const adequatePhases = phases.every(p => p.adequateSamples);
  const record = {
    formatVersion: 1,
    captureStatus: adequatePhases ? 'valid' : 'insufficient-samples',
    buildSha: process.env.GITHUB_SHA || 'local-uncommitted',
    runId: process.env.GITHUB_RUN_ID || 'local',
    timeUtc: new Date().toISOString(),
    startedAtMs: startedAt,
    firstMenuReadyMs: readyAt - startedAt,
    navigation,
    workloadSignature, provisionalBudgets,
    phases, recovered,
    environmentLimitations: [
      'Headless hosted runner, not user desktop or mobile',
      'Software GL intentionally throttles frames via GPU fence and 80ms timeout',
      'Renderer info cannot prove total GPU/native allocations or listener cleanup',
      'CDP TaskDuration is approximate main-thread time, not dedicated GPU timing',
      'Steady 6.5-second phases do not prove long-session stability',
    ],
  };
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = outDir + '/p006-baseline-' + record.buildSha.slice(0, 12) + '.json';
  fs.writeFileSync(outPath, JSON.stringify(record, null, 2) + '\n');
  console.log('P006_EVIDENCE_FILE', outPath);
  console.log('P006_RESOURCE_DELTAS', JSON.stringify(recovered));
  console.log(adequatePhases ? 'P006_CAPTURE_PASS' : 'P006_CAPTURE_INCOMPLETE',
    JSON.stringify({ mode: workloadSignature.mode, phases: phases.length, firstMenuReadyMs: record.firstMenuReadyMs, seed: workloadSignature.seed,
      sampleCounts: phases.map(p => ({ label: p.label, frames: p.frameIntervals.count, minimum: p.minimumFrames })) }));
  if (!adequatePhases) throw new Error('P006 evidence saved but has insufficient frame samples; not a passing performance baseline.');
} finally {
  await context.close();
  await browser.close();
}

import assert from 'node:assert/strict';
import { createNewGame, getAccessibleRoomIds, resolveGameAction } from '../src/engine/actionResolver.ts';
import { EVENTS } from '../src/engine/events.ts';
import { exportSaveJson, importSaveJson, loadActiveGame, loadArchive, recordExpeditionToArchive, saveActiveGame } from '../src/engine/saveManager.ts';
import type { GameActionInput, GameState } from '../src/engine/types.ts';

let actionNo = 0;
const PLAYER = 'solo_player';
const storage = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  },
});

function action(state: GameState, input: GameActionInput): GameState {
  const result = resolveGameAction(state, {
    ...input, actionId: 'p004_' + (++actionNo), expectedVersion: state.version, playerId: PLAYER,
  });
  assert.equal(result.ok, true, result.error ?? 'Action rejected: ' + input.type);
  return result.state;
}

function resolveModal(state: GameState): GameState {
  for (let i = 0; i < 8 && (state.activeEvent || state.activePuzzle); i++) {
    if (state.activeEvent) {
      if (!state.activeEvent.resolved) {
        const event = EVENTS.find(e => e.id === state.activeEvent!.eventId);
        assert.ok(event);
        const choice = event.choices.find(c => !c.requiredItemId && !c.requiredFlag) ?? event.choices[0];
        state = action(state, { type: 'RESOLVE_EVENT_CHOICE', choiceId: choice.id });
      }
      if (state.activeEvent) state = action(state, { type: 'DISMISS_EVENT' });
    } else if (state.activePuzzle) {
      state = action(state, { type: 'CLOSE_PUZZLE' });
    }
  }
  assert.equal(state.activeEvent, null, 'Supernatural event must resolve without soft lock');
  assert.equal(state.activePuzzle, null, 'Puzzle must close without soft lock');
  return state;
}

function pathTo(state: GameState, from: string, dest: string): string[] | null {
  if (from === dest) return [];
  const queue: string[][] = [[from]];
  const seen = new Set([from]);
  for (let i = 0; i < queue.length; i++) {
    const path = queue[i];
    const last = path[path.length - 1];
    for (const next of getAccessibleRoomIds(state, last, state.players[0])) {
      if (seen.has(next)) continue;
      const nextPath = [...path, next];
      if (next === dest) return nextPath.slice(1);
      seen.add(next);
      queue.push(nextPath);
    }
  }
  return null;
}

function createNaturallyTriggeredMidnight(): { state: GameState; seed: string; attempts: number } {
  const observations: Record<string, number> = {};
  for (let seedNumber = 1; seedNumber <= 80; seedNumber++) {
    const seed = 'P004-LMID-' + String(seedNumber).padStart(3, '0');
    let state = createNewGame({
      seed, expeditionSize: 'short',
      players: [{ id: PLAYER, characterId: 'locksmith', displayName: 'Maren' }],
    });
    try {
      for (let n = 0; n < 220 && state.phase === 'exploration'; n++) {
        state = resolveModal(state);
        if (state.phase !== 'exploration') break;
        const player = state.players[0];
        if (player.actionPoints === 0) {
          state = action(state, { type: 'END_TURN' });
          continue;
        }
        const room = state.rooms[player.roomId];
        if (!room.searched) {
          state = action(state, { type: 'SEARCH_ROOM' });
          continue;
        }
        const door = room.doors.find(dir => !room.connectedTo[dir]);
        if (door) {
          const result = resolveGameAction(state, {
            type: 'DISCOVER_ROOM', direction: door,
            actionId: 'p004_' + (++actionNo), expectedVersion: state.version, playerId: PLAYER,
          });
          if (result.ok) {
            state = result.state;
            continue;
          }
        }
        const nextRoom = state.roomOrder
          .filter(id => state.rooms[id].doors.some(d => !state.rooms[id].connectedTo[d]))
          .map(id => ({ id, path: pathTo(state, player.roomId, id) }))
          .filter((v): v is { id: string; path: string[] } => v.path !== null && v.path.length > 0)
          .sort((a,b) => a.path.length - b.path.length || a.id.localeCompare(b.id))[0];
        if (nextRoom) state = action(state, { type: 'MOVE_ROOM', targetRoomId: nextRoom.path[0] });
        else state = action(state, { type: 'END_TURN' });
      }
      if (state.phase === 'revelation' && state.scenario) {
        observations[state.scenario.id] = (observations[state.scenario.id] ?? 0) + 1;
        if (state.scenario.id === 'the_last_midnight') {
          console.log('NATURAL_TRIGGER', JSON.stringify({ seed, turns: state.turn, rooms: state.roomOrder.length, omens: state.omensFound.length, actionNo }));
          return { state, seed, attempts: seedNumber };
        }
      }
    } catch (error) {
      console.log('SEED_REJECTED', seed, String(error));
    }
  }
  throw new Error('No deterministic Last Midnight trigger in 80 seeds; observed: ' + JSON.stringify(observations));
}

export function makeLastMidnightFixture(): { state: GameState; seed: string; attempts: number } {
  return createNaturallyTriggeredMidnight();
}

function run(): void {
  const { state: initial, seed, attempts } = makeLastMidnightFixture();
  assert.equal(initial.scenario?.id, 'the_last_midnight');
  assert.equal(initial.scenario.goal, 3);
  assert.equal(initial.scenario.countdown, 11);
  const clocks = Object.values(initial.rooms).filter(r => r.hasClockMechanism);
  assert.equal(clocks.length, 3, 'Three distinct clock rooms must be placed');
  assert.equal(new Set(clocks.map(c => c.id)).size, 3);
  assert.ok(clocks.every(c => pathTo(initial, initial.players[0].roomId, c.id) !== null));

  let win = structuredClone(initial);
  let aligned = 0;
  let saveVerified = false;
  for (let step = 0; step < 220 && win.phase === 'revelation'; step++) {
    win = resolveModal(win);
    if (win.phase !== 'revelation') break;
    const player = win.players[0];
    if (player.actionPoints === 0) {
      win = action(win, { type: 'END_TURN' });
      continue;
    }
    const current = win.rooms[player.roomId];
    if (current.hasClockMechanism && !current.clockAligned) {
      win = action(win, { type: 'SCENARIO_ACTION', subAction: 'align_clock' });
      aligned = Object.values(win.rooms).filter(r => r.clockAligned).length;
      if (aligned === 1 && !saveVerified) {
        const payload = exportSaveJson(win);
        const parsed = importSaveJson(payload);
        assert.equal(parsed.ok, true);
        if (parsed.ok) {
          assert.equal(saveActiveGame(parsed.state), true);
          const restored = loadActiveGame();
          assert.equal(restored.ok, true);
          if (restored.ok) {
            assert.equal(restored.state.version, win.version);
            assert.equal(restored.state.scenario?.id, 'the_last_midnight');
            assert.equal(restored.state.players[0].roomId, win.players[0].roomId);
            win = restored.state;
          }
        }
        saveVerified = true;
      }
      continue;
    }
    const nearest = Object.values(win.rooms)
      .filter(r => r.hasClockMechanism && !r.clockAligned)
      .map(r => ({ id: r.id, path: pathTo(win, player.roomId, r.id) }))
      .filter((v): v is { id: string; path: string[] } => v.path !== null)
      .sort((a,b) => a.path.length - b.path.length || a.id.localeCompare(b.id))[0];
    if (!nearest) throw new Error('Unreachable clock before terminal state');
    if (nearest.path.length) win = action(win, { type: 'MOVE_ROOM', targetRoomId: nearest.path[0] });
    else throw new Error('Expected alignable clock in player room');
  }
  assert.equal(win.phase, 'ended', 'Victory journey must reach an ending');
  assert.equal(win.ending?.victory, true, 'Expected explorer victory; saw: ' + win.ending?.title);
  assert.equal(win.ending?.scenarioId, 'the_last_midnight');
  assert.equal(aligned, 3);
  assert.equal(saveVerified, true, 'Mid-revelation v1 save/resume must work');
  assert.ok(recordExpeditionToArchive(win));
  assert.ok(loadArchive().some(e => e.seed === seed && e.victory), 'Winning expedition must appear in archive');

  let loss = structuredClone(initial);
  for (let i = 0; i < 25 && loss.phase === 'revelation'; i++) {
    loss = resolveModal(loss);
    if (loss.phase === 'revelation') loss = action(loss, { type: 'END_TURN' });
  }
  assert.equal(loss.phase, 'ended', 'Countdown must terminate the loss journey');
  assert.equal(loss.ending?.victory, false);
  assert.equal(loss.ending?.scenarioId, 'the_last_midnight');
  console.log('PASS: P004 Last Midnight legal trigger, 3 accessible clocks, victory, defeat, mid-run v1 save/resume and archive', JSON.stringify({
    seed, attempts, initialTurn: initial.turn, winTurn: win.turn, lossTurn: loss.turn, aligned,
  }));
}

if (process.argv[1]?.endsWith('verify_last_midnight.ts')) run();

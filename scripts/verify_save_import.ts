import assert from 'node:assert/strict';
import { createNewGame } from '../src/engine/actionResolver.ts';
import {
  exportSaveJson,
  importSaveJson,
  loadActiveGame,
  saveActiveGame,
  validateSaveObject,
} from '../src/engine/saveManager.ts';

const values = new Map<string, string>();
let writes = 0;
let denyWrites = false;
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { if (denyWrites) throw new Error('QuotaExceededError'); writes++; values.set(key, value); },
    removeItem: (key: string) => { if (denyWrites) throw new Error('StorageDenied'); writes++; values.delete(key); },
  },
});

const original = createNewGame({
  seed: 'SAVE-GATE-ORIGINAL',
  players: [{ id: 'solo', displayName: 'Explorer', characterId: 'archivist' }],
});
const candidate = createNewGame({
  seed: 'SAVE-GATE-IMPORT',
  players: [{ id: 'solo', displayName: 'Explorer', characterId: 'locksmith' }],
});
assert.equal(saveActiveGame(original), true);
const before = values.get('thtr_active_save_v1');
const previousWriteCount = writes;
assert.ok(before);

const exported = exportSaveJson(candidate);
const staged = importSaveJson(exported);
assert.equal(staged.ok, true, 'Valid v1 save should stage successfully');
assert.equal(writes, previousWriteCount, 'Staging must NEVER write browser storage');
assert.equal(values.get('thtr_active_save_v1'), before, 'Cancel must leave original bytes untouched');

const damaged = JSON.parse(exported) as { schemaVersion: number; gameState: Record<string, any> };
damaged.gameState.players[0].roomId = 'room_missing';
assert.equal(validateSaveObject(damaged).ok, false, 'Unknown player room must fail');
damaged.gameState.players[0].roomId = 'room_entrance';
damaged.gameState.rooms.room_entrance.connectedTo.N = 'room_missing';
assert.equal(validateSaveObject(damaged).ok, false, 'Broken room graph must fail');
damaged.gameState.rooms.room_entrance.connectedTo.N = 'room_staircase';
damaged.gameState.players[0].inventory = ['unrecognized_artifact'];
assert.equal(validateSaveObject(damaged).ok, false, 'Unknown nested item must fail');

assert.equal(importSaveJson('{ invalid').ok, false, 'Invalid JSON must fail');
assert.equal(importSaveJson(' '.repeat(1_048_577)).ok, false, 'Oversize input must fail before parsing');
assert.equal(importSaveJson(JSON.stringify({schemaVersion: 99, gameState: candidate})).ok, false, 'Unknown schema must fail');
assert.equal(writes, previousWriteCount, 'Rejected inputs must never write storage');

assert.equal(saveActiveGame(candidate), true, 'Explicitly confirmed import can be saved');
const loaded = loadActiveGame();
assert.equal(loaded.ok, true, 'Valid v1 should resume');
if (loaded.ok) {
  assert.equal(loaded.state.seed, candidate.seed);
  assert.equal(loaded.state.turn, candidate.turn);
  assert.equal(loaded.state.players[0].roomId, candidate.players[0].roomId);
}

const beforeFailure = values.get('thtr_active_save_v1');
denyWrites = true;
assert.equal(saveActiveGame(original), false, 'Quota error must be reported to UI');
assert.equal(values.get('thtr_active_save_v1'), beforeFailure, 'Failed autosave must not overwrite old bytes');
denyWrites = false;
console.log('PASS: side-effect-free import; invalid nested saves; v1 round-trip; storage refusal preserves old save.');

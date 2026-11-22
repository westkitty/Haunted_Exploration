import { CHARACTERS } from './characters.ts';
import { ROOM_TEMPLATES } from './rooms.ts';
import { ITEMS, OMENS, CLUES, PUZZLES } from './itemsAndOmens.ts';
import { EVENTS } from './events.ts';
import { OPPOSITE_DIR, DIR_OFFSET } from './mansionGenerator.ts';
import type { Direction } from './types.ts';

type RecordValue = Record<string, unknown>;
const isRecord = (v: unknown): v is RecordValue =>
  v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, max = 512): v is string =>
  typeof v === 'string' && v.length <= max;
const num = (v: unknown, lo: number, hi: number): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const integer = (v: unknown, lo = 0, hi = 1_000_000_000) =>
  num(v, lo, hi) && Number.isInteger(v);
const stringArray = (v: unknown, max = 500, width = 512): v is string[] =>
  Array.isArray(v) && v.length <= max && v.every(x => str(x, width));
const hasOnlyStrings = (v: unknown, allowed: Set<string>, max = 500) =>
  stringArray(v, max) && v.every(x => allowed.has(x));
const floors = new Set([-1, 0, 1]);
const dirs = new Set(['N', 'E', 'S', 'W']);
const phases = new Set(['exploration', 'revelation', 'ended']);
const scenarios = new Set(['the_house_has_chosen', 'the_last_midnight', 'the_mirror_jury', 'the_heart_beneath']);
const roles = new Set(['explorer', 'chosen', 'mimic']);
const ghostTypes = new Set(['watcher', 'mourner', 'borrower', 'lantern_wisp', 'wall_choir']);
const ghostStates = new Set(['dormant', 'manifesting', 'observing', 'investigating', 'reacting', 'vanishing']);
const roomTemplates = new Set(ROOM_TEMPLATES.map(x => x.id));
const characters = new Set(CHARACTERS.map(x => x.id));
const items = new Set(ITEMS.map(x => x.id));
const omens = new Set(OMENS.map(x => x.id));
const clues = new Set(CLUES.map(x => x.id));
const events = new Set(EVENTS.map(x => x.id));
const puzzles = new Set(PUZZLES.map(x => x.id));
const anyString = (v: unknown, max = 512) => str(v, max);

/**
 * Boundary validation for untrusted JSON saves. Do not assume a TS cast validates JSON.
 * Returns the first structural violation, or null if the v1 state is compatible.
 * This checks identity, topology and runtime-critical nested fields; it does not
 * promise that a saved scenario is still winnable or that all story flags are canonical.
 */
export function validateSavedGameState(v: unknown): string | null {
  if (!isRecord(v)) return 'Game state is not an object.';
  if (v.schemaVersion !== 1 || !str(v.gameId, 128) || !str(v.seed, 128) ||
      !num(v.rngState, -4_294_967_296, 4_294_967_296) ||
      !integer(v.version) || !integer(v.turn, 1) ||
      !['short', 'standard', 'extended'].includes(String(v.expeditionSize)) ||
      typeof v.isMultiplayer !== 'boolean' || !phases.has(String(v.phase)) ||
      !integer(v.currentPlayerIndex, 0, 3) || !num(v.pressure, 0, 100) ||
      !num(v.revelationThreshold, 0, 100) || !integer(v.silenceCueCounter) ||
      typeof v.revelationJustTriggered !== 'boolean' ||
      !num(v.updatedAt, 0, 100_000_000_000_000)) {
    return 'Game header or counters are malformed.';
  }
  if (v.isMultiplayer) return 'Multiplayer state cannot be imported as a solo save.';
  if (!isRecord(v.rooms) || Object.keys(v.rooms).length < 5 || Object.keys(v.rooms).length > 300 ||
      !stringArray(v.roomOrder, 300) || v.roomOrder.length !== Object.keys(v.rooms).length ||
      new Set(v.roomOrder).size !== v.roomOrder.length ||
      !v.roomOrder.includes('room_entrance') ||
      v.roomOrder.some(id => !Object.hasOwn(v.rooms as RecordValue, id))) {
    return 'Room inventory or discovery order is invalid.';
  }
  const rooms = v.rooms as RecordValue;
  const occupied = new Set<string>();
  for (const [id, raw] of Object.entries(rooms)) {
    if (!isRecord(raw) || raw.id !== id || !roomTemplates.has(String(raw.templateId)) ||
        !str(raw.name, 256) || !floors.has(raw.floor as number) ||
        !integer(raw.x, -1000, 1000) || !integer(raw.z, -1000, 1000) ||
        !integer(raw.rotation, 0, 3) ||
        !stringArray(raw.doors, 4) || raw.doors.some(d => !dirs.has(d)) ||
        new Set(raw.doors).size !== raw.doors.length ||
        !isRecord(raw.connectedTo) || !stringArray(raw.stairLinks, 10) ||
        !str(raw.discoveredByPlayerId, 128) || !integer(raw.discoveredOnTurn) ||
        typeof raw.searched !== 'boolean' ||
        !stringArray(raw.inspectedIds, 200) || !stringArray(raw.solvedPuzzleIds, 100) ||
        !integer(raw.alteredCount) || !integer(raw.revisitCount)) {
      return 'Malformed room: ' + id;
    }
    const coord = String(raw.floor) + ':' + raw.x + ':' + raw.z;
    if (occupied.has(coord)) return 'Overlapping rooms: ' + id;
    occupied.add(coord);
    if (!hasOnlyStrings(raw.solvedPuzzleIds, puzzles, 100)) return 'Unknown solved puzzle in ' + id;
    for (const [direction, dest] of Object.entries(raw.connectedTo)) {
      if (!dirs.has(direction) || !raw.doors.includes(direction) ||
          !str(dest, 128) || !isRecord(rooms[dest])) return 'Broken doorway in ' + id;
      const neighbor = rooms[dest] as RecordValue;
      const reverse = OPPOSITE_DIR[direction as Direction];
      const delta = DIR_OFFSET[direction as Direction];
      if (!isRecord(neighbor.connectedTo) || neighbor.connectedTo[reverse] !== id ||
          neighbor.floor !== raw.floor || neighbor.x !== (raw.x as number) + delta.dx ||
          neighbor.z !== (raw.z as number) + delta.dz) return 'Nonreciprocal doorway in ' + id;
    }
    for (const link of raw.stairLinks as string[]) {
      const target = rooms[link];
      if (!isRecord(target) || !stringArray(target.stairLinks, 10) ||
          !target.stairLinks.includes(id) || target.floor === raw.floor)
        return 'Broken stair link in ' + id;
    }
  }
  // All placed rooms must be reachable from the entrance through actual links.
  const seen = new Set<string>(['room_entrance']);
  const queue = ['room_entrance'];
  for (let index = 0; index < queue.length; index++) {
    const room = rooms[queue[index]] as RecordValue;
    const links = [...Object.values(room.connectedTo as RecordValue), ...(room.stairLinks as string[])];
    for (const next of links) if (typeof next === 'string' && !seen.has(next)) {
      seen.add(next);
      queue.push(next);
    }
  }
  if (seen.size !== Object.keys(rooms).length) return 'Disconnected room graph.';
  if (!Array.isArray(v.players) || v.players.length !== 1 || v.currentPlayerIndex !== 0)
    return 'Solo save must contain exactly one active explorer.';
  const player = v.players[0];
  if (!isRecord(player) || !str(player.id, 128) || !str(player.displayName, 128) ||
      !characters.has(String(player.characterId)) ||
      !Object.hasOwn(rooms, String(player.roomId)) ||
      !isRecord(player.stats) || !['body', 'grace', 'insight', 'nerve'].every(k => num(player.stats[k], -10, 30)) ||
      !num(player.maxHealth, 1, 100) || !num(player.health, 0, player.maxHealth as number) ||
      !num(player.maxFear, 1, 100) || !num(player.fear, 0, player.maxFear as number) ||
      !num(player.maxActionPoints, 1, 20) || !num(player.actionPoints, 0, player.maxActionPoints as number) ||
      !hasOnlyStrings(player.inventory, items, 100) ||
      !hasOnlyStrings(player.omens, omens, 100) ||
      !stringArray(player.conditions, 100) || !num(player.nextRollBonus, -50, 50) ||
      typeof player.alive !== 'boolean' || typeof player.escaped !== 'boolean' ||
      typeof player.connected !== 'boolean' || !roles.has(String(player.role)) ||
      !stringArray(player.pathHistory, 2000) ||
      player.pathHistory.some((id: string) => !Object.hasOwn(rooms, id)) ||
      !integer(player.soloTurnsCount)) {
    return 'Malformed explorer state.';
  }
  if (!hasOnlyStrings(v.omensFound, omens) || !hasOnlyStrings(v.cluesFound, clues) ||
      !hasOnlyStrings(v.usedEventIds, events) || !stringArray(v.memoryFlags) ||
      !stringArray(v.processedActionIds, 2000)) return 'Malformed discovery collections.';
  if (!Array.isArray(v.journal) || v.journal.length > 200 ||
      v.journal.some(j => !isRecord(j) || !str(j.id, 128) || !integer(j.turn) ||
        !str(j.title, 300) || !str(j.text, 4000))) return 'Malformed journal.';
  if (!isRecord(v.attention) || !num(v.attention.level, 0, 100) ||
      !integer(v.attention.isolationScore) || !integer(v.attention.disturbanceScore) ||
      !integer(v.attention.solidarityScore) ||
      !(v.attention.corridorHabitRoomId === null || (str(v.attention.corridorHabitRoomId, 128) && Object.hasOwn(rooms, v.attention.corridorHabitRoomId))) ||
      !integer(v.attention.corridorHabitCount) ||
      !['watchful', 'curious', 'possessive', 'hostile'].includes(String(v.attention.temperament)) ||
      !str(v.attention.recentSignal, 2000)) return 'Malformed House Attention state.';
  if (!Array.isArray(v.ghosts) || v.ghosts.length > 300 || v.ghosts.some(g =>
    !isRecord(g) || !str(g.id, 128) || !ghostTypes.has(String(g.archetype)) ||
    !str(g.name, 256) || !Object.hasOwn(rooms, String(g.roomId)) ||
    !ghostStates.has(String(g.state)) ||
    !['hostile','neutral','curious','helpful'].includes(String(g.disposition)) ||
    !integer(g.observedCount) || typeof g.soothed !== 'boolean' ||
    !str(g.lastActionNote, 2000))) return 'Malformed ghost state.';
  if (v.activeEvent !== null && (!isRecord(v.activeEvent) ||
      !events.has(String(v.activeEvent.eventId)) ||
      !Object.hasOwn(rooms, String(v.activeEvent.roomId)) ||
      v.activeEvent.triggeredByPlayerId !== player.id ||
      typeof v.activeEvent.resolved !== 'boolean')) return 'Malformed active event.';
  if (v.activePuzzle !== null && (!isRecord(v.activePuzzle) ||
      !puzzles.has(String(v.activePuzzle.puzzleId)) ||
      !Object.hasOwn(rooms, String(v.activePuzzle.roomId)) ||
      !str(v.activePuzzle.interactableId, 256) ||
      !integer(v.activePuzzle.attempts))) return 'Malformed active puzzle.';
  if (v.scenario !== null && (!isRecord(v.scenario) ||
      !scenarios.has(String(v.scenario.id)) ||
      !integer(v.scenario.countdown) || !integer(v.scenario.maxCountdown) ||
      !integer(v.scenario.progress) || !integer(v.scenario.goal) ||
      !str(v.scenario.title, 300) || !str(v.scenario.publicObjective, 4000) ||
      typeof v.scenario.betrayerRevealed !== 'boolean')) return 'Malformed Revelation state.';
  if (v.phase === 'revelation' && v.scenario === null) return 'Missing active Revelation.';
  if (v.lastRoomDiscoveredId !== null && !Object.hasOwn(rooms, String(v.lastRoomDiscoveredId)))
    return 'Unknown last discovered room.';
  if (v.ending !== null && (!isRecord(v.ending) ||
      typeof v.ending.victory !== 'boolean' || !str(v.ending.title, 300) ||
      !str(v.ending.epilogue, 8000))) return 'Malformed ending.';
  return null;
}

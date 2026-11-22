import type {
  ActionResult,
  DiceRollRecord,
  Direction,
  ExpeditionSize,
  GameAction,
  GameState,
  JournalEntry,
  OutcomeEffect,
  PlacedRoom,
  PlayerState,
  TraitName,
} from './types.ts';
import { getCharacterById } from './characters.ts';
import { getRoomTemplate } from './rooms.ts';
import { CLUES, ITEMS, OMENS, getClueById, getItemById, getOmenById, getPuzzleById } from './itemsAndOmens.ts';
import { EVENTS, getEventById } from './events.ts';
import { SCENARIOS, selectScenarioForState } from './scenarios.ts';
import { advanceGhostsOnTurnEnd, createGhostInstance } from './ghosts.ts';
import { createStartingMansion, discoverRoomThroughDoor } from './mansionGenerator.ts';
import { SeededRng, generateReadableSeed } from './seededRandom.ts';

export const CURRENT_SCHEMA_VERSION = 1;

export interface CreateGameOptions {
  seed?: string;
  expeditionSize?: ExpeditionSize;
  isMultiplayer?: boolean;
  players: { id: string; displayName: string; characterId: string }[];
}

function addJournal(
  state: GameState,
  entry: Omit<JournalEntry, 'id' | 'turn'>
): void {
  state.journal.unshift({
    id: `j_${state.turn}_${state.version}_${state.journal.length}`,
    turn: state.turn,
    ...entry,
  });
  if (state.journal.length > 90) {
    state.journal.length = 90;
  }
}

export function createNewGame(options: CreateGameOptions): GameState {
  const seed = (options.seed?.trim() || generateReadableSeed()).toUpperCase();
  const rng = new SeededRng(seed);
  const expeditionSize: ExpeditionSize = options.expeditionSize ?? 'standard';
  const revelationThreshold =
    expeditionSize === 'short' ? 42 : expeditionSize === 'extended' ? 75 : 58;

  const firstId = options.players[0]?.id ?? 'solo_player';
  const { rooms, roomOrder } = createStartingMansion(firstId);

  const players: PlayerState[] = options.players.map((p) => {
    const def = getCharacterById(p.characterId);
    return {
      id: p.id,
      displayName: p.displayName.trim() || def.name,
      characterId: def.id,
      roomId: 'room_entrance',
      stats: { ...def.stats },
      health: def.maxHealth,
      maxHealth: def.maxHealth,
      fear: 0,
      maxFear: def.maxSanity,
      actionPoints: 3,
      maxActionPoints: 3,
      inventory: [def.startingItemId],
      omens: [],
      conditions: [],
      nextRollBonus: 0,
      alive: true,
      escaped: false,
      connected: true,
      role: 'explorer',
      pathHistory: ['room_entrance'],
      soloTurnsCount: 0,
    };
  });

  // Seed one initial subtle spirit in the Pendulum Vestibule or Upper Landing
  const initialGhost = createGhostInstance('lantern_wisp', 'room_vestibule', rng);

  const state: GameState = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    gameId: `exp_${rng.int(100000, 999999)}`,
    seed,
    rngState: rng.getState(),
    version: 1,
    expeditionSize,
    isMultiplayer: Boolean(options.isMultiplayer),
    phase: 'exploration',
    turn: 1,
    currentPlayerIndex: 0,
    players,
    rooms,
    roomOrder,
    ghosts: [initialGhost],
    pressure: 6,
    revelationThreshold,
    omensFound: [],
    cluesFound: [],
    usedEventIds: [],
    memoryFlags: [],
    attention: {
      level: 8,
      isolationScore: 0,
      disturbanceScore: 0,
      solidarityScore: 0,
      corridorHabitRoomId: null,
      corridorHabitCount: 0,
      temperament: 'watchful',
      recentSignal: 'The front bolts drew shut the moment you crossed the marble threshold.',
    },
    activeEvent: null,
    activePuzzle: null,
    scenario: null,
    lastDiceRoll: null,
    journal: [
      {
        id: 'j_init',
        turn: 1,
        category: 'discovery',
        title: 'Expedition Begun',
        text: `Seed ${seed}. The oak doors of the Grand Entrance Hall latched behind you. Explore adjacent doorways, uncover clues and omens, and prepare for what the house intends.`,
        roomId: 'room_entrance',
      },
    ],
    processedActionIds: [],
    lastRoomDiscoveredId: null,
    revelationJustTriggered: false,
    silenceCueCounter: 0,
    ending: null,
    updatedAt: Date.now(),
  };

  return state;
}

export function getActivePlayer(state: GameState): PlayerState {
  return state.players[state.currentPlayerIndex] ?? state.players[0];
}

export function getAccessibleRoomIds(state: GameState, fromRoomId: string, player?: PlayerState): string[] {
  const room = state.rooms[fromRoomId];
  if (!room) return [];
  const results: string[] = [];
  const canPickLocks = player?.characterId === 'locksmith' || player?.inventory.includes('skeleton_keyring');

  for (const [dir, targetId] of Object.entries(room.connectedTo) as [Direction, string][]) {
    if (!targetId || !state.rooms[targetId]) continue;
    const isLocked = room.lockedDirections?.includes(dir);
    if (isLocked && !canPickLocks && player?.role !== 'chosen') continue;
    results.push(targetId);
  }
  for (const stairId of room.stairLinks) {
    if (state.rooms[stairId]) {
      results.push(stairId);
    }
  }
  return results;
}

function getEffectiveTraitBonus(player: PlayerState, trait: TraitName, room: PlacedRoom): {
  traitValue: number;
  itemModifier: number;
  fearPenalty: number;
} {
  const charDef = getCharacterById(player.characterId);
  const tpl = getRoomTemplate(room.templateId);

  let traitValue = player.stats[trait];
  let itemModifier = 0;

  for (const itemId of player.inventory) {
    const item = getItemById(itemId);
    if (item?.passiveTraitBonus?.[trait]) {
      itemModifier += item.passiveTraitBonus[trait]!;
    }
  }
  for (const omenId of player.omens) {
    const omen = getOmenById(omenId);
    if (omen?.passiveBonus?.[trait]) {
      itemModifier += omen.passiveBonus[trait]!;
    }
  }

  // Character passives & weaknesses
  if (charDef.id === 'archivist' && trait === 'insight') itemModifier += 1;
  if (charDef.id === 'archivist' && trait === 'body') itemModifier -= 1;
  if (charDef.id === 'locksmith' && trait === 'grace') itemModifier += 1;
  if (charDef.id === 'magician' && trait === 'grace') itemModifier += 1;
  if (charDef.id === 'heir' && (trait === 'nerve' || trait === 'body') && (tpl.geometry === 'foyer' || tpl.geometry === 'gallery' || tpl.geometry === 'dining')) {
    itemModifier += 1;
  }

  // Room conditions
  if (tpl.geometry === 'library' && trait === 'insight') itemModifier += 1;
  if (tpl.geometry === 'laboratory' && trait === 'insight') itemModifier += 1;
  if (tpl.geometry === 'ballroom' && trait === 'grace') itemModifier += 1;
  if (tpl.geometry === 'clockwork' && trait === 'grace') itemModifier += 1;
  if (tpl.geometry === 'flooded' && trait === 'grace') itemModifier -= 1;

  // High Fear meaningfully strains Nerve & Insight checks
  let fearPenalty = 0;
  if (player.fear >= player.maxFear - 1) {
    fearPenalty = -2;
  } else if (player.fear >= Math.ceil(player.maxFear / 2)) {
    fearPenalty = -1;
  }

  return { traitValue, itemModifier, fearPenalty };
}

function performTraitCheck(
  state: GameState,
  player: PlayerState,
  room: PlacedRoom,
  trait: TraitName,
  target: number,
  reason: string,
  rng: SeededRng,
  extraBonus = 0
): DiceRollRecord {
  const dice = rng.roll2d6();
  const { traitValue, itemModifier, fearPenalty } = getEffectiveTraitBonus(player, trait, room);
  const bonusModifier = player.nextRollBonus + extraBonus;
  player.nextRollBonus = 0; // consumed

  const total = dice[0] + dice[1] + traitValue + itemModifier + fearPenalty + bonusModifier;
  const record: DiceRollRecord = {
    id: `roll_${state.version}_${rng.int(100, 999)}`,
    playerId: player.id,
    playerName: player.displayName,
    reason,
    trait,
    dice,
    traitValue,
    itemModifier,
    fearPenalty,
    bonusModifier,
    total,
    target,
    success: total >= target,
    timestamp: Date.now(),
  };
  state.lastDiceRoll = record;
  return record;
}

function updateHouseTemperament(state: GameState): void {
  const lvl = state.attention.level;
  if (lvl >= 70) state.attention.temperament = 'hostile';
  else if (lvl >= 45) state.attention.temperament = 'possessive';
  else if (lvl >= 22) state.attention.temperament = 'curious';
  else state.attention.temperament = 'watchful';
}

function adjustAttention(state: GameState, delta: number, signal?: string): void {
  state.attention.level = Math.max(0, Math.min(100, state.attention.level + delta));
  if (signal) state.attention.recentSignal = signal;
  updateHouseTemperament(state);
}

function grantRandomItem(state: GameState, player: PlayerState, rng: SeededRng): string | null {
  const owned = new Set(state.players.flatMap((p) => p.inventory));
  const pool = ITEMS.filter((i) => !owned.has(i.id));
  const chosen = pool.length > 0 ? rng.pick(pool) : rng.pick(ITEMS);
  if (!player.inventory.includes(chosen.id)) {
    player.inventory.push(chosen.id);
  }
  return chosen.name;
}

function grantRandomClue(state: GameState, rng: SeededRng, preferredClueId?: string): string | null {
  if (preferredClueId && !state.cluesFound.includes(preferredClueId)) {
    const c = getClueById(preferredClueId);
    if (c) {
      state.cluesFound.push(c.id);
      if (c.id === 'clue_impossible_geometry') {
        const active = getActivePlayer(state);
        active.stats.insight = Math.min(7, active.stats.insight + 1);
      }
      return c.title;
    }
  }
  const remaining = CLUES.filter((c) => !state.cluesFound.includes(c.id));
  if (remaining.length === 0) return null;
  const chosen = rng.pick(remaining);
  state.cluesFound.push(chosen.id);
  return chosen.title;
}

function grantOmen(state: GameState, player: PlayerState, rng: SeededRng): string | null {
  const remaining = OMENS.filter((o) => !state.omensFound.includes(o.id));
  if (remaining.length === 0) {
    state.pressure = Math.min(100, state.pressure + 12);
    return null;
  }
  const chosen = rng.pick(remaining);
  state.omensFound.push(chosen.id);
  player.omens.push(chosen.id);
  state.pressure = Math.min(100, state.pressure + chosen.pressureGain);
  state.attention.disturbanceScore += 2;
  const extraAttn = player.characterId === 'medium' ? 6 : 4;
  adjustAttention(state, extraAttn, `${player.displayName} claimed the omen "${chosen.name}".`);
  addJournal(state, {
    category: 'omen',
    title: `Omen Claimed: ${chosen.name}`,
    text: `${chosen.description} ${chosen.whisper}`,
    roomId: player.roomId,
    playerId: player.id,
  });
  return chosen.name;
}

function applyOutcomeEffect(
  state: GameState,
  player: PlayerState,
  effect: OutcomeEffect | undefined,
  rng: SeededRng
): string[] {
  if (!effect) return [];
  const summary: string[] = [];

  if (effect.healthDelta) {
    player.health = Math.max(0, Math.min(player.maxHealth, player.health + effect.healthDelta));
    summary.push(effect.healthDelta > 0 ? `+${effect.healthDelta} Health` : `${effect.healthDelta} Health`);
  }
  if (effect.fearDelta) {
    player.fear = Math.max(0, Math.min(player.maxFear, player.fear + effect.fearDelta));
    summary.push(effect.fearDelta > 0 ? `+${effect.fearDelta} Fear` : `${effect.fearDelta} Fear`);
  }
  if (effect.apDelta) {
    player.actionPoints = Math.max(0, player.actionPoints + effect.apDelta);
    summary.push(effect.apDelta > 0 ? `+${effect.apDelta} AP` : `${effect.apDelta} AP`);
  }
  if (effect.pressureDelta) {
    state.pressure = Math.max(0, Math.min(100, state.pressure + effect.pressureDelta));
    summary.push(effect.pressureDelta > 0 ? `+${effect.pressureDelta} Pressure` : `${effect.pressureDelta} Pressure`);
  }
  if (effect.attentionDelta) {
    adjustAttention(state, effect.attentionDelta);
  }
  if (effect.grantItemId) {
    const item = getItemById(effect.grantItemId);
    if (item && !player.inventory.includes(item.id)) {
      player.inventory.push(item.id);
      summary.push(`Item: ${item.name}`);
    }
  }
  if (effect.grantRandomItem) {
    const name = grantRandomItem(state, player, rng);
    if (name) summary.push(`Item: ${name}`);
  }
  if (effect.grantOmen) {
    const name = grantOmen(state, player, rng);
    if (name) summary.push(`Omen: ${name}`);
  }
  if (effect.grantClueId) {
    const title = grantRandomClue(state, rng, effect.grantClueId);
    if (title) summary.push(`Clue: ${title}`);
  } else if (effect.grantRandomClue) {
    const title = grantRandomClue(state, rng);
    if (title) summary.push(`Clue: ${title}`);
  }
  if (effect.setFlag && !state.memoryFlags.includes(effect.setFlag)) {
    state.memoryFlags.push(effect.setFlag);
    addJournal(state, {
      category: 'memory',
      title: 'The House Remembers',
      text: effect.logNote || `Recorded memory mark: ${effect.setFlag.replace(/_/g, ' ')}.`,
      roomId: player.roomId,
      playerId: player.id,
    });
  }
  if (effect.spawnGhost) {
    const existingSame = state.ghosts.find(
      (g) => g.archetype === effect.spawnGhost && g.roomId === player.roomId
    );
    if (!existingSame) {
      const ghost = createGhostInstance(effect.spawnGhost, player.roomId, rng, player.id);
      state.ghosts.push(ghost);
      summary.push(`Manifested: ${ghost.name}`);
    }
  }
  if (effect.statBoost) {
    for (const [k, v] of Object.entries(effect.statBoost) as [TraitName, number][]) {
      player.stats[k] = Math.min(7, player.stats[k] + v);
      summary.push(`+${v} ${k.toUpperCase()}`);
    }
  }

  // Collapse check if health reaches 0 or fear maxes out in Revelation
  if (player.health <= 0) {
    player.alive = false;
    player.conditions.push('Incapacitated');
    addJournal(state, {
      category: 'action',
      title: `${player.displayName} Collapsed`,
      text: `${player.displayName} succumbed to physical injury inside ${state.rooms[player.roomId]?.name ?? 'the mansion'}.`,
      roomId: player.roomId,
    });
  }

  return summary;
}

/**
 * Escalating deterministic rules-based Revelation trigger check.
 * Fires once Supernatural Pressure crosses the visible threshold OR 3+ Omens are uncovered and a deterministic check crosses.
 */
function checkAndTriggerRevelation(state: GameState, rng: SeededRng): boolean {
  if (state.phase !== 'exploration') return false;

  const omenCount = state.omensFound.length;
  const reachedThreshold = state.pressure >= state.revelationThreshold;
  const omenTrigger = omenCount >= 3 && state.pressure >= Math.floor(state.revelationThreshold * 0.72);
  const deepExplorationTrigger = state.roomOrder.length >= 11 && state.pressure >= 36;

  if (!reachedThreshold && !omenTrigger && !deepExplorationTrigger) {
    return false;
  }

  const scenarioId = selectScenarioForState(state);
  const def = SCENARIOS[scenarioId];

  // Determine betrayer in multiplayer when applicable
  let betrayerId: string | null = null;
  if (def.hasBetrayerInMultiplayer && state.players.length >= 2) {
    // Weighted toward Estate Heir or player holding the most omens / highest solo isolation
    const scored = state.players.map((p) => {
      let score = p.omens.length * 3 + p.soloTurnsCount;
      if (p.characterId === 'heir') score += 2;
      if (state.memoryFlags.includes('bargained_with_house')) score += 2;
      return { p, score };
    });
    scored.sort((a, b) => b.score - a.score);
    betrayerId = scored[0].p.id;
    const role = scenarioId === 'the_mirror_jury' ? 'mimic' : 'chosen';
    for (const p of state.players) {
      if (p.id === betrayerId) {
        p.role = role;
        p.privateObjective =
          role === 'mimic' ? def.mimicPrivateObjective : def.chosenPrivateObjective;
      } else {
        p.role = 'explorer';
        p.privateObjective = def.publicObjective;
      }
    }
  } else {
    for (const p of state.players) {
      p.role = 'explorer';
      p.privateObjective = def.soloObjective;
    }
  }

  state.phase = 'revelation';
  state.revelationJustTriggered = true;
  state.silenceCueCounter += 1;
  state.scenario = {
    id: scenarioId,
    title: def.title,
    subtitle: def.subtitle,
    publicObjective: state.players.length >= 2 ? def.publicObjective : def.soloObjective,
    alteredRuleText: def.alteredRuleText,
    countdown: def.countdownTurns,
    maxCountdown: def.countdownTurns,
    progress: 0,
    goal: def.goalCount,
    betrayerPlayerId: betrayerId,
    betrayerRevealed: false,
    falseAccusations: 0,
  };

  // Seed scenario-specific markers across existing reachable rooms (guaranteeing solvability!)
  const candidateRoomIds = state.roomOrder.filter((id) => id !== 'room_entrance');
  const shuffled = rng.shuffle(candidateRoomIds);
  const pickRooms = (count: number) => {
    const out: PlacedRoom[] = [];
    for (const id of shuffled) {
      if (out.length >= count) break;
      out.push(state.rooms[id]);
    }
    while (out.length < count && state.roomOrder.length > 0) {
      out.push(state.rooms[state.roomOrder[out.length % state.roomOrder.length]]);
    }
    return out;
  };

  if (scenarioId === 'the_house_has_chosen') {
    for (const r of pickRooms(3)) {
      r.hasAnchor = true;
      r.anchorDisabled = false;
    }
    state.ghosts.push(createGhostInstance('watcher', shuffled[0] ?? 'room_vestibule', rng));
  } else if (scenarioId === 'the_last_midnight') {
    for (const r of pickRooms(3)) {
      r.hasClockMechanism = true;
      r.clockAligned = false;
    }
    // Darken several non-conservatory rooms for the altered rule
    for (const r of shuffled.slice(0, 3)) {
      const room = state.rooms[r];
      if (room && room.templateId !== 'glass_conservatory' && room.templateId !== 'grand_entrance_hall') {
        room.darkened = true;
      }
    }
    state.ghosts.push(createGhostInstance('wall_choir', shuffled[0] ?? 'room_staircase', rng));
  } else if (scenarioId === 'the_mirror_jury') {
    for (const r of pickRooms(3)) {
      r.hasReflectionProof = true;
      r.reflectionGathered = false;
    }
    state.ghosts.push(
      createGhostInstance('borrower', shuffled[0] ?? 'room_vestibule', rng, state.players[0]?.id)
    );
  } else if (scenarioId === 'the_heart_beneath') {
    const basementRooms = state.roomOrder
      .map((id) => state.rooms[id])
      .filter((r) => r.floor === -1);
    const heartRoom = basementRooms[basementRooms.length - 1] ?? state.rooms.room_basement_landing;
    if (heartRoom) {
      heartRoom.isHeartChamber = true;
      state.scenario.heartRoomId = heartRoom.id;
      state.ghosts.push(createGhostInstance('mourner', heartRoom.id, rng));
    }
  }

  addJournal(state, {
    category: 'revelation',
    title: `THE REVELATION: ${def.title}`,
    text: `${def.description} ${def.alteredRuleText}`,
  });

  return true;
}

function finalizeEnding(
  state: GameState,
  victory: boolean,
  winningSide: 'explorers' | 'house' | 'chosen' | 'pact',
  customTitle?: string,
  customEpilogue?: string
): void {
  const scen = state.scenario ? SCENARIOS[state.scenario.id] : null;
  let title = customTitle ?? 'The Expedition Concludes';
  let epilogue = customEpilogue ?? 'The mansion falls silent once more.';

  if (!customTitle && scen) {
    if (winningSide === 'explorers') {
      title = scen.endingExplorersWin.title;
      epilogue = scen.endingExplorersWin.epilogue;
    } else if (winningSide === 'pact' && scen.endingPact) {
      title = scen.endingPact.title;
      epilogue = scen.endingPact.epilogue;
    } else if (winningSide === 'chosen' && scen.endingChosenWins) {
      title = scen.endingChosenWins.title;
      epilogue = scen.endingChosenWins.epilogue;
    } else {
      title = scen.endingHouseWins.title;
      epilogue = scen.endingHouseWins.epilogue;
    }
  }

  const betrayer = state.scenario?.betrayerPlayerId
    ? state.players.find((p) => p.id === state.scenario?.betrayerPlayerId)
    : undefined;

  state.phase = 'ended';
  state.activeEvent = null;
  state.activePuzzle = null;
  if (state.scenario) {
    state.scenario.betrayerRevealed = true;
  }

  const keyMoments = state.journal
    .filter((j) => ['revelation', 'omen', 'memory'].includes(j.category))
    .slice(0, 6)
    .map((j) => `${j.title}: ${j.text}`);

  state.ending = {
    victory,
    winningSide,
    title,
    epilogue,
    scenarioId: state.scenario?.id ?? null,
    turnsTaken: state.turn,
    roomsDiscovered: state.roomOrder.length,
    secretsFound: state.cluesFound.length + state.memoryFlags.length,
    keyMoments,
    betrayerName: betrayer?.displayName,
  };
}

function pickContextualEvent(state: GameState, room: PlacedRoom, rng: SeededRng): string | null {
  const tpl = getRoomTemplate(room.templateId);
  const unused = EVENTS.filter((ev) => {
    if (state.usedEventIds.includes(ev.id)) return false;
    if (ev.minPressure && state.pressure < ev.minPressure) return false;
    if (ev.requiredFlag && !state.memoryFlags.includes(ev.requiredFlag)) return false;
    if (ev.forbiddenFlag && state.memoryFlags.includes(ev.forbiddenFlag)) return false;
    return true;
  });

  const pool = unused.length > 0 ? unused : EVENTS.filter((ev) => !ev.requiredFlag);
  if (pool.length === 0) return null;

  const picked = rng.weightedPick(pool, (ev) => {
    let w = ev.isRare ? 2 : 6;
    if (ev.requiredFlag && state.memoryFlags.includes(ev.requiredFlag)) w += 18; // Make House Remembers payoffs feel dramatic!
    if (ev.preferredGeometries?.includes(tpl.geometry)) w += 8;
    if (tpl.eventCategories.includes(ev.category)) w += 4;
    if (ev.category === 'omen_echo' && state.phase === 'exploration' && state.omensFound.length < 3) {
      w += 5;
    }
    return w;
  });

  return picked.id;
}

/**
 * Authoritative deterministic action resolver.
 * Never mutates the input state directly; returns a fresh cloned state or error.
 */
export function resolveGameAction(prevState: GameState, action: GameAction): ActionResult {
  // 1. Duplicate action ID rejection (idempotency guard)
  if (prevState.processedActionIds.includes(action.actionId)) {
    return { ok: false, error: 'Duplicate action rejected.', state: prevState };
  }

  // 2. Expected state version check (stale command rejection)
  if (action.expectedVersion !== prevState.version) {
    return {
      ok: false,
      error: `Stale action version (expected ${prevState.version}, received ${action.expectedVersion}).`,
      state: prevState,
    };
  }

  if (prevState.phase === 'ended') {
    return { ok: false, error: 'This expedition has already ended.', state: prevState };
  }

  const state: GameState = structuredClone(prevState);
  state.revelationJustTriggered = false;
  state.lastRoomDiscoveredId = null;

  const activePlayer = getActivePlayer(state);
  if (!activePlayer || activePlayer.id !== action.playerId) {
    return { ok: false, error: 'It is not your turn.', state: prevState };
  }
  if (!activePlayer.alive) {
    return { ok: false, error: 'Incapacitated explorers cannot act.', state: prevState };
  }

  // Guard active event / puzzle resolution before other actions
  if (
    state.activeEvent &&
    !state.activeEvent.resolved &&
    action.type !== 'RESOLVE_EVENT_CHOICE'
  ) {
    return { ok: false, error: 'Resolve the current supernatural event first.', state: prevState };
  }
  if (
    state.activeEvent &&
    state.activeEvent.resolved &&
    action.type !== 'DISMISS_EVENT'
  ) {
    return { ok: false, error: 'Acknowledge the event outcome first.', state: prevState };
  }
  if (
    state.activePuzzle &&
    action.type !== 'SOLVE_PUZZLE' &&
    action.type !== 'CLOSE_PUZZLE'
  ) {
    return { ok: false, error: 'Complete or step away from the current mechanism first.', state: prevState };
  }

  const rng = new SeededRng(state.rngState);
  const currentRoom = state.rooms[activePlayer.roomId];
  let discoveredRoomId: string | undefined;
  let triggeredRevelation = false;
  let soundCue: ActionResult['soundCue'];
  let caption: string | undefined;

  const commit = (): ActionResult => {
    state.rngState = rng.getState();
    state.version += 1;
    state.updatedAt = Date.now();
    state.processedActionIds.push(action.actionId);
    if (state.processedActionIds.length > 60) {
      state.processedActionIds.shift();
    }

    // Check explorer wipeout loss condition
    const livingExplorers = state.players.filter((p) => p.alive && p.role === 'explorer');
    if (livingExplorers.length === 0) {
      finalizeEnding(
        state,
        false,
        state.scenario?.betrayerPlayerId ? 'chosen' : 'house'
      );
      soundCue = 'ending';
    }

    return {
      ok: true,
      state,
      discoveredRoomId,
      triggeredRevelation,
      soundCue,
      caption,
    };
  };

  switch (action.type) {
    case 'MOVE_ROOM': {
      if (activePlayer.actionPoints < 1) {
        return { ok: false, error: 'Not enough Action Points to move.', state: prevState };
      }
      const accessible = getAccessibleRoomIds(state, currentRoom.id, activePlayer);
      if (!accessible.includes(action.targetRoomId)) {
        return { ok: false, error: 'That room is not directly accessible.', state: prevState };
      }

      const destRoom = state.rooms[action.targetRoomId];
      activePlayer.roomId = destRoom.id;
      activePlayer.actionPoints -= 1;
      activePlayer.pathHistory.push(destRoom.id);
      destRoom.revisitCount += 1;

      // Track corridor habit for House's Attention
      if (destRoom.revisitCount >= 4 && state.attention.corridorHabitRoomId !== destRoom.id) {
        state.attention.corridorHabitRoomId = destRoom.id;
        state.attention.corridorHabitCount = destRoom.revisitCount;
        adjustAttention(
          state,
          4,
          `The house noticed you repeatedly relying on ${destRoom.name}.`
        );
      }

      // Impossible Room bonus AP once per visit
      if (destRoom.templateId === 'room_that_should_not_exist' && destRoom.revisitCount === 2) {
        activePlayer.actionPoints += 1;
        addJournal(state, {
          category: 'discovery',
          title: 'Folded Space',
          text: 'The Room That Should Not Exist stretches time inside its rafters (+1 AP).',
          roomId: destRoom.id,
        });
      }

      soundCue = 'step';
      caption = `Footsteps echo into ${destRoom.name}.`;
      return commit();
    }

    case 'DISCOVER_ROOM': {
      if (activePlayer.actionPoints < 1) {
        return { ok: false, error: 'Need at least 1 Action Point to open an unexplored doorway.', state: prevState };
      }
      if (!currentRoom.doors.includes(action.direction) || currentRoom.connectedTo[action.direction]) {
        return { ok: false, error: 'No unexplored doorway in that direction.', state: prevState };
      }

      const placed = discoverRoomThroughDoor(
        state.rooms,
        state.roomOrder,
        currentRoom,
        action.direction,
        activePlayer.id,
        state.turn,
        rng,
        state.attention.level
      );

      if (!placed) {
        return { ok: false, error: 'Unable to open doorway.', state: prevState };
      }

      const newRoom = placed.room;
      activePlayer.actionPoints -= 1;
      activePlayer.roomId = newRoom.id;
      activePlayer.pathHistory.push(newRoom.id);
      discoveredRoomId = newRoom.id;
      state.lastRoomDiscoveredId = newRoom.id;

      // Pressure increases slightly with each newly uncovered room
      const pressureBump =
        state.scenario?.id === 'the_house_has_chosen' ? 4 : 3;
      state.pressure = Math.min(100, state.pressure + pressureBump);
      adjustAttention(state, 3, `${activePlayer.displayName} opened the doorway into ${newRoom.name}.`);

      const tpl = getRoomTemplate(newRoom.templateId);
      addJournal(state, {
        category: 'discovery',
        title: placed.wasLoopShortcut
          ? `Shortcut Opened: ${newRoom.name}`
          : `Room Discovered: ${newRoom.name}`,
        text: `${tpl.subtitle}${tpl.specialRule ? ` (${tpl.specialRule})` : ''}`,
        roomId: newRoom.id,
        playerId: activePlayer.id,
      });

      // Spawn ghost occasionally if room has affinity and not too crowded
      if (!placed.wasLoopShortcut && state.ghosts.length < 4 && rng.next() < 0.34 && tpl.ghostAffinities.length > 0) {
        const arch = rng.pick(tpl.ghostAffinities);
        state.ghosts.push(createGhostInstance(arch, newRoom.id, rng, activePlayer.id));
        state.silenceCueCounter += 1;
      }

      // Trigger a contextual event on newly discovered rooms
      if (!placed.wasLoopShortcut) {
        const evId = pickContextualEvent(state, newRoom, rng);
        if (evId) {
          state.usedEventIds.push(evId);
          state.activeEvent = {
            eventId: evId,
            roomId: newRoom.id,
            triggeredByPlayerId: activePlayer.id,
            resolved: false,
          };
        }
      }

      soundCue = 'door';
      caption = `A heavy wooden door creaks open, revealing ${newRoom.name}.`;
      return commit();
    }

    case 'SEARCH_ROOM': {
      if (activePlayer.actionPoints < 1) {
        return { ok: false, error: 'Need 1 Action Point to search this room.', state: prevState };
      }
      if (currentRoom.searched) {
        return { ok: false, error: 'This room has already been thoroughly searched.', state: prevState };
      }

      activePlayer.actionPoints -= 1;
      currentRoom.searched = true;

      const tpl = getRoomTemplate(currentRoom.templateId);
      const bonus = tpl.geometry === 'quarters' ? 1 : 0;
      const roll = performTraitCheck(
        state,
        activePlayer,
        currentRoom,
        'insight',
        7,
        `Search ${currentRoom.name}`,
        rng,
        bonus
      );

      let note = '';
      if (roll.success) {
        // High roll or secret archive yields item + clue/omen
        const r = rng.next();
        if (tpl.geometry === 'archive' || tpl.geometry === 'library') {
          const clue = grantRandomClue(state, rng);
          const item = grantRandomItem(state, activePlayer, rng);
          note = `Found ${item ?? 'useful supplies'}${clue ? ` and uncovered clue "${clue}"` : ''}.`;
        } else if (state.phase === 'exploration' && r < 0.36) {
          const omen = grantOmen(state, activePlayer, rng);
          note = omen ? `Uncovered an Omen: ${omen}!` : 'Uncovered unsettling markings.';
        } else if (r < 0.78) {
          const item = grantRandomItem(state, activePlayer, rng);
          note = `Recovered ${item ?? 'useful equipment'} from a dusty alcove.`;
        } else {
          const clue = grantRandomClue(state, rng);
          note = clue ? `Discovered clue: "${clue}".` : 'Confirmed the room holds no more hidden caches.';
        }
      } else {
        state.pressure = Math.min(100, state.pressure + 3);
        adjustAttention(state, 3, `Searching ${currentRoom.name} disturbed something inside the walls.`);
        note = 'Nothing usable turns up—only shifting dust and rising tension (+3 Pressure).';
      }

      addJournal(state, {
        category: 'action',
        title: `Searched ${currentRoom.name}`,
        text: `${activePlayer.displayName} rolled ${roll.total} vs ${roll.target}. ${note}`,
        roomId: currentRoom.id,
        playerId: activePlayer.id,
      });

      if (checkAndTriggerRevelation(state, rng)) {
        triggeredRevelation = true;
        soundCue = 'revelation';
        caption = `A deep bronze bell tolls. ${state.scenario?.title ?? 'The Revelation'} begins!`;
      } else {
        soundCue = 'dice';
        caption = roll.success ? `Search succeeded (${roll.total}).` : `Search stirred the house (${roll.total}).`;
      }
      return commit();
    }

    case 'INSPECT_OBJECT': {
      if (activePlayer.actionPoints < 1) {
        return { ok: false, error: 'Need 1 Action Point to examine objects.', state: prevState };
      }
      const tpl = getRoomTemplate(currentRoom.templateId);
      const obj = tpl.interactables.find((i) => i.id === action.interactableId);
      if (!obj) {
        return { ok: false, error: 'Object not found in current room.', state: prevState };
      }

      // If this interactable opens a puzzle
      if (obj.puzzleId) {
        if (currentRoom.solvedPuzzleIds.includes(obj.puzzleId)) {
          return { ok: false, error: 'This mechanism has already been solved.', state: prevState };
        }
        state.activePuzzle = {
          puzzleId: obj.puzzleId,
          roomId: currentRoom.id,
          interactableId: obj.id,
          attempts: 0,
        };
        soundCue = 'clue';
        caption = `Examining ${obj.name}.`;
        return commit();
      }

      if (currentRoom.inspectedIds.includes(obj.id)) {
        return { ok: false, error: 'You have already examined this thoroughly.', state: prevState };
      }

      activePlayer.actionPoints -= 1;
      currentRoom.inspectedIds.push(obj.id);

      let resultNote = obj.rewardText;
      if (obj.trait && obj.difficulty) {
        const roll = performTraitCheck(
          state,
          activePlayer,
          currentRoom,
          obj.trait,
          obj.difficulty,
          `Examine ${obj.name}`,
          rng
        );
        if (roll.success) {
          if (obj.clueId) grantRandomClue(state, rng, obj.clueId);
          if (obj.itemId && !activePlayer.inventory.includes(obj.itemId)) {
            activePlayer.inventory.push(obj.itemId);
          }
          if (obj.memoryFlag && !state.memoryFlags.includes(obj.memoryFlag)) {
            state.memoryFlags.push(obj.memoryFlag);
          }
        } else {
          activePlayer.fear = Math.min(activePlayer.maxFear, activePlayer.fear + 1);
          resultNote = `Failed check (${roll.total} vs ${roll.target}). The object unsettles you (+1 Fear), though you still note its presence.`;
        }
      } else {
        if (obj.clueId) grantRandomClue(state, rng, obj.clueId);
      }

      addJournal(state, {
        category: 'clue',
        title: `Examined: ${obj.name}`,
        text: resultNote,
        roomId: currentRoom.id,
        playerId: activePlayer.id,
      });

      soundCue = 'clue';
      caption = `Examined ${obj.name}.`;
      return commit();
    }

    case 'SOLVE_PUZZLE': {
      if (!state.activePuzzle) {
        return { ok: false, error: 'No active mechanism to solve.', state: prevState };
      }
      const puzzle = getPuzzleById(state.activePuzzle.puzzleId);
      if (!puzzle) {
        state.activePuzzle = null;
        return commit();
      }

      const opt = puzzle.options.find((o) => o.id === action.optionId);
      if (!opt) {
        return { ok: false, error: 'Invalid mechanism choice.', state: prevState };
      }

      if (activePlayer.actionPoints < 1) {
        return { ok: false, error: 'Need 1 Action Point to operate this mechanism.', state: prevState };
      }
      activePlayer.actionPoints -= 1;

      if (opt.isCorrect) {
        currentRoom.solvedPuzzleIds.push(puzzle.id);
        currentRoom.inspectedIds.push(state.activePuzzle.interactableId);
        const effects = applyOutcomeEffect(state, activePlayer, puzzle.rewardEffect, rng);
        addJournal(state, {
          category: 'clue',
          title: `Mechanism Solved: ${puzzle.title}`,
          text: `${puzzle.rewardText}${effects.length ? ` (${effects.join(', ')})` : ''}`,
          roomId: currentRoom.id,
          playerId: activePlayer.id,
        });
        state.activePuzzle = null;
        soundCue = 'clue';
        caption = `Mechanism unlocked: ${puzzle.title}.`;
      } else {
        state.activePuzzle.attempts += 1;
        activePlayer.fear = Math.min(
          activePlayer.maxFear,
          activePlayer.fear + puzzle.failurePenalty.fearDelta
        );
        adjustAttention(state, puzzle.failurePenalty.attentionDelta);
        state.activePuzzle.feedback = `${puzzle.failurePenalty.text} (Check your Journal clues and try again.)`;
        soundCue = 'ghost';
        caption = 'The brass mechanism resists with a harsh click.';
      }
      return commit();
    }

    case 'CLOSE_PUZZLE': {
      state.activePuzzle = null;
      return commit();
    }

    case 'RESOLVE_EVENT_CHOICE': {
      if (!state.activeEvent || state.activeEvent.resolved) {
        return { ok: false, error: 'No unresolved event.', state: prevState };
      }
      const ev = getEventById(state.activeEvent.eventId);
      if (!ev) {
        state.activeEvent = null;
        return commit();
      }
      const choice = ev.choices.find((c) => c.id === action.choiceId);
      if (!choice) {
        return { ok: false, error: 'Invalid event choice.', state: prevState };
      }

      let succeeded = true;
      let roll: DiceRollRecord | undefined;

      if (choice.trait && choice.difficulty) {
        const charBonus = choice.characterBonusIds?.includes(activePlayer.characterId) ? 2 : 0;
        roll = performTraitCheck(
          state,
          activePlayer,
          currentRoom,
          choice.trait,
          choice.difficulty,
          `${ev.title}: ${choice.label}`,
          rng,
          charBonus
        );
        succeeded = roll.success;
      }

      const applied = applyOutcomeEffect(
        state,
        activePlayer,
        succeeded ? choice.effectsSuccess : choice.effectsFailure,
        rng
      );

      const narrativeResult = succeeded ? choice.successText : choice.failureText;
      const summaryLine = applied.length > 0 ? ` [${applied.join(' · ')}]` : '';

      state.activeEvent.resolved = true;
      state.activeEvent.chosenOptionId = choice.id;
      state.activeEvent.roll = roll;
      state.activeEvent.outcomeText = `${narrativeResult}${summaryLine}`;

      addJournal(state, {
        category: 'event',
        title: ev.title,
        text: `${activePlayer.displayName} chose "${choice.label}". ${narrativeResult}${summaryLine}`,
        roomId: currentRoom.id,
        playerId: activePlayer.id,
      });

      if (checkAndTriggerRevelation(state, rng)) {
        triggeredRevelation = true;
        soundCue = 'revelation';
        caption = `The house goes silent—then a bronze bell rings. ${state.scenario?.title ?? 'The Revelation'} begins!`;
      } else {
        soundCue = roll ? 'dice' : 'omen';
        caption = succeeded ? `${ev.title} resolved.` : `${ev.title} took a toll.`;
      }

      return commit();
    }

    case 'DISMISS_EVENT': {
      if (!state.activeEvent || !state.activeEvent.resolved) {
        return { ok: false, error: 'Event is not yet resolved.', state: prevState };
      }
      state.activeEvent = null;
      return commit();
    }

    case 'USE_ITEM': {
      if (activePlayer.actionPoints < 1) {
        return { ok: false, error: 'Need 1 Action Point to use an item.', state: prevState };
      }
      const idx = activePlayer.inventory.indexOf(action.itemId);
      if (idx === -1) {
        return { ok: false, error: 'You do not carry that item.', state: prevState };
      }
      const item = getItemById(action.itemId);
      if (!item) {
        return { ok: false, error: 'Unknown item.', state: prevState };
      }

      activePlayer.actionPoints -= 1;
      const target =
        action.targetPlayerId
          ? state.players.find(
              (p) => p.id === action.targetPlayerId && p.roomId === activePlayer.roomId && p.alive
            ) ?? activePlayer
          : activePlayer;

      const fx = item.activeEffect;
      const notes: string[] = [];

      if (fx.healHealth) {
        target.health = Math.min(target.maxHealth, target.health + fx.healHealth);
        notes.push(`+${fx.healHealth} Health`);
      }
      if (fx.reduceFear) {
        target.fear = Math.max(0, target.fear - fx.reduceFear);
        notes.push(`-${fx.reduceFear} Fear`);
      }
      if (fx.bonusNextRoll) {
        target.nextRollBonus += fx.bonusNextRoll;
        notes.push(`+${fx.bonusNextRoll} next roll`);
      }
      if (fx.illuminateRoom) {
        currentRoom.darkened = false;
        notes.push('Room illuminated');
      }
      if (fx.banishGhost) {
        const roomGhosts = state.ghosts.filter((g) => g.roomId === currentRoom.id && !g.soothed);
        for (const g of roomGhosts) {
          g.state = 'vanishing';
          g.soothed = true;
          g.lastActionNote = `${g.name} recoiled and dissolved at the sound of ${item.name}.`;
        }
        if (roomGhosts.length > 0) notes.push(`Dispersed ${roomGhosts.length} apparition`);
      }
      if (fx.revealSecret) {
        const clue = grantRandomClue(state, rng);
        if (clue) notes.push(`Clue: ${clue}`);
      }
      if (fx.costPressure) {
        state.pressure = Math.min(100, state.pressure + fx.costPressure);
        adjustAttention(state, fx.costPressure);
      }

      if (item.consumable) {
        activePlayer.inventory.splice(idx, 1);
      }

      addJournal(state, {
        category: 'action',
        title: `Used ${item.name}`,
        text: `${activePlayer.displayName} used ${item.name}: ${notes.join(', ') || 'applied effect'}.`,
        roomId: currentRoom.id,
        playerId: activePlayer.id,
      });

      soundCue = 'item';
      caption = `Used ${item.name}.`;
      return commit();
    }

    case 'INTERACT_GHOST': {
      if (activePlayer.actionPoints < 1) {
        return { ok: false, error: 'Need 1 Action Point to interact with an apparition.', state: prevState };
      }
      const ghost = state.ghosts.find(
        (g) => g.id === action.ghostId && g.roomId === currentRoom.id && !g.soothed
      );
      if (!ghost) {
        return { ok: false, error: 'That apparition is not present in this room.', state: prevState };
      }

      activePlayer.actionPoints -= 1;
      const charDef = getCharacterById(activePlayer.characterId);
      let trait: TraitName = 'nerve';
      let target = 8;
      let extraBonus = 0;

      if (action.approach === 'observe') {
        trait = 'insight';
        target = ghost.archetype === 'lantern_wisp' ? 6 : 7;
        if (charDef.id === 'medium') extraBonus += 2;
      } else if (action.approach === 'soothe') {
        trait = 'nerve';
        target = ghost.archetype === 'mourner' ? 7 : 8;
        if (charDef.id === 'medium') extraBonus += 2;
        if (currentRoom.templateId === 'abandoned_nursery' || currentRoom.templateId === 'funeral_parlor') {
          extraBonus += 2;
        }
        if (charDef.id === 'physician' && ghost.archetype === 'mourner') extraBonus -= 1;
      } else if (action.approach === 'ward') {
        trait = 'nerve';
        target = 8;
        if (activePlayer.inventory.includes('silver_mirror') || activePlayer.inventory.includes('tuning_fork')) {
          extraBonus += 2;
        }
      } else {
        trait = 'body';
        target = 9;
      }

      const roll = performTraitCheck(
        state,
        activePlayer,
        currentRoom,
        trait,
        target,
        `${action.approach.toUpperCase()} ${ghost.name}`,
        rng,
        extraBonus
      );

      let outcomeNote = '';
      if (roll.success) {
        ghost.observedCount += 1;
        if (action.approach === 'observe') {
          const clue = grantRandomClue(state, rng);
          ghost.disposition = ghost.disposition === 'hostile' ? 'neutral' : 'helpful';
          outcomeNote = `Patient observation paid off! ${clue ? `Gained clue "${clue}".` : 'You read the spirit’s pattern (-1 Fear).'}`;
          activePlayer.fear = Math.max(0, activePlayer.fear - 1);
          if (state.scenario?.id === 'the_mirror_jury' && ghost.archetype === 'borrower') {
            state.scenario.progress = Math.min(state.scenario.goal, state.scenario.progress + 1);
            outcomeNote += ' Earned +1 Reflection Proof!';
          }
        } else if (action.approach === 'soothe') {
          ghost.soothed = true;
          ghost.state = 'vanishing';
          state.pressure = Math.max(0, state.pressure - 6);
          activePlayer.fear = Math.max(0, activePlayer.fear - 1);
          if (!state.memoryFlags.includes('rescued_music_spirit')) {
            state.memoryFlags.push('rescued_music_spirit');
          }
          outcomeNote = `${ghost.name} softens into pale golden dust and fades peacefully (-6 Pressure, -1 Fear).`;
        } else {
          ghost.soothed = true;
          ghost.state = 'vanishing';
          adjustAttention(state, 5, `${activePlayer.displayName} drove back ${ghost.name}.`);
          outcomeNote = `${ghost.name} fractures and withdraws from ${currentRoom.name}.`;
        }
      } else {
        activePlayer.fear = Math.min(activePlayer.maxFear, activePlayer.fear + 1);
        ghost.state = 'reacting';
        if (action.approach === 'confront') {
          ghost.disposition = 'hostile';
          activePlayer.health = Math.max(0, activePlayer.health - 1);
          adjustAttention(state, 6);
          outcomeNote = `Confrontation provoked ${ghost.name} (-1 Health, +1 Fear).`;
        } else {
          outcomeNote = `${ghost.name} shudders and presses closer (+1 Fear).`;
        }
      }

      ghost.lastActionNote = outcomeNote;
      addJournal(state, {
        category: 'ghost',
        title: `Encounter: ${ghost.name}`,
        text: `${activePlayer.displayName} tried to ${action.approach} (${roll.total} vs ${roll.target}). ${outcomeNote}`,
        roomId: currentRoom.id,
        playerId: activePlayer.id,
      });

      soundCue = 'ghost';
      caption = outcomeNote;
      return commit();
    }

    case 'REST_RECOVER': {
      if (activePlayer.actionPoints < 2) {
        return { ok: false, error: 'Resting requires 2 Action Points.', state: prevState };
      }
      const hostileHere = state.ghosts.some(
        (g) => g.roomId === currentRoom.id && !g.soothed && g.disposition === 'hostile'
      );
      if (hostileHere) {
        return { ok: false, error: 'Cannot catch your breath while a hostile apparition lingers here.', state: prevState };
      }

      activePlayer.actionPoints -= 2;
      const tpl = getRoomTemplate(currentRoom.templateId);
      const fearHeal = tpl.geometry === 'chapel' ? 2 : tpl.geometry === 'foyer' ? 2 : 1;
      const hpHeal =
        (activePlayer.characterId === 'physician' ? 2 : 1) + (tpl.geometry === 'bedroom' ? 1 : 0);

      activePlayer.fear = Math.max(0, activePlayer.fear - fearHeal);
      activePlayer.health = Math.min(activePlayer.maxHealth, activePlayer.health + hpHeal);

      addJournal(state, {
        category: 'action',
        title: 'Moment of Respite',
        text: `${activePlayer.displayName} steadied their breathing in ${currentRoom.name} (+${hpHeal} Health, -${fearHeal} Fear).`,
        roomId: currentRoom.id,
        playerId: activePlayer.id,
      });

      soundCue = 'item';
      caption = `Recovered +${hpHeal} Health and -${fearHeal} Fear.`;
      return commit();
    }

    case 'HELP_ALLY': {
      if (activePlayer.actionPoints < 1) {
        return { ok: false, error: 'Need 1 Action Point to help an ally.', state: prevState };
      }
      const ally = state.players.find(
        (p) => p.id === action.targetPlayerId && p.id !== activePlayer.id && p.roomId === activePlayer.roomId && p.alive
      );
      if (!ally) {
        return { ok: false, error: 'No living companion in your room to assist.', state: prevState };
      }
      activePlayer.actionPoints -= 1;
      const hp = activePlayer.characterId === 'physician' ? 2 : 1;
      ally.health = Math.min(ally.maxHealth, ally.health + hp);
      ally.fear = Math.max(0, ally.fear - 1);
      ally.nextRollBonus += 1;
      state.attention.solidarityScore += 1;

      addJournal(state, {
        category: 'action',
        title: 'Steadied Companion',
        text: `${activePlayer.displayName} helped ${ally.displayName} (+${hp} Health, -1 Fear, +1 next roll).`,
        roomId: currentRoom.id,
      });

      soundCue = 'item';
      caption = `Assisted ${ally.displayName}.`;
      return commit();
    }

    case 'TRADE_ITEM': {
      if (activePlayer.actionPoints < 1) {
        return { ok: false, error: 'Need 1 Action Point to trade.', state: prevState };
      }
      const ally = state.players.find(
        (p) => p.id === action.targetPlayerId && p.id !== activePlayer.id && p.roomId === activePlayer.roomId && p.alive
      );
      const itemIdx = activePlayer.inventory.indexOf(action.itemId);
      if (!ally || itemIdx === -1) {
        return { ok: false, error: 'Invalid trade target or item.', state: prevState };
      }
      activePlayer.actionPoints -= 1;
      activePlayer.inventory.splice(itemIdx, 1);
      ally.inventory.push(action.itemId);
      const item = getItemById(action.itemId);

      addJournal(state, {
        category: 'action',
        title: 'Exchanged Equipment',
        text: `${activePlayer.displayName} passed ${item?.name ?? action.itemId} to ${ally.displayName}.`,
        roomId: currentRoom.id,
      });

      soundCue = 'item';
      caption = `Traded ${item?.name ?? 'item'} to ${ally.displayName}.`;
      return commit();
    }

    case 'SCENARIO_ACTION': {
      if (state.phase !== 'revelation' || !state.scenario) {
        return { ok: false, error: 'No active Revelation scenario.', state: prevState };
      }
      if (activePlayer.actionPoints < 1) {
        return { ok: false, error: 'Need 1 Action Point for this scenario action.', state: prevState };
      }

      const scen = state.scenario;

      // === SCENARIO A: THE HOUSE HAS CHOSEN ===
      if (action.subAction === 'disable_anchor' && scen.id === 'the_house_has_chosen') {
        if (!currentRoom.hasAnchor || currentRoom.anchorDisabled) {
          return { ok: false, error: 'No active Supernatural Anchor in this room.', state: prevState };
        }
        activePlayer.actionPoints -= 1;
        const clueBonus = state.cluesFound.includes('clue_anchor_ward') ? 2 : 0;
        const roll = performTraitCheck(
          state,
          activePlayer,
          currentRoom,
          'insight',
          8,
          'Disable Supernatural Anchor',
          rng,
          clueBonus
        );
        if (roll.success) {
          currentRoom.anchorDisabled = true;
          scen.progress += 1;
          state.pressure = Math.max(0, state.pressure - 8);
          addJournal(state, {
            category: 'revelation',
            title: `Anchor Severed (${scen.progress}/${scen.goal})`,
            text: `${activePlayer.displayName} shattered the brass anchor in ${currentRoom.name}!`,
            roomId: currentRoom.id,
          });
          if (scen.progress >= scen.goal) {
            finalizeEnding(state, true, 'explorers');
            soundCue = 'ending';
            caption = 'All three Supernatural Anchors are severed! The front doors unbolt!';
            return commit();
          }
          soundCue = 'clue';
          caption = `Anchor disabled (${scen.progress}/${scen.goal})!`;
        } else {
          activePlayer.fear = Math.min(activePlayer.maxFear, activePlayer.fear + 1);
          soundCue = 'dice';
          caption = `Anchor resisted (${roll.total} vs ${roll.target}).`;
        }
        return commit();
      }

      // === CHOSEN / MIMIC BETRAYER SPECIAL POWERS ===
      if (action.subAction === 'chosen_shift_door' && (activePlayer.role === 'chosen' || activePlayer.role === 'mimic')) {
        activePlayer.actionPoints -= 1;
        // Lock one doorway on current room & raise pressure
        const openDirs = (Object.keys(currentRoom.connectedTo) as Direction[]);
        if (openDirs.length > 0) {
          const dirToLock = openDirs[0];
          currentRoom.lockedDirections = Array.from(new Set([...(currentRoom.lockedDirections ?? []), dirToLock]));
        }
        state.pressure = Math.min(100, state.pressure + 8);
        scen.countdown = Math.max(1, scen.countdown - 1);
        addJournal(state, {
          category: 'revelation',
          title: 'The Architecture Shifts',
          text: `A cold groan sweeps the mansion—corridor bolts shift and the countdown tightens.`,
          roomId: currentRoom.id,
        });
        soundCue = 'silence_bell';
        caption = 'Doors groan and realign across the house.';
        return commit();
      }

      if (action.subAction === 'chosen_stoke_dread' && (activePlayer.role === 'chosen' || activePlayer.role === 'mimic')) {
        activePlayer.actionPoints -= 1;
        for (const p of state.players) {
          if (p.id !== activePlayer.id && p.alive) {
            p.fear = Math.min(p.maxFear, p.fear + 1);
          }
        }
        state.pressure = Math.min(100, state.pressure + 6);
        soundCue = 'ghost';
        caption = 'A sudden chill rattles every lantern in the house.';
        return commit();
      }

      // === SCENARIO B: THE LAST MIDNIGHT ===
      if (action.subAction === 'align_clock' && scen.id === 'the_last_midnight') {
        if (!currentRoom.hasClockMechanism || currentRoom.clockAligned) {
          return { ok: false, error: 'No unaligned Clock Mechanism here.', state: prevState };
        }
        activePlayer.actionPoints -= 1;
        const bonus =
          (activePlayer.inventory.includes('clockmakers_key') ? 3 : 0) +
          (state.cluesFound.includes('clue_clock_sequence') ? 1 : 0);
        const roll = performTraitCheck(
          state,
          activePlayer,
          currentRoom,
          'grace',
          8,
          'Synchronize Clock Mechanism',
          rng,
          bonus
        );
        if (roll.success) {
          currentRoom.clockAligned = true;
          currentRoom.darkened = false;
          scen.progress += 1;
          addJournal(state, {
            category: 'revelation',
            title: `Clock Synchronized (${scen.progress}/${scen.goal})`,
            text: `${activePlayer.displayName} locked the mechanism in ${currentRoom.name} cleanly onto XII.`,
            roomId: currentRoom.id,
          });
          if (scen.progress >= scen.goal) {
            finalizeEnding(state, true, 'explorers');
            soundCue = 'ending';
            caption = 'All three clocks lock onto XII! Daylight breaks through the glass!';
            return commit();
          }
          soundCue = 'clue';
          caption = `Clock aligned (${scen.progress}/${scen.goal})!`;
        } else {
          activePlayer.fear = Math.min(activePlayer.maxFear, activePlayer.fear + 1);
          soundCue = 'dice';
          caption = `Gears slipped (${roll.total} vs ${roll.target}).`;
        }
        return commit();
      }

      // === SCENARIO C: THE MIRROR JURY ===
      if (action.subAction === 'gather_proof' && scen.id === 'the_mirror_jury') {
        if (!currentRoom.hasReflectionProof || currentRoom.reflectionGathered) {
          return { ok: false, error: 'No ungathered Reflection Proof in this room.', state: prevState };
        }
        activePlayer.actionPoints -= 1;
        const bonus =
          (activePlayer.inventory.includes('silver_mirror') ? 2 : 0) +
          (state.cluesFound.includes('clue_mirror_rule') ? 2 : 0);
        const roll = performTraitCheck(
          state,
          activePlayer,
          currentRoom,
          'insight',
          8,
          'Gather Reflection Proof',
          rng,
          bonus
        );
        if (roll.success) {
          currentRoom.reflectionGathered = true;
          scen.progress += 1;
          addJournal(state, {
            category: 'revelation',
            title: `Reflection Proof Secured (${scen.progress}/${scen.goal})`,
            text: `${activePlayer.displayName} documented a lagging reflection seam in ${currentRoom.name}.`,
            roomId: currentRoom.id,
          });
          soundCue = 'clue';
          caption = `Reflection Proof recorded (${scen.progress}/${scen.goal}).`;
        } else {
          activePlayer.fear = Math.min(activePlayer.maxFear, activePlayer.fear + 1);
          soundCue = 'dice';
          caption = `The reflection deceived you (${roll.total} vs ${roll.target}).`;
        }
        return commit();
      }

      if (action.subAction === 'contain_threat' && scen.id === 'the_mirror_jury') {
        if (scen.progress < scen.goal) {
          return { ok: false, error: `Gather all ${scen.goal} Reflection Proofs before performing Containment.`, state: prevState };
        }
        activePlayer.actionPoints -= 1;
        const roll = performTraitCheck(
          state,
          activePlayer,
          currentRoom,
          'nerve',
          7,
          'Enact Mirror Containment Rite',
          rng,
          2
        );
        if (roll.success) {
          finalizeEnding(state, true, 'explorers');
          soundCue = 'ending';
          caption = 'The Mirror Jury shatters into harmless silver dust!';
        } else {
          activePlayer.fear = Math.min(activePlayer.maxFear, activePlayer.fear + 1);
          soundCue = 'ghost';
          caption = 'The mirrors shudder—steady your Nerve and try again.';
        }
        return commit();
      }

      if (action.subAction === 'accuse_player' && scen.id === 'the_mirror_jury') {
        if (!action.targetId) {
          return { ok: false, error: 'Select a player to accuse.', state: prevState };
        }
        activePlayer.actionPoints -= 1;
        if (scen.betrayerPlayerId && action.targetId === scen.betrayerPlayerId && scen.progress >= 2) {
          scen.betrayerRevealed = true;
          finalizeEnding(state, true, 'explorers');
          soundCue = 'ending';
          caption = 'Backed by Reflection Proofs, you unmasked the Mirror Mimic!';
        } else {
          // Meaningful cost instead of arbitrary instant elimination
          scen.falseAccusations += 1;
          activePlayer.fear = Math.min(activePlayer.maxFear, activePlayer.fear + 2);
          state.pressure = Math.min(100, state.pressure + 6);
          addJournal(state, {
            category: 'revelation',
            title: 'Unproven Accusation',
            text: `${activePlayer.displayName}'s accusation lacked conclusive proof (+2 Fear, +6 Pressure). Gather at least 2 Reflection Proofs.`,
          });
          soundCue = 'ghost';
          caption = 'The accusation faltered (+2 Fear).';
        }
        return commit();
      }

      // === SCENARIO D: THE HEART BENEATH THE HOUSE ===
      if (
        (action.subAction === 'heart_destroy' ||
          action.subAction === 'heart_bargain' ||
          action.subAction === 'heart_quiet') &&
        scen.id === 'the_heart_beneath'
      ) {
        if (!currentRoom.isHeartChamber) {
          return { ok: false, error: 'You must reach the awakened Heart Chamber in the Basement.', state: prevState };
        }
        activePlayer.actionPoints -= 1;

        if (action.subAction === 'heart_destroy') {
          const ironBonus =
            (activePlayer.inventory.includes('fireplace_poker') || activePlayer.inventory.includes('crowbar_iron') ? 3 : 0) +
            (state.cluesFound.includes('clue_heart_weakness') ? 2 : 0);
          const roll = performTraitCheck(
            state,
            activePlayer,
            currentRoom,
            'body',
            9,
            'Shatter the Heart Beneath',
            rng,
            ironBonus
          );
          if (roll.success) {
            scen.endingChoice = 'destroy';
            finalizeEnding(state, true, 'explorers');
            soundCue = 'ending';
            caption = 'The Heart Beneath shatters! The mansion releases its guests!';
          } else {
            activePlayer.health = Math.max(0, activePlayer.health - 2);
            activePlayer.fear = Math.min(activePlayer.maxFear, activePlayer.fear + 1);
            soundCue = 'ghost';
            caption = `The calcified heart repelled the strike (${roll.total} vs ${roll.target})!`;
          }
          return commit();
        }

        if (action.subAction === 'heart_bargain') {
          if (activePlayer.omens.length === 0) {
            return { ok: false, error: 'Bargaining with the Heart requires offering an Omen.', state: prevState };
          }
          activePlayer.omens.pop();
          scen.endingChoice = 'bargain';
          finalizeEnding(
            state,
            true,
            'pact',
            'The Salt Covenant',
            'You lay your ominous relic upon the warm foundation stone. The slow subterranean heartbeat accepts the tribute, unbolting the oak entrance doors in silent agreement—though you know the estate will one day call for a return visit.'
          );
          soundCue = 'ending';
          caption = 'The Heart accepts your Omen and seals the covenant.';
          return commit();
        }

        if (action.subAction === 'heart_quiet') {
          if (state.cluesFound.length < 3) {
            return { ok: false, error: 'Quieting the Heart peacefully requires at least 3 discovered Clues.', state: prevState };
          }
          scen.endingChoice = 'quiet';
          finalizeEnding(
            state,
            true,
            'pact',
            'The Memory Quieted',
            'Speaking the names uncovered in the archives and nursery, you lay the house’s grief to rest. The subterranean pulse slows to stillness, candlelight turns warm amber throughout every hall, and the Grand Entrance Hall opens to a clear dawn.'
          );
          soundCue = 'ending';
          caption = 'The Heart Beneath falls peacefully silent.';
          return commit();
        }
      }

      return { ok: false, error: 'Scenario action not available right now.', state: prevState };
    }

    case 'END_TURN': {
      // Check isolation vs solidarity for House's Attention
      const alliesInSameRoom = state.players.filter(
        (p) => p.id !== activePlayer.id && p.alive && p.roomId === activePlayer.roomId
      );
      if (state.players.length >= 2 && alliesInSameRoom.length === 0) {
        activePlayer.soloTurnsCount += 1;
        state.attention.isolationScore += 1;
        if (activePlayer.soloTurnsCount % 2 === 0) {
          adjustAttention(
            state,
            4,
            `The house watches ${activePlayer.displayName} wandering alone.`
          );
        }
      }

      // Altered rule for The Last Midnight: darkness inflicts Fear without light item
      if (
        state.scenario?.id === 'the_last_midnight' &&
        currentRoom.darkened &&
        !activePlayer.inventory.includes('storm_lantern') &&
        !activePlayer.inventory.includes('wax_taper_bundle')
      ) {
        activePlayer.fear = Math.min(activePlayer.maxFear, activePlayer.fear + 1);
        addJournal(state, {
          category: 'revelation',
          title: 'Darkness of the Thirteenth Hour',
          text: `${activePlayer.displayName} ended the turn in dark ${currentRoom.name} without light (+1 Fear).`,
          roomId: currentRoom.id,
        });
      }

      // Advance turn to next living player
      let nextIdx = state.currentPlayerIndex;
      let wrappedRound = false;
      for (let i = 0; i < state.players.length; i++) {
        nextIdx = (nextIdx + 1) % state.players.length;
        if (nextIdx === 0) wrappedRound = true;
        if (state.players[nextIdx].alive) break;
      }

      state.currentPlayerIndex = nextIdx;
      const nextPlayer = state.players[nextIdx];
      nextPlayer.actionPoints = nextPlayer.maxActionPoints;

      if (wrappedRound || state.players.length === 1) {
        state.turn += 1;
        // Advance ghosts deterministically
        const ghostNotes = advanceGhostsOnTurnEnd(state, rng);
        for (const gn of ghostNotes.slice(0, 2)) {
          addJournal(state, {
            category: 'ghost',
            title: 'Supernatural Movement',
            text: gn,
          });
        }

        // Scenario countdown tick & House shifts
        if (state.phase === 'revelation' && state.scenario) {
          state.scenario.countdown -= 1;

          // Solo House Shadow Emissary shifts or darkens a room occasionally
          if (state.scenario.id === 'the_heart_beneath' && state.turn % 2 === 0) {
            state.silenceCueCounter += 1;
          }

          if (state.scenario.countdown <= 0) {
            finalizeEnding(
              state,
              false,
              state.scenario.betrayerPlayerId ? 'chosen' : 'house'
            );
            soundCue = 'ending';
            caption = 'The final bell tolls across the estate.';
            return commit();
          }
        } else {
          // Gentle pressure creep in exploration so sessions stay brisk and engaging
          state.pressure = Math.min(100, state.pressure + 2);
          if (checkAndTriggerRevelation(state, rng)) {
            triggeredRevelation = true;
            soundCue = 'revelation';
            caption = `The house falls silent... ${state.scenario?.title ?? 'The Revelation'} begins!`;
            return commit();
          }
        }
      }

      soundCue = 'step';
      caption = `Turn ${state.turn}: ${nextPlayer.displayName}'s turn.`;
      return commit();
    }

    default:
      return { ok: false, error: 'Unsupported action type.', state: prevState };
  }
}

/**
 * Strips private roles and secret objectives of OTHER players before sending state to a client.
 * Guarantees private objectives remain genuinely private in multiplayer.
 */
export function sanitizeStateForPlayer(state: GameState, viewerPlayerId: string): GameState {
  const copy = structuredClone(state);
  const revealAll = copy.phase === 'ended' || Boolean(copy.scenario?.betrayerRevealed);

  if (!revealAll) {
    for (const p of copy.players) {
      if (p.id !== viewerPlayerId) {
        p.role = 'explorer';
        p.privateObjective = undefined;
      }
    }
    if (copy.scenario && copy.scenario.betrayerPlayerId !== viewerPlayerId) {
      copy.scenario.betrayerPlayerId = null;
    }
  }
  return copy;
}

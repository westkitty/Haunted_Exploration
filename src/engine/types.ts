export type FloorId = -1 | 0 | 1; // -1: Basement, 0: Ground, 1: Upper

export type Direction = 'N' | 'E' | 'S' | 'W';

export type TraitName = 'body' | 'grace' | 'insight' | 'nerve';

export type GamePhase = 'exploration' | 'revelation' | 'ended';

export type CameraMode = 'immersive' | 'dollhouse';

export type ExpeditionSize = 'short' | 'standard' | 'extended';

export type ScenarioId =
  | 'the_house_has_chosen'
  | 'the_last_midnight'
  | 'the_mirror_jury'
  | 'the_heart_beneath';

export type PlayerRole = 'explorer' | 'chosen' | 'mimic';

export type GhostArchetypeId =
  | 'watcher'
  | 'mourner'
  | 'borrower'
  | 'lantern_wisp'
  | 'wall_choir';

export type GhostState =
  | 'dormant'
  | 'manifesting'
  | 'observing'
  | 'investigating'
  | 'reacting'
  | 'vanishing';

export type RoomArchetypeGeometry =
  | 'foyer'
  | 'staircase'
  | 'vestibule'
  | 'library'
  | 'nursery'
  | 'conservatory'
  | 'gallery'
  | 'music'
  | 'ballroom'
  | 'bedroom'
  | 'quarters'
  | 'chapel'
  | 'cellar'
  | 'boiler'
  | 'laboratory'
  | 'clockwork'
  | 'taxidermy'
  | 'observatory'
  | 'dining'
  | 'flooded'
  | 'mirror'
  | 'parlor'
  | 'archive'
  | 'passage'
  | 'vault'
  | 'impossible';

export type AmbientSoundProfile =
  | 'hearth'
  | 'clockwork'
  | 'wind'
  | 'water'
  | 'musicbox'
  | 'whisper'
  | 'machinery'
  | 'sacred'
  | 'void';

export interface CharacterStats {
  body: number;
  grace: number;
  insight: number;
  nerve: number;
}

export interface CharacterDef {
  id: string;
  name: string;
  title: string;
  biography: string;
  motive: string;
  secret: string;
  stats: CharacterStats;
  maxHealth: number;
  maxSanity: number;
  passiveName: string;
  passiveDesc: string;
  weaknessName: string;
  weaknessDesc: string;
  accentColor: string;
  coatColor: string;
  silhouetteType: 'archivist' | 'medium' | 'locksmith' | 'physician' | 'magician' | 'heir';
  startingItemId: string;
}

export interface RoomInteractable {
  id: string;
  name: string;
  description: string;
  kind: 'inspect' | 'puzzle' | 'secret' | 'mirror' | 'clock' | 'altar' | 'journal';
  trait?: TraitName;
  difficulty?: number;
  puzzleId?: string;
  rewardText: string;
  clueId?: string;
  itemId?: string;
  memoryFlag?: string;
  positionOffset: [number, number, number]; // local room coords
}

export interface RoomTemplate {
  id: string;
  name: string;
  subtitle: string;
  allowedFloors: FloorId[];
  defaultDoors: Direction[];
  geometry: RoomArchetypeGeometry;
  wallColor: string;
  floorColor: string;
  accentColor: string;
  lightColor: string;
  lightIntensity: number;
  soundProfile: AmbientSoundProfile;
  weight: number;
  isRare?: boolean;
  isStairConnector?: boolean;
  connectsFloors?: FloorId[];
  specialRule?: string;
  eventCategories: EventCategory[];
  ghostAffinities: GhostArchetypeId[];
  interactables: RoomInteractable[];
  omenBias?: ScenarioId;
  secretNote: string;
}

export interface PlacedRoom {
  id: string;
  templateId: string;
  name: string;
  floor: FloorId;
  x: number;
  z: number;
  rotation: number; // 0, 1, 2, 3 (90 deg clockwise steps)
  doors: Direction[]; // world-space directions that have doorways
  connectedTo: Partial<Record<Direction, string>>; // world-space dir -> neighbor room id
  stairLinks: string[]; // cross-floor connected room ids
  discoveredByPlayerId: string;
  discoveredOnTurn: number;
  searched: boolean;
  inspectedIds: string[];
  solvedPuzzleIds: string[];
  hasAnchor?: boolean;
  anchorDisabled?: boolean;
  hasClockMechanism?: boolean;
  clockAligned?: boolean;
  hasReflectionProof?: boolean;
  reflectionGathered?: boolean;
  isHeartChamber?: boolean;
  alteredCount: number;
  revisitCount: number;
  darkened?: boolean;
  lockedDirections?: Direction[];
}

export type EventCategory =
  | 'apparition'
  | 'architectural'
  | 'bargain'
  | 'clue'
  | 'hazard'
  | 'portrait'
  | 'omen_echo';

export interface EventChoice {
  id: string;
  label: string;
  detail: string;
  trait?: TraitName;
  difficulty?: number;
  requiredItemId?: string;
  requiredFlag?: string;
  characterBonusIds?: string[];
  successText: string;
  failureText: string;
  effectsSuccess: OutcomeEffect;
  effectsFailure?: OutcomeEffect;
}

export interface OutcomeEffect {
  healthDelta?: number;
  fearDelta?: number;
  apDelta?: number;
  pressureDelta?: number;
  attentionDelta?: number;
  grantItemId?: string;
  grantRandomItem?: boolean;
  grantOmen?: boolean;
  grantClueId?: string;
  grantRandomClue?: boolean;
  setFlag?: string;
  spawnGhost?: GhostArchetypeId;
  unlockSecretPassage?: boolean;
  condition?: string;
  statBoost?: Partial<CharacterStats>;
  logNote?: string;
}

export interface EventDef {
  id: string;
  title: string;
  category: EventCategory;
  narrative: string;
  illustrationMotif: 'dining' | 'wall' | 'portrait' | 'clock' | 'mirror' | 'candle' | 'door' | 'bell' | 'book' | 'music';
  minPressure?: number;
  preferredGeometries?: RoomArchetypeGeometry[];
  requiredFlag?: string;
  forbiddenFlag?: string;
  characterReactions?: Record<string, string>;
  choices: EventChoice[];
  isRare?: boolean;
}

export interface ItemDef {
  id: string;
  name: string;
  category: 'light' | 'tool' | 'ward' | 'weapon' | 'medicine' | 'curiosity';
  description: string;
  effectText: string;
  tradeoffText?: string;
  consumable: boolean;
  passiveTraitBonus?: Partial<CharacterStats>;
  activeEffect: {
    healHealth?: number;
    reduceFear?: number;
    bonusNextRoll?: number;
    banishGhost?: boolean;
    revealSecret?: boolean;
    illuminateRoom?: boolean;
    costFear?: number;
    costHealth?: number;
    costPressure?: number;
  };
}

export interface OmenDef {
  id: string;
  name: string;
  description: string;
  whisper: string;
  scenarioAffinity: ScenarioId;
  pressureGain: number;
  passiveBonus?: Partial<CharacterStats>;
  curseNote: string;
}

export interface ClueDef {
  id: string;
  title: string;
  chain: 'anchors' | 'midnight' | 'mirrors' | 'heart' | 'house_history';
  excerpt: string;
  mechanicalHint: string;
}

export interface PuzzleDef {
  id: string;
  title: string;
  prompt: string;
  clueIds: string[];
  options: { id: string; label: string; isCorrect: boolean }[];
  rewardText: string;
  rewardEffect: OutcomeEffect;
  failurePenalty: { fearDelta: number; attentionDelta: number; text: string };
}

export interface GhostInstance {
  id: string;
  archetype: GhostArchetypeId;
  name: string;
  roomId: string;
  state: GhostState;
  disposition: 'hostile' | 'neutral' | 'curious' | 'helpful';
  observedCount: number;
  soothed: boolean;
  mimicTargetPlayerId?: string;
  lastActionNote: string;
}

export interface HouseAttentionState {
  level: number; // 0-100
  isolationScore: number; // increments when exploring alone
  disturbanceScore: number; // increments when disturbing cursed items/omens
  solidarityScore: number; // increments when helping/grouping
  corridorHabitRoomId: string | null;
  corridorHabitCount: number;
  temperament: 'watchful' | 'curious' | 'possessive' | 'hostile';
  recentSignal: string;
}

export interface DiceRollRecord {
  id: string;
  playerId: string;
  playerName: string;
  reason: string;
  trait: TraitName;
  dice: [number, number];
  traitValue: number;
  itemModifier: number;
  fearPenalty: number;
  bonusModifier: number;
  total: number;
  target: number;
  success: boolean;
  timestamp: number;
}

export interface PlayerState {
  id: string;
  displayName: string;
  characterId: string;
  roomId: string;
  stats: CharacterStats;
  health: number;
  maxHealth: number;
  fear: number; // 0 (calm) to maxFear (broken/overwhelmed)
  maxFear: number;
  actionPoints: number;
  maxActionPoints: number;
  inventory: string[]; // item IDs
  omens: string[]; // omen IDs
  conditions: string[];
  nextRollBonus: number;
  alive: boolean;
  escaped: boolean;
  connected: boolean;
  role: PlayerRole; // Hidden from other players via sanitizeStateForPlayer
  privateObjective?: string;
  pathHistory: string[]; // roomIds visited in order
  soloTurnsCount: number;
}

export interface ActiveEventState {
  eventId: string;
  roomId: string;
  triggeredByPlayerId: string;
  resolved: boolean;
  chosenOptionId?: string;
  outcomeText?: string;
  roll?: DiceRollRecord;
}

export interface ActivePuzzleState {
  puzzleId: string;
  roomId: string;
  interactableId: string;
  attempts: number;
  feedback?: string;
}

export interface ScenarioRuntimeState {
  id: ScenarioId;
  title: string;
  subtitle: string;
  publicObjective: string;
  alteredRuleText: string;
  countdown: number;
  maxCountdown: number;
  progress: number;
  goal: number;
  betrayerPlayerId: string | null; // stripped for non-betrayers when secret
  betrayerRevealed: boolean;
  heartRoomId?: string;
  endingChoice?: 'destroy' | 'bargain' | 'quiet';
  falseAccusations: number;
}

export interface JournalEntry {
  id: string;
  turn: number;
  category: 'discovery' | 'event' | 'omen' | 'clue' | 'ghost' | 'revelation' | 'memory' | 'action';
  title: string;
  text: string;
  roomId?: string;
  playerId?: string;
}

export interface EndingSummary {
  victory: boolean;
  winningSide: 'explorers' | 'house' | 'chosen' | 'pact';
  title: string;
  epilogue: string;
  scenarioId: ScenarioId | null;
  turnsTaken: number;
  roomsDiscovered: number;
  secretsFound: number;
  keyMoments: string[];
  betrayerName?: string;
}

export interface GameState {
  schemaVersion: number;
  gameId: string;
  seed: string;
  rngState: number;
  version: number; // increments monotonically on every committed action
  expeditionSize: ExpeditionSize;
  isMultiplayer: boolean;
  phase: GamePhase;
  turn: number;
  currentPlayerIndex: number;
  players: PlayerState[];
  rooms: Record<string, PlacedRoom>;
  roomOrder: string[];
  ghosts: GhostInstance[];
  pressure: number; // 0-100
  revelationThreshold: number;
  omensFound: string[];
  cluesFound: string[];
  usedEventIds: string[];
  memoryFlags: string[];
  attention: HouseAttentionState;
  activeEvent: ActiveEventState | null;
  activePuzzle: ActivePuzzleState | null;
  scenario: ScenarioRuntimeState | null;
  lastDiceRoll: DiceRollRecord | null;
  journal: JournalEntry[];
  processedActionIds: string[];
  lastRoomDiscoveredId: string | null;
  revelationJustTriggered: boolean;
  silenceCueCounter: number;
  ending: EndingSummary | null;
  updatedAt: number;
}

export type GameAction =
  | {
      actionId: string;
      expectedVersion: number;
      playerId: string;
      type: 'MOVE_ROOM';
      targetRoomId: string;
    }
  | {
      actionId: string;
      expectedVersion: number;
      playerId: string;
      type: 'DISCOVER_ROOM';
      direction: Direction;
    }
  | {
      actionId: string;
      expectedVersion: number;
      playerId: string;
      type: 'SEARCH_ROOM';
    }
  | {
      actionId: string;
      expectedVersion: number;
      playerId: string;
      type: 'INSPECT_OBJECT';
      interactableId: string;
    }
  | {
      actionId: string;
      expectedVersion: number;
      playerId: string;
      type: 'SOLVE_PUZZLE';
      optionId: string;
    }
  | {
      actionId: string;
      expectedVersion: number;
      playerId: string;
      type: 'CLOSE_PUZZLE';
    }
  | {
      actionId: string;
      expectedVersion: number;
      playerId: string;
      type: 'RESOLVE_EVENT_CHOICE';
      choiceId: string;
    }
  | {
      actionId: string;
      expectedVersion: number;
      playerId: string;
      type: 'DISMISS_EVENT';
    }
  | {
      actionId: string;
      expectedVersion: number;
      playerId: string;
      type: 'USE_ITEM';
      itemId: string;
      targetPlayerId?: string;
    }
  | {
      actionId: string;
      expectedVersion: number;
      playerId: string;
      type: 'INTERACT_GHOST';
      ghostId: string;
      approach: 'observe' | 'soothe' | 'ward' | 'confront';
    }
  | {
      actionId: string;
      expectedVersion: number;
      playerId: string;
      type: 'REST_RECOVER';
    }
  | {
      actionId: string;
      expectedVersion: number;
      playerId: string;
      type: 'HELP_ALLY';
      targetPlayerId: string;
    }
  | {
      actionId: string;
      expectedVersion: number;
      playerId: string;
      type: 'TRADE_ITEM';
      targetPlayerId: string;
      itemId: string;
    }
  | {
      actionId: string;
      expectedVersion: number;
      playerId: string;
      type: 'SCENARIO_ACTION';
      subAction:
        | 'disable_anchor'
        | 'align_clock'
        | 'gather_proof'
        | 'contain_threat'
        | 'accuse_player'
        | 'heart_destroy'
        | 'heart_bargain'
        | 'heart_quiet'
        | 'chosen_shift_door'
        | 'chosen_stoke_dread';
      targetId?: string;
    }
  | {
      actionId: string;
      expectedVersion: number;
      playerId: string;
      type: 'END_TURN';
    };

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export type GameActionInput = DistributiveOmit<
  GameAction,
  'actionId' | 'expectedVersion' | 'playerId'
>;

export interface ActionResult {
  ok: boolean;
  error?: string;
  state: GameState;
  discoveredRoomId?: string;
  triggeredRevelation?: boolean;
  soundCue?: 'door' | 'dice' | 'ghost' | 'omen' | 'revelation' | 'clue' | 'silence_bell' | 'step' | 'item' | 'ending';
  caption?: string;
}

export interface GameSettings {
  masterVolume: number;
  musicVolume: number;
  ambientVolume: number;
  muted: boolean;
  captionsEnabled: boolean;
  reducedMotion: boolean;
  reducedHorror: boolean;
  textScale: 'normal' | 'large';
  showDeveloperPanel: boolean;
  tutorialDismissed: boolean;
}

export interface ExpeditionArchiveEntry {
  id: string;
  seed: string;
  completedAt: number;
  characterName: string;
  characterId: string;
  scenarioTitle: string;
  victory: boolean;
  winningSide: string;
  turnsTaken: number;
  roomsDiscovered: number;
  secretsFound: number;
  memoryFlags: string[];
  routePoints: { x: number; z: number; floor: FloorId; name: string }[];
}

export interface SaveFileV1 {
  schemaVersion: 1;
  savedAt: number;
  gameState: GameState;
}

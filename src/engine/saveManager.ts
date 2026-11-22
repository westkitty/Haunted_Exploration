import type {
  ExpeditionArchiveEntry,
  GameSettings,
  GameState,
  SaveFileV1,
} from './types.ts';
import { CURRENT_SCHEMA_VERSION } from './actionResolver.ts';
import { getCharacterById } from './characters.ts';
import { validateSavedGameState } from './validateSavedGameState.ts';

const SAVE_KEY = 'thtr_active_save_v1';
const SETTINGS_KEY = 'thtr_settings_v1';
const ARCHIVE_KEY = 'thtr_expedition_archive_v1';
const MP_RESUME_KEY = 'thtr_mp_resume_v1';

export const DEFAULT_SETTINGS: GameSettings = {
  masterVolume: 0.72,
  musicVolume: 0.55,
  ambientVolume: 0.7,
  muted: false,
  captionsEnabled: true,
  reducedMotion: false,
  reducedHorror: false,
  textScale: 'normal',
  showDeveloperPanel: false,
  tutorialDismissed: false,
};

export function loadSettings(): GameSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: GameSettings): boolean {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}

export function saveActiveGame(state: GameState): boolean {
  if (state.isMultiplayer) return false; // Server / Firestore owns multiplayer saves
  try {
    const record: SaveFileV1 = {
      schemaVersion: 1,
      savedAt: Date.now(),
      gameState: state,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}

export function validateSaveObject(raw: unknown): { ok: true; state: GameState } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: 'Save data is not a valid JSON object.' };
  }
  const obj = raw as Partial<SaveFileV1>;
  if (obj.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    return {
      ok: false,
      error: `Incompatible save schema version (expected ${CURRENT_SCHEMA_VERSION}, got ${String(obj.schemaVersion)}).`,
    };
  }
  const gs = obj.gameState;
  if (
    !gs ||
    typeof gs !== 'object' ||
    typeof gs.seed !== 'string' ||
    typeof gs.rngState !== 'number' ||
    !Array.isArray(gs.players) ||
    gs.players.length === 0 ||
    !gs.rooms ||
    typeof gs.rooms !== 'object' ||
    !gs.rooms.room_entrance
  ) {
    return { ok: false, error: 'Save file is corrupted or missing required mansion state.' };
  }
  const invalid = validateSavedGameState(gs);
  if (invalid) return { ok: false, error: invalid };
  return { ok: true, state: gs as GameState };
}

export function loadActiveGame(): { ok: true; state: GameState; savedAt: number } | { ok: false; error?: string } {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return { ok: false };
    const parsed = JSON.parse(raw);
    const validated = validateSaveObject(parsed);
    if (!validated.ok) {
      return { ok: false, error: validated.error };
    }
    return {
      ok: true,
      state: validated.state,
      savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : Date.now(),
    };
  } catch {
    return { ok: false, error: 'Stored save data was corrupted and could not be read.' };
  }
}

export function hasSavedGame(): boolean {
  const res = loadActiveGame();
  return res.ok;
}

export function clearActiveGame(): boolean {
  try {
    localStorage.removeItem(SAVE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function exportSaveJson(state: GameState): string {
  const record: SaveFileV1 = {
    schemaVersion: 1,
    savedAt: Date.now(),
    gameState: state,
  };
  return JSON.stringify(record, null, 2);
}

export function importSaveJson(text: string): { ok: true; state: GameState } | { ok: false; error: string } {
  if (text.length > 1_048_576) return { ok: false, error: 'Save file exceeds 1 MiB.' };
  try {
    const parsed = JSON.parse(text);
    const validated = validateSaveObject(parsed);
    // Parsing and validation must not alter persistent storage.
    // SettingsModal stages this state; App commits it only after confirmation.
    return validated;
  } catch {
    return { ok: false, error: 'Could not parse JSON save file.' };
  }
}

export function loadArchive(): ExpeditionArchiveEntry[] {
  try {
    const raw = localStorage.getItem(ARCHIVE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, 30);
  } catch {
    return [];
  }
}

export function recordExpeditionToArchive(state: GameState): ExpeditionArchiveEntry | null {
  if (!state.ending) return null;
  const primary = state.players[0];
  const charDef = getCharacterById(primary?.characterId ?? 'archivist');
  const routePoints = (primary?.pathHistory ?? []).slice(0, 40).map((rid) => {
    const r = state.rooms[rid];
    return {
      x: r?.x ?? 0,
      z: r?.z ?? 0,
      floor: r?.floor ?? 0,
      name: r?.name ?? rid,
    };
  });

  const entry: ExpeditionArchiveEntry = {
    id: `${state.gameId}_${Date.now()}`,
    seed: state.seed,
    completedAt: Date.now(),
    characterName: charDef.name,
    characterId: charDef.id,
    scenarioTitle: state.scenario?.title ?? 'Unfinished Haunt',
    victory: state.ending.victory,
    winningSide: state.ending.winningSide,
    turnsTaken: state.ending.turnsTaken,
    roomsDiscovered: state.ending.roomsDiscovered,
    secretsFound: state.ending.secretsFound,
    memoryFlags: [...state.memoryFlags],
    routePoints,
  };

  try {
    const existing = loadArchive().filter((e) => !e.id.startsWith(`${state.gameId}_`));
    const updated = [entry, ...existing].slice(0, 24);
    localStorage.setItem(ARCHIVE_KEY, JSON.stringify(updated));
    return entry;
  } catch {
    // The archive must not be reported as recorded when persistence failed.
    return null;
  }
}

export function saveMpResumeRef(ref: { mode: 'firebase' | 'ws'; code: string; playerId: string; displayName: string } | null): void {
  try {
    if (!ref) localStorage.removeItem(MP_RESUME_KEY);
    else localStorage.setItem(MP_RESUME_KEY, JSON.stringify(ref));
  } catch {
    // noop
  }
}

export function loadMpResumeRef(): { mode: 'firebase' | 'ws'; code: string; playerId: string; displayName: string } | null {
  try {
    const raw = localStorage.getItem(MP_RESUME_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

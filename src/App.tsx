import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';
import { AudioDirector } from './audio/AudioDirector';
import {
  createNewGame,
  resolveGameAction,
} from './engine/actionResolver';
import { findRoomPath } from './engine/pathfinding';
import { getRoomTemplate } from './engine/rooms';
import {
  clearActiveGame,
  exportSaveJson,
  loadActiveGame,
  loadArchive,
  loadMpResumeRef,
  loadSettings,
  recordExpeditionToArchive,
  saveActiveGame,
  saveMpResumeRef,
  saveSettings,
} from './engine/saveManager';
import type {
  CameraMode,
  ExpeditionArchiveEntry,
  ExpeditionSize,
  FloorId,
  GameAction,
  GameActionInput,
  GameSettings,
  GameState,
  PlacedRoom,
} from './engine/types';
import type {
  CloudLobbyDoc,
  CloudLobbyPlayer,
  CloudPrivateRole,
} from './multiplayer/firestoreMultiplayer';
import {
  WsMultiplayerClient,
  type WsLobbySnapshot,
} from './multiplayer/wsMultiplayer';
import {
  MansionSceneManager,
  type HoverCursorState,
  type SceneInteractionHit,
} from './three/MansionSceneManager';
import { ErrorBoundary } from './components/ErrorBoundary';
import { MainMenu, type MpResumeInfo } from './components/MainMenu';
import type { MultiplayerTransport } from './components/MultiplayerLobby';
import { GameHud, type BoardPopup } from './components/GameHud';
import type { JournalTab } from './components/JournalDrawer';
import type { SettingsTab } from './components/SettingsModal';
import { ModalShell } from './components/ModalShell';

const CharacterSelect = lazy(() =>
  import('./components/CharacterSelect').then((m) => ({ default: m.CharacterSelect }))
);
const MultiplayerLobby = lazy(() =>
  import('./components/MultiplayerLobby').then((m) => ({ default: m.MultiplayerLobby }))
);
const EventModal = lazy(() =>
  import('./components/EventModal').then((m) => ({ default: m.EventModal }))
);
const PuzzleModal = lazy(() =>
  import('./components/PuzzleModal').then((m) => ({ default: m.PuzzleModal }))
);
const FloorPlan2D = lazy(() =>
  import('./components/FloorPlan2D').then((m) => ({ default: m.FloorPlan2D }))
);
const JournalDrawer = lazy(() =>
  import('./components/JournalDrawer').then((m) => ({ default: m.JournalDrawer }))
);
const EndingModal = lazy(() =>
  import('./components/EndingModal').then((m) => ({ default: m.EndingModal }))
);
const ArchiveModal = lazy(() =>
  import('./components/ArchiveModal').then((m) => ({ default: m.ArchiveModal }))
);
const SettingsModal = lazy(() =>
  import('./components/SettingsModal').then((m) => ({ default: m.SettingsModal }))
);
const DevInspector = lazy(() =>
  import('./components/DevInspector').then((m) => ({ default: m.DevInspector }))
);

const isFirebaseConfigured = Boolean(
  firebaseConfig &&
    firebaseConfig.apiKey &&
    firebaseConfig.projectId &&
    firebaseConfig.appId
);

let _firebaseModPromise: Promise<typeof import('./firebase/firebase')> | null = null;
function loadFirebaseModule() {
  if (!_firebaseModPromise) {
    _firebaseModPromise = import('./firebase/firebase');
  }
  return _firebaseModPromise;
}

let _firestoreMpModPromise: Promise<typeof import('./multiplayer/firestoreMultiplayer')> | null = null;
function loadFirestoreMpModule() {
  if (!_firestoreMpModPromise) {
    _firestoreMpModPromise = import('./multiplayer/firestoreMultiplayer');
  }
  return _firestoreMpModPromise;
}

type AppScreen = 'menu' | 'character_select' | 'multiplayer_lobby' | 'playing';
type ActiveSessionMode = 'solo' | 'ws' | 'firebase';

/**
 * Zero-rerender GPU-composited cursor whisper tooltip.
 * Mutates DOM transform & text directly when MansionSceneManager emits hover hints
 * so pointer movement causes ZERO React reconciliations in InnerApp or GameHud.
 */
interface HoverBus {
  emit: (hover: HoverCursorState | null) => void;
  subscribe: (fn: (hover: HoverCursorState | null) => void) => () => void;
}

function createHoverBus(): HoverBus {
  const listeners = new Set<(hover: HoverCursorState | null) => void>();
  return {
    emit(hover) {
      listeners.forEach((fn) => fn(hover));
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
}

const HoverWhisperTooltip: React.FC<{ bus: HoverBus; suppressed: boolean }> = React.memo(
  ({ bus, suppressed }) => {
    const rootRef = useRef<HTMLDivElement | null>(null);
    const dotRef = useRef<HTMLSpanElement | null>(null);
    const labelRef = useRef<HTMLSpanElement | null>(null);
    const suppressedRef = useRef(suppressed);
    suppressedRef.current = suppressed;

    useEffect(() => {
      if (suppressed && rootRef.current) {
        rootRef.current.style.opacity = '0';
      }
    }, [suppressed]);

    useEffect(() => {
      return bus.subscribe((hover) => {
        const el = rootRef.current;
        if (!el) return;
        if (!hover || suppressedRef.current) {
          el.style.opacity = '0';
          return;
        }
        const estWidth = Math.min(260, Math.max(120, hover.label.length * 7.5 + 32));
        const left = Math.min(window.innerWidth - estWidth - 16, Math.max(16, hover.x + 16));
        const top = Math.min(window.innerHeight - 48, Math.max(16, hover.y - 36));
        el.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`;
        el.style.opacity = '1';
        if (labelRef.current && labelRef.current.textContent !== hover.label) {
          labelRef.current.textContent = hover.label;
        }
        if (dotRef.current) {
          dotRef.current.style.backgroundColor =
            hover.kind === 'unexplored_door'
              ? '#e6b868'
              : hover.kind === 'ghost' || hover.kind === 'scenario_objective'
                ? '#86c7b6'
                : '#c99c52';
        }
      });
    }, [bus]);

    return (
      <div
        ref={rootRef}
        style={{ opacity: 0, transform: 'translate3d(-9999px, -9999px, 0)' }}
        className="fixed top-0 left-0 z-30 pointer-events-none select-none will-change-transform transition-opacity duration-75"
      >
        <div className="flex items-center gap-2 px-2.5 py-1 bg-[#140f0c]/88 border-b border-[#d4aa62]/65 shadow-[0_6px_20px_rgba(0,0,0,0.65)]">
          <span ref={dotRef} className="w-1.5 h-1.5 rotate-45 shrink-0 bg-[#c99c52]" />
          <span
            ref={labelRef}
            className="font-body text-xs text-[#f5ebd8] tracking-normal whitespace-nowrap"
          />
        </div>
      </div>
    );
  }
);

function makeActionId(playerId: string): string {
  return `act_${playerId.slice(0, 8)}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 7)}`;
}

function createBackdropPreviewState(characterId = 'archivist'): GameState {
  let state = createNewGame({
    seed: 'BLACKWOOD-1889',
    expeditionSize: 'standard',
    players: [{ id: 'preview', displayName: 'Preview', characterId }],
  });
  const r1 = resolveGameAction(state, {
    actionId: 'prev_1',
    expectedVersion: state.version,
    playerId: 'preview',
    type: 'DISCOVER_ROOM',
    direction: 'W',
  });
  if (r1.ok) {
    state = r1.state;
    state.activeEvent = null;
  }
  const r2 = resolveGameAction(state, {
    actionId: 'prev_2',
    expectedVersion: state.version,
    playerId: 'preview',
    type: 'MOVE_ROOM',
    targetRoomId: 'room_entrance',
  });
  if (r2.ok) {
    state = r2.state;
    state.activeEvent = null;
  }
  const r3 = resolveGameAction(state, {
    actionId: 'prev_3',
    expectedVersion: state.version,
    playerId: 'preview',
    type: 'MOVE_ROOM',
    targetRoomId: 'room_staircase',
  });
  if (r3.ok) {
    state = r3.state;
    state.activeEvent = null;
    const r4 = resolveGameAction(state, {
      actionId: 'prev_4',
      expectedVersion: state.version,
      playerId: 'preview',
      type: 'DISCOVER_ROOM',
      direction: 'N',
    });
    if (r4.ok) {
      state = r4.state;
      state.activeEvent = null;
    }
  }
  return state;
}

function InnerApp() {
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<MansionSceneManager | null>(null);
  const audioRef = useRef<AudioDirector | null>(null);
  const wsClientRef = useRef<WsMultiplayerClient | null>(null);

  const [settings, setSettings] = useState<GameSettings>(() => loadSettings());
  const [screen, setScreen] = useState<AppScreen>('menu');
  const [sessionMode, setSessionMode] = useState<ActiveSessionMode>('solo');
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const [localPlayerId, setLocalPlayerId] = useState<string>('solo_player');

  const [cameraMode, setCameraMode] = useState<CameraMode>('dollhouse');
  const [floorFilter, setFloorFilter] = useState<FloorId | 'all'>('all');
  const hoverBus = useMemo(() => createHoverBus(), []);
  const [boardPopups, setBoardPopups] = useState<BoardPopup[]>([]);
  const [previewCharId, setPreviewCharId] = useState<string>('archivist');
  const [audioCaption, setAudioCaption] = useState<string | null>(null);
  const [actionToast, setActionToast] = useState<string | null>(null);
  const [stairPromptRooms, setStairPromptRooms] = useState<PlacedRoom[] | null>(null);
  const [ghostPromptId, setGhostPromptId] = useState<string | null>(null);
  const [firebaseActivated, setFirebaseActivated] = useState<boolean>(false);

  // Modals & Drawers
  const [showFloorPlan, setShowFloorPlan] = useState(false);
  const [showJournal, setShowJournal] = useState(false);
  const [journalInitialTab, setJournalInitialTab] = useState<JournalTab>('log');
  const [showSettings, setShowSettings] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<SettingsTab>('audio');
  const [showArchive, setShowArchive] = useState(false);
  const [revelationBanner, setRevelationBanner] = useState<{
    title: string;
    subtitle: string;
    opening: string;
    alteredRule: string;
  } | null>(null);

  // Saves, Archive & Multiplayer Resume Ref
  const [savedSummary, setSavedSummary] = useState<{
    hasSave: boolean;
    seed?: string;
    turn?: number;
  }>(() => {
    const loaded = loadActiveGame();
    return loaded.ok
      ? { hasSave: true, seed: loaded.state.seed, turn: loaded.state.turn }
      : { hasSave: false };
  });
  const [mpResumeRef, setMpResumeRef] = useState<MpResumeInfo | null>(() => loadMpResumeRef());
  const [archiveEntries, setArchiveEntries] = useState<ExpeditionArchiveEntry[]>(() =>
    loadArchive()
  );
  const [replaySeedPrefill, setReplaySeedPrefill] = useState<string | undefined>(undefined);

  // Multiplayer State
  const [mpTransport, setMpTransport] = useState<MultiplayerTransport>('ws');
  const [mpError, setMpError] = useState<string | null>(null);
  const [inviteJoinPrefill, setInviteJoinPrefill] = useState<string | undefined>(undefined);

  // Firebase Cloud Lobby State
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [cloudLobbyCode, setCloudLobbyCode] = useState<string | null>(null);
  const [cloudLobby, setCloudLobby] = useState<CloudLobbyDoc | null>(null);
  const [cloudPlayers, setCloudPlayers] = useState<CloudLobbyPlayer[]>([]);
  const [cloudPrivateRole, setCloudPrivateRole] = useState<CloudPrivateRole | null>(null);

  // WebSocket Live Server State
  const [wsStatus, setWsStatus] = useState<
    'connecting' | 'connected' | 'reconnecting' | 'disconnected'
  >('disconnected');
  const [wsPlayerId, setWsPlayerId] = useState<string>('');
  const [wsLobby, setWsLobby] = useState<WsLobbySnapshot | null>(null);

  // Refs for latest state inside Three.js event callbacks & keyboard handlers
  const stateRef = useRef<GameState | null>(null);
  const localPlayerIdRef = useRef<string>(localPlayerId);
  const sessionModeRef = useRef<ActiveSessionMode>(sessionMode);
  const cloudLobbyCodeRef = useRef<string | null>(cloudLobbyCode);
  const wsLobbyCodeRef = useRef<string | null>(wsLobby?.lobbyCode ?? null);
  const lastRecordedEndingIdRef = useRef<string | null>(null);
  const prevPhaseRef = useRef<string | null>(null);
  const prevSilenceCounterRef = useRef<number>(0);
  const prevRoomCountRef = useRef<number>(0);
  const prevModalKeyRef = useRef<string | null>(null);
  const walkTimersRef = useRef<number[]>([]);
  const lastClickScreenPosRef = useRef<{ x: number; y: number } | null>(null);

  stateRef.current = gameState;
  localPlayerIdRef.current = localPlayerId;
  sessionModeRef.current = sessionMode;
  cloudLobbyCodeRef.current = cloudLobbyCode;
  wsLobbyCodeRef.current = wsLobby?.lobbyCode ?? null;

  const anyOverlayOpen = Boolean(
    gameState?.activeEvent ||
      gameState?.activePuzzle ||
      showFloorPlan ||
      showJournal ||
      showSettings ||
      showArchive ||
      revelationBanner ||
      stairPromptRooms ||
      ghostPromptId
  );
  const anyOverlayOpenRef = useRef<boolean>(anyOverlayOpen);
  anyOverlayOpenRef.current = anyOverlayOpen;

  const previewState = useMemo(
    () => createBackdropPreviewState(previewCharId),
    [previewCharId]
  );

  const clearScheduledWalks = useCallback(() => {
    for (const id of walkTimersRef.current) {
      window.clearTimeout(id);
    }
    walkTimersRef.current = [];
  }, []);

  const spawnBoardPopup = useCallback(
    (
      text: string,
      anchor?: { x: number; y: number } | string | null,
      tone: 'gold' | 'teal' | 'crimson' = 'gold'
    ) => {
      let pos: { x: number; y: number } | null = null;
      if (typeof anchor === 'string') {
        pos = sceneRef.current?.projectRoomToScreen(anchor) ?? null;
      } else if (anchor && typeof anchor === 'object') {
        pos = anchor;
      }
      if (!pos) {
        pos = lastClickScreenPosRef.current ?? {
          x: window.innerWidth * 0.5,
          y: window.innerHeight * 0.45,
        };
      }
      const id = `pop_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      setBoardPopups((prev) => [...prev.slice(-5), { id, text, x: pos.x, y: pos.y - 12, tone }]);
      window.setTimeout(() => {
        setBoardPopups((prev) => prev.filter((p) => p.id !== id));
      }, 1180);
    },
    []
  );

  const showToast = useCallback((msg: string) => {
    setActionToast(msg);
    window.setTimeout(() => {
      setActionToast((cur) => (cur === msg ? null : cur));
    }, 3200);
  }, []);

  // Initialize AudioDirector once
  useEffect(() => {
    const director = new AudioDirector(settings, (caption) => {
      setAudioCaption(caption);
      window.setTimeout(() => {
        setAudioCaption((cur) => (cur === caption ? null : cur));
      }, 3600);
    });
    audioRef.current = director;

    const unlockOnce = () => {
      director.unlock();
      window.removeEventListener('pointerdown', unlockOnce);
      window.removeEventListener('keydown', unlockOnce);
    };
    window.addEventListener('pointerdown', unlockOnce);
    window.addEventListener('keydown', unlockOnce);

    return () => {
      window.removeEventListener('pointerdown', unlockOnce);
      window.removeEventListener('keydown', unlockOnce);
      director.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync settings to AudioDirector, SceneManager, localStorage, and root html font-size (fixes Text Scale: Large!)
  useEffect(() => {
    if (!saveSettings(settings)) {
      setStorageWarning((previous) => previous ?? 'Browser storage is unavailable. Settings may not survive a reload.');
    }
    audioRef.current?.updateSettings(settings);
    sceneRef.current?.setReducedMotion(settings.reducedMotion);
    document.documentElement.style.fontSize = settings.textScale === 'large' ? '115%' : '100%';
    return () => {
      document.documentElement.style.fontSize = '';
    };
  }, [settings]);

  // Lazy-activate Firebase SDK only when user opens Multiplayer Lobby or joins a Firebase invite
  useEffect(() => {
    if (!isFirebaseConfigured) return;
    if (screen === 'multiplayer_lobby' || mpTransport === 'firebase' || cloudLobbyCode) {
      setFirebaseActivated(true);
    }
  }, [screen, mpTransport, cloudLobbyCode]);

  // Firebase auth subscription & connection probe
  useEffect(() => {
    if (!isFirebaseConfigured || !firebaseActivated) return;
    let cancelled = false;
    let unsub: (() => void) | null = null;
    loadFirebaseModule()
      .then((fb) => {
        if (cancelled) return;
        fb.testFirebaseConnection().catch(() => {});
        unsub = fb.subscribeAuth((user) => {
          setFirebaseUser(user);
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [firebaseActivated]);

  // Check URL invite query (?lobby=ABCDEF&mode=ws|firebase)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('lobby');
    const mode = params.get('mode');
    if (code && /^[A-Za-z0-9]{6}$/.test(code)) {
      setInviteJoinPrefill(code.toUpperCase());
      if (mode === 'firebase' || mode === 'ws') {
        setMpTransport(mode);
      }
      setScreen('multiplayer_lobby');
    }
  }, []);

  // A failed save never becomes a false success badge. Preserve the in-memory run
  // and offer an independent JSON export while localStorage is unavailable.
  const persistSoloSave = useCallback((state: GameState) => {
    if (saveActiveGame(state)) {
      setSavedSummary({ hasSave: true, seed: state.seed, turn: state.turn });
      setStorageWarning(null);
      return true;
    }
    const previous = loadActiveGame();
    setSavedSummary(previous.ok
      ? { hasSave: true, seed: previous.state.seed, turn: previous.state.turn }
      : { hasSave: false });
    setStorageWarning('Autosave failed. Your expedition is still running in memory. Download a save before closing or reloading this tab.');
    return false;
  }, []);

  const downloadRecoverySave = useCallback(() => {
    const state = stateRef.current;
    if (!state || state.isMultiplayer) return;
    try {
      const blob = new Blob([exportSaveJson(state)], { type: 'application/json' });
      const href = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = href;
      link.download = `haunted-recovery-${state.seed.toLowerCase()}-t${state.turn}.json`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(href), 1000);
    } catch {
      setStorageWarning('Recovery download failed. Keep this tab open and retry the export.');
    }
  }, []);

  // Authoritative Action Dispatch (handles Solo, Live WebSocket, and Cloud Firestore)
  const dispatchAction = useCallback(
    async (partialAction: GameActionInput) => {
      const current = stateRef.current;
      if (!current) return;
      const pid = localPlayerIdRef.current;

      const fullAction = {
        ...partialAction,
        actionId: makeActionId(pid),
        expectedVersion: current.version,
        playerId: pid,
      } as GameAction;

      audioRef.current?.unlock();

      if (sessionModeRef.current === 'solo') {
        const res = resolveGameAction(current, fullAction);
        if (!res.ok) {
          if (res.error) showToast(res.error);
          return;
        }
        setGameState(res.state);
        persistSoloSave(res.state);
        if (partialAction.type === 'END_TURN') {
          audioRef.current?.playCue('turn_bell');
          const nextMe = res.state.players.find((p) => p.id === pid);
          if (nextMe) {
            spawnBoardPopup(`Turn ${res.state.turn}`, nextMe.roomId, 'gold');
          }
        } else if (res.soundCue) {
          audioRef.current?.playCue(res.soundCue);
        }

        const meAfter = res.state.players.find((p) => p.id === pid);
        const meBefore = current.players.find((p) => p.id === pid);
        if (res.discoveredRoomId) {
          sceneRef.current?.triggerDiscoveryAnimation(res.discoveredRoomId);
          const newRoom = res.state.rooms[res.discoveredRoomId];
          spawnBoardPopup(
            newRoom ? newRoom.name : 'Room Discovered',
            lastClickScreenPosRef.current ?? res.discoveredRoomId,
            'gold'
          );
        } else if (partialAction.type === 'MOVE_ROOM' && meAfter) {
          spawnBoardPopup('−1 AP', lastClickScreenPosRef.current ?? meAfter.roomId, 'gold');
        } else if (partialAction.type === 'SEARCH_ROOM' && meAfter) {
          const gainedClue = res.state.cluesFound.length > current.cluesFound.length;
          const gainedItem = meBefore && meAfter.inventory.length > meBefore.inventory.length;
          if (gainedClue) {
            spawnBoardPopup('+1 Clue', lastClickScreenPosRef.current ?? meAfter.roomId, 'teal');
          } else if (gainedItem) {
            spawnBoardPopup('Relic Found', lastClickScreenPosRef.current ?? meAfter.roomId, 'gold');
          } else {
            spawnBoardPopup('Searched', lastClickScreenPosRef.current ?? meAfter.roomId, 'gold');
          }
        } else if (partialAction.type === 'REST_RECOVER' && meAfter) {
          spawnBoardPopup('Steadied', meAfter.roomId, 'teal');
        }

        if (res.caption) {
          showToast(res.caption);
        }
        return;
      }

      if (sessionModeRef.current === 'ws') {
        const code = wsLobbyCodeRef.current;
        if (!code || !wsClientRef.current) return;
        if (partialAction.type === 'END_TURN') {
          audioRef.current?.playCue('turn_bell');
        }
        wsClientRef.current.submitAction(code, fullAction);
        return;
      }

      if (sessionModeRef.current === 'firebase') {
        const code = cloudLobbyCodeRef.current;
        if (!code) return;
        try {
          const mp = await loadFirestoreMpModule();
          const res = await mp.submitCloudAction(code, fullAction);
          if (!res.ok && res.error) {
            showToast(res.error);
          } else {
            if (partialAction.type === 'END_TURN') {
              audioRef.current?.playCue('turn_bell');
            } else if (res.soundCue) {
              audioRef.current?.playCue(res.soundCue);
            }
            if (res.caption) showToast(res.caption);
          }
        } catch (err) {
          showToast(err instanceof Error ? err.message : 'Cloud action failed.');
        }
      }
    },
    [persistSoloSave, showToast, spawnBoardPopup]
  );

  // Schedule smooth hop-by-hop auto-walk across 1..N connected rooms, optionally followed by a room action or UI callback
  const schedulePathAndAction = useCallback(
    (path: string[], followUpAction?: GameActionInput, onArrived?: () => void) => {
      clearScheduledWalks();
      if (path.length === 0) {
        if (followUpAction) void dispatchAction(followUpAction);
        onArrived?.();
        return;
      }

      void dispatchAction({ type: 'MOVE_ROOM', targetRoomId: path[0] });

      for (let i = 1; i < path.length; i++) {
        const targetRoomId = path[i];
        const tid = window.setTimeout(() => {
          const cur = stateRef.current;
          if (!cur || cur.phase === 'ended' || cur.activeEvent || cur.activePuzzle) return;
          void dispatchAction({ type: 'MOVE_ROOM', targetRoomId });
        }, i * 460);
        walkTimersRef.current.push(tid);
      }

      if (followUpAction || onArrived) {
        const tid = window.setTimeout(() => {
          const cur = stateRef.current;
          if (!cur || cur.phase === 'ended' || cur.activeEvent || cur.activePuzzle) return;
          if (followUpAction) void dispatchAction(followUpAction);
          onArrived?.();
        }, path.length * 460);
        walkTimersRef.current.push(tid);
      }
    },
    [clearScheduledWalks, dispatchAction]
  );

  // Initialize Three.js MansionSceneManager once inside isolated canvasHostRef
  useEffect(() => {
    const host = canvasHostRef.current;
    if (!host) return;

    const manager = new MansionSceneManager(host, {
      onHoverHint: (hover) => hoverBus.emit(hover),
      onHoverTick: () => audioRef.current?.playCue('hover_tick'),
      onPawnLanded: () => audioRef.current?.playCue('piece_place'),
      onSelectHit: (hit: SceneInteractionHit, screenPos: { x: number; y: number }) => {
        const cur = stateRef.current;
        if (!cur || cur.phase === 'ended' || cur.activeEvent || cur.activePuzzle) return;
        const activeP = cur.players[cur.currentPlayerIndex];
        const pid = localPlayerIdRef.current;
        if (!activeP || activeP.id !== pid) {
          showToast(`Waiting for ${activeP?.displayName ?? 'active explorer'}’s turn.`);
          return;
        }

        lastClickScreenPosRef.current = screenPos;
        audioRef.current?.unlock();

        const walkThenAct = (
          roomId: string,
          action: GameActionInput,
          outOfRangeMsg: string
        ) => {
          if (roomId === activeP.roomId) {
            void dispatchAction(action);
            return;
          }
          const path = findRoomPath(cur, activeP.roomId, roomId);
          if (path && path.length > 0 && path.length + 1 <= activeP.actionPoints) {
            schedulePathAndAction(path, action);
          } else if (path && path.length > 0 && path.length <= activeP.actionPoints) {
            schedulePathAndAction(path);
          } else {
            showToast(outOfRangeMsg);
          }
        };

        if (hit.kind === 'unexplored_door' && hit.direction) {
          setStairPromptRooms(null);
          setGhostPromptId(null);
          walkThenAct(
            hit.roomId,
            { type: 'DISCOVER_ROOM', direction: hit.direction },
            'Not enough AP to reach and open that doorway this turn.'
          );
        } else if (hit.kind === 'connected_door' && hit.targetRoomId) {
          setStairPromptRooms(null);
          setGhostPromptId(null);
          const path = findRoomPath(cur, activeP.roomId, hit.targetRoomId);
          if (path && path.length > 0 && path.length <= activeP.actionPoints) {
            schedulePathAndAction(path);
          } else {
            void dispatchAction({ type: 'MOVE_ROOM', targetRoomId: hit.targetRoomId });
          }
        } else if (hit.kind === 'room_floor' && hit.roomId !== activeP.roomId) {
          setStairPromptRooms(null);
          setGhostPromptId(null);
          const path = findRoomPath(cur, activeP.roomId, hit.roomId);
          if (path && path.length > 0) {
            if (path.length <= activeP.actionPoints) {
              schedulePathAndAction(path);
            } else if (activeP.actionPoints > 0) {
              schedulePathAndAction(path.slice(0, activeP.actionPoints));
            } else {
              spawnBoardPopup('0 AP left', screenPos, 'crimson');
              showToast('No action points left — press End Turn (E) to continue.');
            }
          } else {
            void dispatchAction({ type: 'MOVE_ROOM', targetRoomId: hit.roomId });
          }
        } else if (hit.kind === 'search_room') {
          setStairPromptRooms(null);
          setGhostPromptId(null);
          walkThenAct(
            hit.roomId,
            { type: 'SEARCH_ROOM' },
            'Move closer before searching that curio chest.'
          );
        } else if (hit.kind === 'staircase') {
          setGhostPromptId(null);
          if (hit.roomId !== activeP.roomId) {
            setStairPromptRooms(null);
            const path = findRoomPath(cur, activeP.roomId, hit.roomId);
            if (path && path.length > 0 && path.length <= activeP.actionPoints) {
              schedulePathAndAction(path);
            } else {
              void dispatchAction({ type: 'MOVE_ROOM', targetRoomId: hit.roomId });
            }
          } else {
            const links = (hit.stairLinks ?? [])
              .map((rid) => cur.rooms[rid])
              .filter((r): r is PlacedRoom => Boolean(r));
            if (links.length === 1) {
              setStairPromptRooms(null);
              void dispatchAction({ type: 'MOVE_ROOM', targetRoomId: links[0].id });
            } else if (links.length > 1) {
              setStairPromptRooms(links);
            }
          }
        } else if (hit.kind === 'scenario_objective' && hit.subAction) {
          setStairPromptRooms(null);
          setGhostPromptId(null);
          const sub = hit.subAction as
            | 'disable_anchor'
            | 'align_clock'
            | 'gather_proof'
            | 'contain_threat'
            | 'heart_destroy'
            | 'heart_quiet'
            | 'heart_bargain'
            | 'chosen_stoke_dread';
          walkThenAct(
            hit.roomId,
            { type: 'SCENARIO_ACTION', subAction: sub },
            'Move into that room to interact with the revelation mechanism.'
          );
        } else if (hit.kind === 'interactable' && hit.interactableId) {
          setStairPromptRooms(null);
          setGhostPromptId(null);
          walkThenAct(
            hit.roomId,
            { type: 'INSPECT_OBJECT', interactableId: hit.interactableId },
            'Move into that room to inspect objects inside it.'
          );
        } else if (hit.kind === 'ghost' && hit.ghostId) {
          setStairPromptRooms(null);
          const gid = hit.ghostId;
          if (hit.roomId === activeP.roomId) {
            setGhostPromptId(gid);
          } else {
            const path = findRoomPath(cur, activeP.roomId, hit.roomId);
            if (path && path.length > 0 && path.length + 1 <= activeP.actionPoints) {
              schedulePathAndAction(path, undefined, () => setGhostPromptId(gid));
            } else if (path && path.length > 0 && path.length <= activeP.actionPoints) {
              schedulePathAndAction(path);
            } else {
              showToast('Move into the spirit’s room to interact with it.');
            }
          }
        }
      },
    });

    manager.setReducedMotion(settings.reducedMotion);
    manager.setMenuBackdropMode(true);
    manager.setCameraMode('dollhouse');
    manager.syncGameState(previewState, 'preview');
    sceneRef.current = manager;

    // Deliberately restricted to an explicit local DEV URL. The production
    // bundle exposes no benchmarking handle, and rendering remains unchanged.
    const enablePerfProbe = import.meta.env.DEV &&
      new URLSearchParams(window.location.search).get('perf') === '1';
    if (enablePerfProbe) {
      Object.defineProperty(window, '__HAUNTED_P006__', {
        configurable: true,
        value: {
          start: () => manager.beginPerformanceCapture(),
          stop: () => manager.stopPerformanceCapture(),
          read: () => manager.readPerformanceCapture(),
        },
      });
    }

    return () => {
      if (enablePerfProbe) Reflect.deleteProperty(window, '__HAUNTED_P006__');
      clearScheduledWalks();
      manager.dispose();
      sceneRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync 3D scene & atmospheric audio whenever gameState or screen changes
  useEffect(() => {
    const manager = sceneRef.current;
    if (!manager) return;

    if (screen !== 'playing' || !gameState) {
      setStairPromptRooms(null);
      setGhostPromptId(null);
      manager.setMenuBackdropMode(true);
      manager.setCameraMode('dollhouse');
      manager.setFloorFilter('all');
      manager.syncGameState(previewState, 'preview');
      return;
    }

    setStairPromptRooms(null);
    manager.setMenuBackdropMode(false);
    manager.syncGameState(gameState, localPlayerId);

    if (
      gameState.roomOrder.length > prevRoomCountRef.current &&
      prevRoomCountRef.current > 0 &&
      gameState.lastRoomDiscoveredId
    ) {
      manager.triggerDiscoveryAnimation(gameState.lastRoomDiscoveredId);
    }
    prevRoomCountRef.current = gameState.roomOrder.length;

    const me =
      gameState.players.find((p) => p.id === localPlayerId) ??
      gameState.players[gameState.currentPlayerIndex];
    const room = me ? gameState.rooms[me.roomId] : null;
    if (room) {
      const tpl = getRoomTemplate(room.templateId);
      audioRef.current?.setRoomAtmosphere(tpl.soundProfile, gameState.phase, gameState.pressure);
    }

    if (gameState.silenceCueCounter > prevSilenceCounterRef.current) {
      audioRef.current?.triggerHouseGoesSilent(true);
    }
    prevSilenceCounterRef.current = gameState.silenceCueCounter;

    if (
      prevPhaseRef.current === 'exploration' &&
      gameState.phase === 'revelation' &&
      gameState.scenario
    ) {
      manager.triggerRevelationVisual();
      setCameraMode('dollhouse');
      audioRef.current?.playCue('revelation');
      setRevelationBanner({
        title: gameState.scenario.title,
        subtitle: gameState.scenario.subtitle,
        opening: gameState.scenario.publicObjective,
        alteredRule: gameState.scenario.alteredRuleText,
      });
    }

    if (gameState.phase === 'ended' && gameState.ending) {
      setCameraMode('dollhouse');
      manager.setCameraMode('dollhouse');
      manager.setFloorFilter('all');
      setFloorFilter('all');
      if (lastRecordedEndingIdRef.current !== gameState.gameId) {
        lastRecordedEndingIdRef.current = gameState.gameId;
        const recorded = recordExpeditionToArchive(gameState);
        setArchiveEntries(loadArchive());
        if (!gameState.isMultiplayer) {
          if (!recorded) {
            setStorageWarning('The ending could not be archived. Download your completed expedition before leaving.');
          } else if (clearActiveGame()) {
            setSavedSummary({ hasSave: false });
            setStorageWarning(null);
          } else {
            setStorageWarning('The ending was archived, but the old save could not be cleared. Export your ending if needed.');
          }
        } else {
          saveMpResumeRef(null);
          setMpResumeRef(null);
        }
      }
    }

    const modalKey = gameState.activeEvent
      ? `ev:${gameState.activeEvent.eventId}:${gameState.activeEvent.roomId}`
      : gameState.activePuzzle
        ? `pz:${gameState.activePuzzle.puzzleId}:${gameState.activePuzzle.roomId}`
        : null;
    if (modalKey && modalKey !== prevModalKeyRef.current) {
      audioRef.current?.playCue('card_deal');
      clearScheduledWalks();
      setGhostPromptId(null);
    }
    prevModalKeyRef.current = modalKey;

    prevPhaseRef.current = gameState.phase;
  }, [screen, gameState, localPlayerId, previewState, clearScheduledWalks]);

  useEffect(() => {
    if (screen !== 'playing') return;
    sceneRef.current?.setCameraMode(cameraMode);
  }, [cameraMode, screen]);

  useEffect(() => {
    if (screen !== 'playing') return;
    sceneRef.current?.setFloorFilter(floorFilter);
  }, [floorFilter, screen]);

  // Global keyboard shortcuts — cleanly gated when any modal/drawer/prompt is open!
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey
      ) {
        return;
      }

      if (e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        setSettings((s) => ({ ...s, showDeveloperPanel: !s.showDeveloperPanel }));
        return;
      }

      if (screen !== 'playing') return;

      // Never hijack Tab or board shortcuts while a modal, drawer, or prompt has focus
      if (anyOverlayOpenRef.current) {
        return;
      }

      const key = e.key.toLowerCase();
      if (e.key === 'Tab') {
        e.preventDefault();
        setCameraMode((m) => (m === 'immersive' ? 'dollhouse' : 'immersive'));
      } else if (e.code === 'Space') {
        e.preventDefault();
        sceneRef.current?.focusActiveExplorer();
      } else if (key === 'e') {
        const cur = stateRef.current;
        if (!cur || cur.phase === 'ended' || cur.activeEvent || cur.activePuzzle) return;
        const activeP = cur.players[cur.currentPlayerIndex];
        if (activeP && activeP.id === localPlayerIdRef.current && activeP.alive) {
          void dispatchAction({ type: 'END_TURN' });
        }
      } else if (e.key === '0') {
        setFloorFilter('all');
      } else if (e.key === '1') {
        setFloorFilter(1);
      } else if (e.key === '2') {
        setFloorFilter(0);
      } else if (e.key === '3') {
        setFloorFilter(-1);
      } else if (key === 'm') {
        setShowFloorPlan((v) => !v);
      } else if (key === 'j') {
        setJournalInitialTab('log');
        setShowJournal((v) => !v);
      } else if (e.key === '?') {
        e.preventDefault();
        setSettingsInitialTab('controls');
        setShowSettings(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [screen, dispatchAction]);

  // Initialize WebSocket multiplayer client when visiting Multiplayer Lobby or playing WS
  const ensureWsClient = useCallback(() => {
    if (wsClientRef.current) return wsClientRef.current;
    const client = new WsMultiplayerClient({
      onConnected: (pid) => setWsPlayerId(pid),
      onStatusChange: (st) => setWsStatus(st),
      onError: (err) => setMpError(err),
      onActionFeedback: (fb) => {
        if (!fb.ok && fb.error) {
          showToast(fb.error);
        } else {
          if (fb.soundCue) {
            audioRef.current?.playCue(
              fb.soundCue as Parameters<AudioDirector['playCue']>[0]
            );
          }
          if (fb.caption) showToast(fb.caption);
        }
      },
      onLobbyUpdate: (snap) => {
        setMpError(null);
        setWsLobby(snap);
        const meMember = snap.members.find((m) => m.playerId === client.playerId);
        const resumeObj: MpResumeInfo = {
          mode: 'ws',
          code: snap.lobbyCode,
          playerId: client.playerId,
          displayName: meMember?.displayName || 'Explorer',
        };
        saveMpResumeRef(resumeObj);
        setMpResumeRef(resumeObj);

        if (snap.state && (snap.status === 'active' || snap.status === 'finished')) {
          setSessionMode('ws');
          setLocalPlayerId(client.playerId);
          setGameState(snap.state);
          setScreen((prev) => (prev === 'multiplayer_lobby' ? 'playing' : prev));
        }
      },
    });
    setWsPlayerId(client.playerId);
    wsClientRef.current = client;
    client.connect();
    return client;
  }, [showToast]);

  useEffect(() => {
    if (screen === 'multiplayer_lobby' && mpTransport === 'ws') {
      ensureWsClient();
    }
  }, [screen, mpTransport, ensureWsClient]);

  useEffect(() => {
    return () => {
      wsClientRef.current?.disconnect();
    };
  }, []);

  // Subscribe to Cloud Firestore lobby when active
  useEffect(() => {
    if (!cloudLobbyCode || !firebaseUser) return;
    let cancelled = false;
    let unsub: (() => void) | null = null;
    loadFirestoreMpModule()
      .then((mp) => {
        if (cancelled) return;
        const sub = mp.subscribeToCloudLobby(cloudLobbyCode, firebaseUser.uid, {
          onLobby: (docData) => {
            setCloudLobby(docData);
          },
          onPlayers: (plist) => {
            setCloudPlayers(plist);
          },
          onPrivateRole: (roleDoc) => {
            setCloudPrivateRole(roleDoc);
          },
          onError: (msg) => setMpError(msg),
        });
        unsub = sub.unsubscribe;
      })
      .catch((err) => {
        if (!cancelled) setMpError(err instanceof Error ? err.message : 'Cloud lobby error.');
      });
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [cloudLobbyCode, firebaseUser]);

  // Merge Firestore public state + caller's isolated privateRole into active GameState
  useEffect(() => {
    if (!cloudLobby || !firebaseUser) return;
    if (
      (cloudLobby.status === 'active' || cloudLobby.status === 'finished') &&
      cloudLobby.publicState
    ) {
      let cancelled = false;
      loadFirestoreMpModule()
        .then((mp) => {
          if (cancelled || !cloudLobby.publicState) return;
          const merged = mp.mergePrivateRoleIntoState(
            cloudLobby.publicState,
            firebaseUser.uid,
            cloudPrivateRole
          );
          setSessionMode('firebase');
          setLocalPlayerId(firebaseUser.uid);
          setGameState(merged);
          setScreen((prev) => (prev === 'multiplayer_lobby' ? 'playing' : prev));
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }
  }, [cloudLobby, cloudPrivateRole, firebaseUser]);

  // Launch Solo Game
  const handleLaunchSolo = (opts: {
    characterId: string;
    displayName: string;
    seed: string;
    expeditionSize: ExpeditionSize;
  }) => {
    audioRef.current?.unlock();
    const state = createNewGame({
      seed: opts.seed,
      expeditionSize: opts.expeditionSize,
      isMultiplayer: false,
      players: [
        {
          id: 'solo_player',
          displayName: opts.displayName,
          characterId: opts.characterId,
        },
      ],
    });
    prevPhaseRef.current = state.phase;
    prevRoomCountRef.current = state.roomOrder.length;
    prevSilenceCounterRef.current = state.silenceCueCounter;
    lastRecordedEndingIdRef.current = null;
    setSessionMode('solo');
    setLocalPlayerId('solo_player');
    setGameState(state);
    persistSoloSave(state);
    setCameraMode('dollhouse');
    setFloorFilter('all');
    setScreen('playing');
    audioRef.current?.playCue('door');
  };

  const handleContinueSolo = () => {
    const loaded = loadActiveGame();
    if (!loaded.ok) {
      showToast(loaded.error ?? 'Saved expedition could not be loaded.');
      setSavedSummary({ hasSave: false });
      return;
    }
    audioRef.current?.unlock();
    prevPhaseRef.current = loaded.state.phase;
    prevRoomCountRef.current = loaded.state.roomOrder.length;
    prevSilenceCounterRef.current = loaded.state.silenceCueCounter;
    lastRecordedEndingIdRef.current = null;
    setSessionMode('solo');
    setLocalPlayerId(loaded.state.players[0].id);
    setGameState(loaded.state);
    setCameraMode('dollhouse');
    setFloorFilter('all');
    setScreen('playing');
  };

  const handleImportSave = (imported: GameState) => {
    audioRef.current?.unlock();
    prevPhaseRef.current = imported.phase;
    prevRoomCountRef.current = imported.roomOrder.length;
    prevSilenceCounterRef.current = imported.silenceCueCounter;
    lastRecordedEndingIdRef.current = null;
    setSessionMode('solo');
    setLocalPlayerId(imported.players[0].id);
    setGameState(imported);
    persistSoloSave(imported);
    setCameraMode('dollhouse');
    setFloorFilter('all');
    setScreen('playing');
  };

  const handleResumeMultiplayer = () => {
    if (!mpResumeRef) return;
    setMpError(null);
    setMpTransport(mpResumeRef.mode);
    setInviteJoinPrefill(mpResumeRef.code);
    if (mpResumeRef.mode === 'firebase') {
      setFirebaseActivated(true);
      if (firebaseUser) {
        setCloudLobbyCode(mpResumeRef.code);
      }
    }
    setScreen('multiplayer_lobby');
  };

  const handleReturnMenu = useCallback(() => {
    setShowFloorPlan(false);
    setShowJournal(false);
    setRevelationBanner(null);
    setStairPromptRooms(null);
    setGhostPromptId(null);
    if (sessionModeRef.current === 'ws') {
      wsClientRef.current?.leaveLobby();
      setWsLobby(null);
      saveMpResumeRef(null);
      setMpResumeRef(null);
    }
    if (sessionModeRef.current === 'firebase') {
      setCloudLobbyCode(null);
      setCloudLobby(null);
      setCloudPlayers([]);
      setCloudPrivateRole(null);
      saveMpResumeRef(null);
      setMpResumeRef(null);
    }
    setScreen('menu');
  }, []);

  const handleSelectStairRoom = useCallback(
    (roomId: string) => {
      setStairPromptRooms(null);
      void dispatchAction({ type: 'MOVE_ROOM', targetRoomId: roomId });
    },
    [dispatchAction]
  );
  const handleOpenStairPrompt = useCallback((rooms: PlacedRoom[]) => setStairPromptRooms(rooms), []);
  const handleCloseStairPrompt = useCallback(() => setStairPromptRooms(null), []);
  const handleOpenGhostPrompt = useCallback((ghostId: string) => setGhostPromptId(ghostId), []);
  const handleCloseGhostPrompt = useCallback(() => setGhostPromptId(null), []);
  const handleFocusExplorer = useCallback(() => sceneRef.current?.focusActiveExplorer(), []);
  const handleToggleCameraMode = useCallback(
    () => setCameraMode((m) => (m === 'immersive' ? 'dollhouse' : 'immersive')),
    []
  );
  const handleHudDispatchAction = useCallback(
    (act: GameActionInput) => {
      void dispatchAction(act);
    },
    [dispatchAction]
  );
  const handleOpenFloorPlan = useCallback(() => setShowFloorPlan(true), []);
  const handleOpenJournal = useCallback((tab: JournalTab = 'log') => {
    setJournalInitialTab(tab);
    setShowJournal(true);
  }, []);
  const handleOpenSettings = useCallback((tab: SettingsTab = 'audio') => {
    setSettingsInitialTab(tab);
    setShowSettings(true);
  }, []);
  const handleToggleDevInspector = useCallback(
    () => setSettings((s) => ({ ...s, showDeveloperPanel: !s.showDeveloperPanel })),
    []
  );
  const handleToggleMute = useCallback(
    () => setSettings((s) => ({ ...s, muted: !s.muted })),
    []
  );
  const handleMoveTouchPad = useCallback((dx: number, dz: number) => {
    sceneRef.current?.moveTouchPad(dx, dz);
  }, []);

  const activePlayer = gameState
    ? gameState.players[gameState.currentPlayerIndex]
    : null;
  const canLocalPlayerAct = Boolean(
    gameState &&
      activePlayer &&
      activePlayer.id === localPlayerId &&
      gameState.phase !== 'ended'
  );

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#0b0908] text-[#f2e8d5] select-none">
      {/* ISOLATED 3D WEBGL CANVAS HOST (zero React children) */}
      <div ref={canvasHostRef} className="fixed inset-0 z-0" />

      {storageWarning && (
        <div role="alert" aria-live="assertive" className="fixed left-1/2 top-3 z-[100] w-[min(95vw,620px)] -translate-x-1/2 border border-[#e7a56a] bg-[#291914]/95 p-3 text-sm text-[#fff1dc] shadow-2xl">
          <p className="font-semibold">Save storage warning</p>
          <p className="mt-1 text-xs leading-relaxed">{storageWarning}</p>
          {gameState && !gameState.isMultiplayer && (
            <button type="button" onClick={downloadRecoverySave}
              className="tactile-btn mt-2 border border-[#e7a56a] px-3 py-1.5 text-xs font-semibold text-[#fff1dc]">
              Download Current Save
            </button>
          )}
        </div>
      )}

      {/* MAIN MENU */}
      {screen === 'menu' && (
        <MainMenu
          hasSave={savedSummary.hasSave}
          savedSeed={savedSummary.seed}
          savedTurn={savedSummary.turn}
          mpResume={mpResumeRef}
          archiveCount={archiveEntries.length}
          onStartSolo={() => {
            setReplaySeedPrefill(undefined);
            setScreen('character_select');
          }}
          onContinue={handleContinueSolo}
          onOpenMultiplayer={() => {
            setMpError(null);
            setInviteJoinPrefill(undefined);
            setScreen('multiplayer_lobby');
          }}
          onResumeMultiplayer={handleResumeMultiplayer}
          onDismissMpResume={() => {
            saveMpResumeRef(null);
            setMpResumeRef(null);
          }}
          onOpenArchive={() => setShowArchive(true)}
          onOpenSettings={() => handleOpenSettings('audio')}
          onImportSave={handleImportSave}
        />
      )}

      {/* SOLO CHARACTER SELECT */}
      {screen === 'character_select' && (
        <Suspense fallback={null}>
          <CharacterSelect
            initialSeed={replaySeedPrefill}
            onBack={() => setScreen('menu')}
            onPreviewCharacter={setPreviewCharId}
            onLaunch={handleLaunchSolo}
          />
        </Suspense>
      )}

      {/* ONLINE MULTIPLAYER LOBBY */}
      {screen === 'multiplayer_lobby' && (
        <Suspense fallback={null}>
          <MultiplayerLobby
            initialJoinCode={inviteJoinPrefill}
            transport={mpTransport}
            onChangeTransport={(t) => {
              setMpError(null);
              setMpTransport(t);
            }}
            firebaseReady={isFirebaseConfigured}
            firebaseUser={firebaseUser}
            onSignInGoogle={async () => {
              setMpError(null);
              try {
                const fb = await loadFirebaseModule();
                await fb.signInWithGoogle();
              } catch (err) {
                setMpError(err instanceof Error ? err.message : 'Google Sign-In failed.');
              }
            }}
            onSignOutGoogle={async () => {
              const fb = await loadFirebaseModule();
              await fb.signOutGoogle();
              setCloudLobbyCode(null);
              setCloudLobby(null);
              setCloudPlayers([]);
            }}
            cloudLobby={cloudLobby}
            cloudPlayers={cloudPlayers}
            onCreateCloudLobby={async (opts) => {
              setMpError(null);
              try {
                const mp = await loadFirestoreMpModule();
                const code = await mp.createCloudLobby(opts);
                setCloudLobbyCode(code);
                if (firebaseUser) {
                  const refObj: MpResumeInfo = {
                    mode: 'firebase',
                    code,
                    playerId: firebaseUser.uid,
                    displayName: opts.displayName,
                  };
                  saveMpResumeRef(refObj);
                  setMpResumeRef(refObj);
                }
              } catch (err) {
                setMpError(err instanceof Error ? err.message : 'Could not create cloud room.');
              }
            }}
            onJoinCloudLobby={async (opts) => {
              setMpError(null);
              try {
                const mp = await loadFirestoreMpModule();
                const code = await mp.joinCloudLobby(opts);
                setCloudLobbyCode(code);
                if (firebaseUser) {
                  const refObj: MpResumeInfo = {
                    mode: 'firebase',
                    code,
                    playerId: firebaseUser.uid,
                    displayName: opts.displayName,
                  };
                  saveMpResumeRef(refObj);
                  setMpResumeRef(refObj);
                }
              } catch (err) {
                setMpError(err instanceof Error ? err.message : 'Could not join cloud room.');
              }
            }}
            onUpdateCloudPlayer={async (opts) => {
              if (!cloudLobbyCode) return;
              try {
                const mp = await loadFirestoreMpModule();
                await mp.updateCloudPlayerChoice({ inviteCode: cloudLobbyCode, ...opts });
              } catch (err) {
                setMpError(err instanceof Error ? err.message : 'Update failed.');
              }
            }}
            onStartCloudGame={async () => {
              if (!cloudLobbyCode || !cloudLobby) return;
              try {
                const mp = await loadFirestoreMpModule();
                await mp.startCloudLobbyGame(cloudLobbyCode, cloudPlayers, cloudLobby);
              } catch (err) {
                setMpError(err instanceof Error ? err.message : 'Could not start expedition.');
              }
            }}
            onLeaveCloudLobby={() => {
              setCloudLobbyCode(null);
              setCloudLobby(null);
              setCloudPlayers([]);
              setCloudPrivateRole(null);
              saveMpResumeRef(null);
              setMpResumeRef(null);
            }}
            wsStatus={wsStatus}
            wsPlayerId={wsPlayerId}
            wsLobby={wsLobby}
            onCreateWsLobby={(opts) => {
              setMpError(null);
              const c = ensureWsClient();
              c.createLobby(opts);
            }}
            onJoinWsLobby={(opts) => {
              setMpError(null);
              const c = ensureWsClient();
              c.joinLobby(opts);
            }}
            onUpdateWsMember={(opts) => {
              if (!wsLobby) return;
              wsClientRef.current?.updateMember({ lobbyCode: wsLobby.lobbyCode, ...opts });
            }}
            onStartWsGame={() => {
              if (!wsLobby) return;
              wsClientRef.current?.startGame(wsLobby.lobbyCode);
            }}
            onLeaveWsLobby={() => {
              wsClientRef.current?.leaveLobby();
              setWsLobby(null);
              saveMpResumeRef(null);
              setMpResumeRef(null);
            }}
            error={mpError}
            onBack={() => setScreen('menu')}
          />
        </Suspense>
      )}

      {/* ACTIVE GAMEPLAY HUD & OVERLAYS */}
      {screen === 'playing' && gameState && (
        <>
          <HoverWhisperTooltip bus={hoverBus} suppressed={anyOverlayOpen} />

          <GameHud
            state={gameState}
            localPlayerId={localPlayerId}
            cameraMode={cameraMode}
            floorFilter={floorFilter}
            boardPopups={boardPopups}
            audioCaption={audioCaption}
            muted={settings.muted}
            isMultiplayerSession={sessionMode !== 'solo'}
            multiplayerBadge={
              sessionMode === 'ws' && wsLobby
                ? `Room ${wsLobby.lobbyCode}`
                : sessionMode === 'firebase' && cloudLobbyCode
                  ? `Cloud ${cloudLobbyCode}`
                  : null
            }
            actionToast={actionToast}
            stairPromptRooms={stairPromptRooms}
            ghostPromptId={ghostPromptId}
            showDeveloperPanel={settings.showDeveloperPanel}
            anyModalOpen={anyOverlayOpen}
            onSelectStairRoom={handleSelectStairRoom}
            onOpenStairPrompt={handleOpenStairPrompt}
            onCloseStairPrompt={handleCloseStairPrompt}
            onOpenGhostPrompt={handleOpenGhostPrompt}
            onCloseGhostPrompt={handleCloseGhostPrompt}
            onFocusExplorer={handleFocusExplorer}
            onToggleCameraMode={handleToggleCameraMode}
            onChangeFloorFilter={setFloorFilter}
            onDispatchAction={handleHudDispatchAction}
            onOpenFloorPlan={handleOpenFloorPlan}
            onOpenJournal={handleOpenJournal}
            onOpenSettings={handleOpenSettings}
            onToggleDevInspector={handleToggleDevInspector}
            onToggleMute={handleToggleMute}
            onMoveTouchPad={handleMoveTouchPad}
            onReturnMenu={handleReturnMenu}
          />

          {/* DRAMATIC REVELATION ANNOUNCEMENT (Accessible ModalShell) */}
          {revelationBanner && (
            <ModalShell
              ariaLabelledBy="revelation-banner-title"
              onClose={() => {
                sceneRef.current?.skipTransitions();
                setRevelationBanner(null);
              }}
              backdropClassName="bg-[#090606]/58"
              zIndexClassName="z-50"
            >
              <div className="walnut-panel animate-card-deal max-w-xl w-full p-7 border border-[#9e3b33] space-y-4">
                <p className="font-body italic text-xs text-[#e5887c]">
                  The House Goes Silent · Revelation Begins
                </p>
                <h2
                  id="revelation-banner-title"
                  className="font-display text-4xl font-semibold text-[#f5ebd8] leading-tight"
                >
                  {revelationBanner.title}
                </h2>
                <p className="font-body italic text-base text-[#d9b26f]">
                  {revelationBanner.subtitle}
                </p>
                <div className="brass-divider" />
                <p className="font-body text-sm text-[#e6dac4] leading-relaxed">
                  {revelationBanner.opening}
                </p>
                <div className="p-3.5 bg-[#241312] border border-[#9e3b33]/70 text-xs font-body text-[#f5d2cc] leading-relaxed">
                  <strong className="font-semibold text-[#e6b868]">Altered Rule: </strong>
                  {revelationBanner.alteredRule}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    sceneRef.current?.skipTransitions();
                    setRevelationBanner(null);
                  }}
                  className="tactile-btn w-full py-3 bg-gradient-to-b from-[#d8ad62] to-[#b3853e] text-[#140f0b] font-display text-lg font-semibold hover:from-[#e6bd74] hover:to-[#c19147] cursor-pointer shadow-lg"
                >
                  Face the Revelation
                </button>
              </div>
            </ModalShell>
          )}

          {/* ARCHIVAL EVENT MODAL */}
          {gameState.activeEvent && activePlayer && !revelationBanner && (
            <Suspense fallback={null}>
              <EventModal
                activeEvent={gameState.activeEvent}
                actor={
                  gameState.players.find(
                    (p) => p.id === gameState.activeEvent?.triggeredByPlayerId
                  ) ?? activePlayer
                }
                canAct={
                  gameState.activeEvent.triggeredByPlayerId === localPlayerId &&
                  gameState.phase !== 'ended'
                }
                onSelectChoice={(choiceId) =>
                  void dispatchAction({ type: 'RESOLVE_EVENT_CHOICE', choiceId })
                }
                onDismiss={() => void dispatchAction({ type: 'DISMISS_EVENT' })}
              />
            </Suspense>
          )}

          {/* MECHANISM / PUZZLE MODAL */}
          {gameState.activePuzzle && !gameState.activeEvent && !revelationBanner && (
            <Suspense fallback={null}>
              <PuzzleModal
                activePuzzle={gameState.activePuzzle}
                cluesFound={gameState.cluesFound}
                canAct={canLocalPlayerAct}
                onAttemptOption={(optionId) =>
                  void dispatchAction({ type: 'SOLVE_PUZZLE', optionId })
                }
                onClose={() => void dispatchAction({ type: 'CLOSE_PUZZLE' })}
              />
            </Suspense>
          )}

          {/* ACCESSIBLE 2D FLOOR PLAN (with multi-step auto-walk & current room actions) */}
          {showFloorPlan && (
            <Suspense fallback={null}>
              <FloorPlan2D
                state={gameState}
                localPlayerId={localPlayerId}
                canAct={canLocalPlayerAct && !gameState.activeEvent && !gameState.activePuzzle}
                onMoveToRoom={(roomId) =>
                  void dispatchAction({ type: 'MOVE_ROOM', targetRoomId: roomId })
                }
                onWalkToRoom={(path) => schedulePathAndAction(path)}
                onDiscoverDoor={(direction) =>
                  void dispatchAction({ type: 'DISCOVER_ROOM', direction })
                }
                onDispatchAction={handleHudDispatchAction}
                onSelectGhost={handleOpenGhostPrompt}
                onClose={() => setShowFloorPlan(false)}
              />
            </Suspense>
          )}

          {/* ARCHIVIST JOURNAL DRAWER */}
          {showJournal && (
            <Suspense fallback={null}>
              <JournalDrawer
                state={gameState}
                localPlayerId={localPlayerId}
                canAct={canLocalPlayerAct && !gameState.activeEvent && !gameState.activePuzzle}
                initialTab={journalInitialTab}
                onUseItem={(itemId, targetPlayerId) =>
                  void dispatchAction({ type: 'USE_ITEM', itemId, targetPlayerId })
                }
                onTradeItem={(targetPlayerId, itemId) =>
                  void dispatchAction({ type: 'TRADE_ITEM', targetPlayerId, itemId })
                }
                onClose={() => setShowJournal(false)}
              />
            </Suspense>
          )}

          {/* FINAL HOUSE REVEAL ENDING MODAL */}
          {gameState.phase === 'ended' && gameState.ending && (
            <Suspense fallback={null}>
              <EndingModal
                ending={gameState.ending}
                seed={gameState.seed}
                onNewExpedition={() => {
                  setReplaySeedPrefill(undefined);
                  setScreen('character_select');
                }}
                onReturnMenu={handleReturnMenu}
              />
            </Suspense>
          )}

          {/* DEVELOPER / QA INSPECTOR (Shift+D or Settings toggle) */}
          {settings.showDeveloperPanel && (
            <Suspense fallback={null}>
              <DevInspector
                state={gameState}
                onClose={() => setSettings((s) => ({ ...s, showDeveloperPanel: false }))}
              />
            </Suspense>
          )}
        </>
      )}

      {/* HOUSE'S MEMORY ARCHIVE MODAL */}
      {showArchive && (
        <Suspense fallback={null}>
          <ArchiveModal
            entries={archiveEntries}
            onReplaySeed={(seed) => {
              setShowArchive(false);
              setReplaySeedPrefill(seed);
              setScreen('character_select');
            }}
            onClose={() => setShowArchive(false)}
          />
        </Suspense>
      )}

      {/* SETTINGS, CONTROLS & SAVES MODAL */}
      {showSettings && (
        <Suspense fallback={null}>
          <SettingsModal
            settings={settings}
            activeGameState={screen === 'playing' ? gameState : null}
            hasActiveSave={savedSummary.hasSave}
            initialTab={settingsInitialTab}
            onChange={setSettings}
            onImportSave={handleImportSave}
            onClose={() => setShowSettings(false)}
          />
        </Suspense>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <InnerApp />
    </ErrorBoundary>
  );
}

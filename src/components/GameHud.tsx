import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Box,
  Camera,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Compass,
  Eye,
  EyeOff,
  Feather,
  Ghost,
  Heart,
  HeartHandshake,
  Home,
  Keyboard,
  Layers,
  Map as MapIcon,
  MoreHorizontal,
  Search,
  Settings,
  ShieldAlert,
  SkipForward,
  Sparkles,
  Terminal,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { getCharacterById } from '../engine/characters';
import { getRoomTemplate } from '../engine/rooms';
import type {
  CameraMode,
  FloorId,
  GameActionInput,
  GameState,
  GhostInstance,
  PlacedRoom,
} from '../engine/types';
import { CharacterPortrait } from './CharacterPortrait';
import type { JournalTab } from './JournalDrawer';
import { ModalShell } from './ModalShell';
import type { SettingsTab } from './SettingsModal';

export interface BoardPopup {
  id: string;
  text: string;
  x: number;
  y: number;
  tone?: 'gold' | 'teal' | 'crimson';
}

interface GameHudProps {
  state: GameState;
  localPlayerId: string;
  cameraMode: CameraMode;
  floorFilter: FloorId | 'all';
  boardPopups: BoardPopup[];
  audioCaption: string | null;
  muted: boolean;
  multiplayerBadge?: string | null;
  isMultiplayerSession?: boolean;
  actionToast?: string | null;
  stairPromptRooms?: PlacedRoom[] | null;
  ghostPromptId?: string | null;
  showDeveloperPanel?: boolean;
  anyModalOpen?: boolean;
  onSelectStairRoom?: (roomId: string) => void;
  onOpenStairPrompt?: (rooms: PlacedRoom[]) => void;
  onCloseStairPrompt?: () => void;
  onOpenGhostPrompt?: (ghostId: string) => void;
  onCloseGhostPrompt?: () => void;
  onFocusExplorer?: () => void;
  onToggleCameraMode: () => void;
  onChangeFloorFilter: (floor: FloorId | 'all') => void;
  onDispatchAction: (action: GameActionInput) => void;
  onOpenFloorPlan: () => void;
  onOpenJournal: (tab?: JournalTab) => void;
  onOpenSettings: (tab?: SettingsTab) => void;
  onToggleDevInspector?: () => void;
  onToggleMute: () => void;
  onMoveTouchPad?: (dx: number, dz: number) => void;
  onReturnMenu: () => void;
}

interface RoomRibbonItem {
  id: string;
  label: string;
  apCost?: number;
  tone?: 'default' | 'teal' | 'crimson' | 'gold';
  disabled?: boolean;
  title?: string;
  icon?: 'search' | 'inspect' | 'ghost' | 'ally' | 'stairs' | 'objective' | 'mandate' | 'rest';
  onClick: () => void;
}

function shortFloorLabel(f: FloorId): string {
  if (f === 1) return 'Upper Story';
  if (f === -1) return 'Basement';
  return 'Ground Floor';
}

const GameHudInner: React.FC<GameHudProps> = ({
  state,
  localPlayerId,
  cameraMode,
  floorFilter,
  boardPopups,
  audioCaption,
  muted,
  multiplayerBadge,
  isMultiplayerSession = false,
  actionToast,
  stairPromptRooms,
  ghostPromptId,
  showDeveloperPanel = false,
  anyModalOpen = false,
  onSelectStairRoom,
  onOpenStairPrompt,
  onCloseStairPrompt,
  onOpenGhostPrompt,
  onCloseGhostPrompt,
  onFocusExplorer,
  onToggleCameraMode,
  onChangeFloorFilter,
  onDispatchAction,
  onOpenFloorPlan,
  onOpenJournal,
  onOpenSettings,
  onToggleDevInspector,
  onToggleMute,
  onMoveTouchPad,
  onReturnMenu,
}) => {
  const [zenHudHidden, setZenHudHidden] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmLeaveMp, setConfirmLeaveMp] = useState(false);
  const [moreActionsOpen, setMoreActionsOpen] = useState(false);
  const [mandateOpen, setMandateOpen] = useState(false);
  const [isCoarsePointer, setIsCoarsePointer] = useState(false);

  const menuRef = useRef<HTMLDivElement | null>(null);
  const moreRef = useRef<HTMLDivElement | null>(null);
  const mandateRef = useRef<HTMLDivElement | null>(null);
  const touchMoveRef = useRef<{ dx: number; dz: number } | null>(null);
  const touchRafRef = useRef<number | null>(null);

  // Detect coarse pointer (touch devices) for Immersive Room View D-pad
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(pointer: coarse)');
    const sync = () => setIsCoarsePointer(mq.matches);
    sync();
    mq.addEventListener?.('change', sync);
    return () => mq.removeEventListener?.('change', sync);
  }, []);

  // Stop touch pad loop if camera mode changes or component unmounts
  useEffect(() => {
    if (cameraMode !== 'immersive') {
      touchMoveRef.current = null;
      if (touchRafRef.current !== null) {
        cancelAnimationFrame(touchRafRef.current);
        touchRafRef.current = null;
      }
    }
    return () => {
      if (touchRafRef.current !== null) {
        cancelAnimationFrame(touchRafRef.current);
        touchRafRef.current = null;
      }
    };
  }, [cameraMode]);

  const startTouchMove = (dx: number, dz: number) => {
    if (!onMoveTouchPad) return;
    touchMoveRef.current = { dx, dz };
    if (touchRafRef.current !== null) return;
    const step = () => {
      const vec = touchMoveRef.current;
      if (!vec) {
        touchRafRef.current = null;
        return;
      }
      onMoveTouchPad(vec.dx, vec.dz);
      touchRafRef.current = requestAnimationFrame(step);
    };
    touchRafRef.current = requestAnimationFrame(step);
  };

  const stopTouchMove = () => {
    touchMoveRef.current = null;
    if (touchRafRef.current !== null) {
      cancelAnimationFrame(touchRafRef.current);
      touchRafRef.current = null;
    }
  };

  // Close popovers on outside click or Escape
  useEffect(() => {
    if (!menuOpen && !moreActionsOpen && !mandateOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuOpen && menuRef.current && !menuRef.current.contains(target)) {
        setMenuOpen(false);
        setConfirmLeaveMp(false);
      }
      if (moreActionsOpen && moreRef.current && !moreRef.current.contains(target)) {
        setMoreActionsOpen(false);
      }
      if (mandateOpen && mandateRef.current && !mandateRef.current.contains(target)) {
        setMandateOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        setConfirmLeaveMp(false);
        setMoreActionsOpen(false);
        setMandateOpen(false);
      }
    };
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [menuOpen, moreActionsOpen, mandateOpen]);

  // 'H' shortcut for Zen mode (respects open overlays & text inputs)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        anyModalOpen ||
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey
      ) {
        return;
      }
      if (e.key.toLowerCase() === 'h') {
        setZenHudHidden((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [anyModalOpen]);

  const activePlayer = state.players[state.currentPlayerIndex];
  const me = state.players.find((p) => p.id === localPlayerId) ?? activePlayer;
  const isMyTurn = activePlayer?.id === me.id && state.phase !== 'ended';
  const blockedByModal = Boolean(state.activeEvent || state.activePuzzle);
  const canAct = isMyTurn && !blockedByModal && me.alive;
  const turnExhausted = canAct && me.actionPoints === 0;

  const currentRoom = state.rooms[me.roomId];
  const myChar = getCharacterById(me.characterId);
  const roomTemplate = getRoomTemplate(currentRoom.templateId);

  const ghostsHere = useMemo(
    () => state.ghosts.filter((g) => g.roomId === currentRoom.id && !g.soothed),
    [state.ghosts, currentRoom.id]
  );
  const hostileGhostHere = ghostsHere.some((g) => g.disposition === 'hostile');
  const alliesHere = useMemo(
    () => state.players.filter((p) => p.id !== me.id && p.alive && p.roomId === currentRoom.id),
    [state.players, me.id, currentRoom.id]
  );
  const isChosenOrMimic = me.role === 'chosen' || me.role === 'mimic';

  const activeGhostPrompt: GhostInstance | null = useMemo(() => {
    if (!ghostPromptId) return null;
    return ghostsHere.find((g) => g.id === ghostPromptId) ?? null;
  }, [ghostPromptId, ghostsHere]);

  // Keyboard quick keys 1-4 inside Ghost Encounter Slip
  useEffect(() => {
    if (!activeGhostPrompt || !canAct || me.actionPoints < 1) return;
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
      const map: Record<string, 'observe' | 'soothe' | 'ward' | 'confront'> = {
        '1': 'observe',
        '2': 'soothe',
        '3': 'ward',
        '4': 'confront',
      };
      const approach = map[e.key];
      if (approach) {
        e.preventDefault();
        onCloseGhostPrompt?.();
        onDispatchAction({
          type: 'INTERACT_GHOST',
          ghostId: activeGhostPrompt.id,
          approach,
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeGhostPrompt, canAct, me.actionPoints, onCloseGhostPrompt, onDispatchAction]);

  // Build Contextual "This Room" Action Ribbon items (max 4 inline + More overflow)
  const roomRibbonItems = useMemo<RoomRibbonItem[]>(() => {
    if (!canAct || me.actionPoints < 1) return [];
    const items: RoomRibbonItem[] = [];

    // 1. Revelation Scenario Objectives in this room (highest priority)
    if (state.phase === 'revelation' && state.scenario) {
      if (currentRoom.hasAnchor && !currentRoom.anchorDisabled) {
        items.push({
          id: 'obj_anchor',
          label: 'Sever Anchor',
          apCost: 1,
          tone: 'gold',
          icon: 'objective',
          onClick: () =>
            onDispatchAction({ type: 'SCENARIO_ACTION', subAction: 'disable_anchor' }),
        });
      }
      if (currentRoom.hasClockMechanism && !currentRoom.clockAligned) {
        items.push({
          id: 'obj_clock',
          label: 'Align Clock',
          apCost: 1,
          tone: 'gold',
          icon: 'objective',
          onClick: () => onDispatchAction({ type: 'SCENARIO_ACTION', subAction: 'align_clock' }),
        });
      }
      if (currentRoom.hasReflectionProof && !currentRoom.reflectionGathered) {
        items.push({
          id: 'obj_proof',
          label: 'Gather Proof',
          apCost: 1,
          tone: 'gold',
          icon: 'objective',
          onClick: () => onDispatchAction({ type: 'SCENARIO_ACTION', subAction: 'gather_proof' }),
        });
      }
      if (
        state.scenario.id === 'the_heart_beneath' &&
        currentRoom.isHeartChamber
      ) {
        items.push(
          {
            id: 'heart_destroy',
            label: 'Shatter Heart',
            apCost: 1,
            tone: 'crimson',
            icon: 'objective',
            onClick: () =>
              onDispatchAction({ type: 'SCENARIO_ACTION', subAction: 'heart_destroy' }),
          },
          {
            id: 'heart_quiet',
            label: 'Quiet Heart',
            apCost: 1,
            tone: 'teal',
            icon: 'objective',
            onClick: () => onDispatchAction({ type: 'SCENARIO_ACTION', subAction: 'heart_quiet' }),
          },
          {
            id: 'heart_bargain',
            label: 'Bargain with Heart',
            apCost: 1,
            tone: 'gold',
            icon: 'objective',
            onClick: () =>
              onDispatchAction({ type: 'SCENARIO_ACTION', subAction: 'heart_bargain' }),
          }
        );
      }

      // Mirror Jury Completion — fixes solo soft-lock via `contain_threat` + lists all suspects in co-op
      if (
        state.scenario.id === 'the_mirror_jury' &&
        state.scenario.progress >= state.scenario.goal
      ) {
        const suspects = state.players.filter((p) => p.id !== me.id && p.alive);
        if (suspects.length === 0) {
          items.push({
            id: 'mirror_contain',
            label: 'Enact Mirror Containment',
            apCost: 1,
            tone: 'gold',
            icon: 'objective',
            title: 'Seal the Mimic using your gathered reflection proof (1 AP)',
            onClick: () =>
              onDispatchAction({ type: 'SCENARIO_ACTION', subAction: 'contain_threat' }),
          });
        } else {
          for (const suspect of suspects) {
            items.push({
              id: `accuse_${suspect.id}`,
              label: `Accuse ${suspect.displayName}`,
              apCost: 1,
              tone: 'crimson',
              icon: 'objective',
              onClick: () =>
                onDispatchAction({
                  type: 'SCENARIO_ACTION',
                  subAction: 'accuse_player',
                  targetId: suspect.id,
                }),
            });
          }
          items.push({
            id: 'mirror_contain_coop',
            label: 'Enact Containment',
            apCost: 1,
            tone: 'gold',
            icon: 'objective',
            title: 'Attempt containment ritual with gathered proof (1 AP)',
            onClick: () =>
              onDispatchAction({ type: 'SCENARIO_ACTION', subAction: 'contain_threat' }),
          });
        }
      }
    }

    // 2. ALL Spirits present in this room (opens full 4-approach Ghost Encounter Slip)
    for (const ghost of ghostsHere) {
      items.push({
        id: `ghost_${ghost.id}`,
        label: `Spirit: ${ghost.name}`,
        apCost: 1,
        tone: ghost.disposition === 'hostile' ? 'crimson' : 'teal',
        icon: 'ghost',
        title: `Choose how to handle ${ghost.name} (Observe, Soothe, Ward, or Confront)`,
        onClick: () => {
          setMoreActionsOpen(false);
          if (onOpenGhostPrompt) {
            onOpenGhostPrompt(ghost.id);
          } else {
            onDispatchAction({
              type: 'INTERACT_GHOST',
              ghostId: ghost.id,
              approach: 'observe',
            });
          }
        },
      });
    }

    // 3. Search Curio Chest
    if (!currentRoom.searched) {
      items.push({
        id: 'search_curio',
        label: 'Search Curio',
        apCost: 1,
        tone: 'default',
        icon: 'search',
        onClick: () => onDispatchAction({ type: 'SEARCH_ROOM' }),
      });
    }

    // 4. Uninspected Architectural Interactables
    for (const inter of roomTemplate.interactables) {
      if (!currentRoom.inspectedIds.includes(inter.id)) {
        items.push({
          id: `inspect_${inter.id}`,
          label: `Inspect ${inter.name}`,
          apCost: 1,
          tone: 'default',
          icon: 'inspect',
          onClick: () => onDispatchAction({ type: 'INSPECT_OBJECT', interactableId: inter.id }),
        });
      }
    }

    // 5. ALL Allies in the room
    for (const ally of alliesHere) {
      items.push({
        id: `ally_${ally.id}`,
        label: `Steady ${ally.displayName}`,
        apCost: 1,
        tone: 'teal',
        icon: 'ally',
        title: `Help ${ally.displayName} recover Fear and gain +1 on their next roll (1 AP)`,
        onClick: () => onDispatchAction({ type: 'HELP_ALLY', targetPlayerId: ally.id }),
      });
    }

    // 6. Stairs in this room
    const stairRooms = currentRoom.stairLinks
      .map((rid) => state.rooms[rid])
      .filter((r): r is PlacedRoom => Boolean(r));
    if (stairRooms.length === 1) {
      const dest = stairRooms[0];
      items.push({
        id: `stair_${dest.id}`,
        label: `${dest.floor > currentRoom.floor ? 'Ascend' : 'Descend'} to ${dest.name}`,
        apCost: 1,
        tone: 'default',
        icon: 'stairs',
        onClick: () => onDispatchAction({ type: 'MOVE_ROOM', targetRoomId: dest.id }),
      });
    } else if (stairRooms.length > 1) {
      items.push({
        id: 'stairs_multi',
        label: 'Take Stairs',
        apCost: 1,
        tone: 'default',
        icon: 'stairs',
        onClick: () => {
          setMoreActionsOpen(false);
          onOpenStairPrompt?.(stairRooms);
        },
      });
    }

    // 7. Catch Breath (2 AP) when hurt or afraid
    if ((me.health < me.maxHealth || me.fear > 0) && me.actionPoints >= 2) {
      items.push({
        id: 'rest_recover',
        label: 'Catch Breath',
        apCost: 2,
        tone: 'default',
        icon: 'rest',
        disabled: hostileGhostHere,
        title: hostileGhostHere
          ? 'Cannot rest while a hostile spirit lingers in this room'
          : 'Restore Health & calm Fear (2 AP)',
        onClick: () => onDispatchAction({ type: 'REST_RECOVER' }),
      });
    }

    return items;
  }, [
    canAct,
    me.actionPoints,
    me.id,
    me.health,
    me.maxHealth,
    me.fear,
    state.phase,
    state.scenario,
    state.players,
    state.rooms,
    currentRoom,
    roomTemplate.interactables,
    ghostsHere,
    alliesHere,
    hostileGhostHere,
    onDispatchAction,
    onOpenGhostPrompt,
    onOpenStairPrompt,
  ]);

  const inlineRibbonItems = roomRibbonItems.slice(0, 4);
  const overflowRibbonItems = roomRibbonItems.slice(4);

  const renderRibbonIcon = (icon?: RoomRibbonItem['icon']) => {
    switch (icon) {
      case 'search':
        return <Search className="w-3.5 h-3.5 text-[#d4aa62] shrink-0" />;
      case 'inspect':
        return <Sparkles className="w-3.5 h-3.5 text-[#d4aa62] shrink-0" />;
      case 'ghost':
        return <Ghost className="w-3.5 h-3.5 text-[#88c7b7] shrink-0" />;
      case 'ally':
        return <HeartHandshake className="w-3.5 h-3.5 text-[#88c7b7] shrink-0" />;
      case 'stairs':
        return <Layers className="w-3.5 h-3.5 text-[#d4aa62] shrink-0" />;
      case 'objective':
        return <Sparkles className="w-3.5 h-3.5 text-[#f0c778] shrink-0" />;
      case 'rest':
        return <Heart className="w-3.5 h-3.5 text-[#dc786b] shrink-0" />;
      default:
        return null;
    }
  };

  const ribbonToneClass = (tone?: RoomRibbonItem['tone']) => {
    if (tone === 'teal') {
      return 'bg-[#13201d]/92 border-[#7fb5a6]/55 text-[#d6f2ea] hover:border-[#9cd3c3]';
    }
    if (tone === 'crimson') {
      return 'bg-[#2c1311]/92 border-[#a8453d]/70 text-[#f5cdc6] hover:border-[#e3887d]';
    }
    if (tone === 'gold') {
      return 'bg-[#281e12]/94 border-[#dfb467]/75 text-[#f8eedb] hover:border-[#f3cb7b]';
    }
    return 'bg-[#17120e]/90 border-[#c99c52]/40 text-[#efe3cd] hover:border-[#e0b66d]';
  };

  // Health & Fear semantic warning classes
  const lowHealth = me.health <= 2;
  const highFear = me.fear >= Math.max(1, me.maxFear - 2);
  const criticalFear = me.fear >= Math.max(1, me.maxFear - 1);

  const showRibbon =
    !zenHudHidden &&
    canAct &&
    me.actionPoints > 0 &&
    !stairPromptRooms &&
    !activeGhostPrompt &&
    (roomRibbonItems.length > 0 || (state.phase === 'revelation' && isChosenOrMimic));

  return (
    <>
      {/* 3D-PROJECTED FLOATING BOARD POPUPS */}
      <div className="fixed inset-0 z-25 pointer-events-none overflow-hidden">
        {boardPopups.map((popup) => {
          const toneClass =
            popup.tone === 'teal'
              ? 'text-[#9bd8c8]'
              : popup.tone === 'crimson'
                ? 'text-[#f09287]'
                : 'text-[#f3ca78]';
          return (
            <div
              key={popup.id}
              style={{ left: `${popup.x}px`, top: `${popup.y}px` }}
              className={`fixed animate-board-popup font-display text-lg font-semibold tracking-wide whitespace-nowrap ${toneClass} [text-shadow:0_2px_10px_rgba(0,0,0,0.95),0_0_2px_rgba(0,0,0,0.98)]`}
            >
              {popup.text}
            </div>
          );
        })}
      </div>

      {/* NON-BLOCKING EDGE LEGIBILITY SCRIMS */}
      {!zenHudHidden && (
        <>
          <div className="fixed top-0 inset-x-0 h-28 z-10 pointer-events-none hud-edge-scrim-top" />
          <div className="fixed bottom-0 inset-x-0 h-28 z-10 pointer-events-none hud-edge-scrim-bottom" />
        </>
      )}

      {/* ZEN MODE RESTORE BUTTON */}
      {zenHudHidden && (
        <button
          type="button"
          onClick={() => setZenHudHidden(false)}
          aria-label="Restore tabletop HUD"
          title="Restore HUD (H)"
          className="tactile-btn fixed top-4 right-5 z-20 flex items-center gap-1.5 px-2.5 py-1.5 bg-[#15100c]/85 border border-[#c99c52]/40 text-xs font-body text-[#efe3cd] hover:text-[#f5d083] hover:border-[#e6be72] cursor-pointer"
        >
          <Eye className="w-3.5 h-3.5" />
          Show HUD
        </button>
      )}

      {/* TOP-LEFT: Borderless editorial room plaque & tactile brass AP pips + labeled vitals */}
      {!zenHudHidden && (
        <div className="fixed top-4 left-5 z-20 pointer-events-none select-none max-w-[min(440px,52vw)] space-y-1.5 [text-shadow:0_2px_10px_rgba(0,0,0,0.95),0_0_2px_rgba(0,0,0,0.95)]">
          <div className="space-y-0.5">
            <h1 className="font-display text-2xl sm:text-[27px] font-semibold text-[#f7eedc] leading-none tracking-tight">
              {currentRoom.name}
            </h1>
            <p className="font-body italic text-xs text-[#d6c29d]">
              {shortFloorLabel(currentRoom.floor)}
              <span className="mx-1.5 not-italic opacity-45">·</span>
              <span className="not-italic font-mono-num text-[11px] text-[#cbb692]">
                Turn {state.turn}
              </span>
              {state.isMultiplayer && (
                <>
                  <span className="mx-1.5 not-italic opacity-45">·</span>
                  <span className="not-italic text-[#92cfc0]">
                    {multiplayerBadge ? `${multiplayerBadge} · ` : ''}
                    {isMyTurn ? 'Your turn' : `${activePlayer.displayName}’s turn`}
                  </span>
                </>
              )}
            </p>
          </div>

          {/* Tactile Brass AP Pips + Clearly Labeled Vitals */}
          <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 pt-0.5 pointer-events-auto">
            <div
              className="flex items-center gap-1.5"
              title="Action Points remaining this turn"
              aria-label={`Action Points: ${me.actionPoints} of ${me.maxActionPoints}`}
            >
              {Array.from({ length: me.maxActionPoints }).map((_, idx) => {
                const filled = idx < me.actionPoints;
                return (
                  <span
                    key={idx}
                    className={`inline-block w-2.5 h-2.5 rounded-full transition-all duration-200 ${
                      filled
                        ? 'bg-gradient-to-br from-[#f3cf84] via-[#c99c52] to-[#7d5a24] shadow-[0_0_8px_rgba(228,186,112,0.55)] ring-1 ring-[#f6dfb0]/45'
                        : 'border border-[#c99c52]/40 bg-[#120d0a]/50'
                    }`}
                  />
                );
              })}
              <span className="font-body text-[11px] text-[#e0caa2] ml-0.5">
                {me.actionPoints === 0 ? 'Turn spent' : `${me.actionPoints} AP`}
              </span>
            </div>

            <span
              title="Physical Vitality — reaching 0 collapses your explorer"
              className={`inline-flex items-center gap-1 text-xs font-body ${
                lowHealth ? 'text-[#f29b8e] font-semibold' : 'text-[#edd8cd]'
              }`}
            >
              <Heart className="w-3.5 h-3.5 text-[#dc786b]" />
              <span className="hidden sm:inline">Health</span>
              <span className="font-mono-num">
                {me.health}/{me.maxHealth}
              </span>
            </span>

            <span
              title="Accumulated Fear — higher Fear penalizes trait rolls; reaching Max Fear overwhelms composure"
              className={`inline-flex items-center gap-1 text-xs font-body ${
                criticalFear
                  ? 'text-[#f29b8e] font-semibold'
                  : highFear
                    ? 'text-[#f0c778] font-medium'
                    : 'text-[#d6eae4]'
              }`}
            >
              <ShieldAlert
                className={`w-3.5 h-3.5 ${
                  criticalFear
                    ? 'text-[#e5897d]'
                    : highFear
                      ? 'text-[#e6be72]'
                      : 'text-[#86c5b5]'
                }`}
              />
              <span className="hidden sm:inline">Fear</span>
              <span className="font-mono-num">
                {me.fear}/{me.maxFear}
              </span>
            </span>

            <span
              title={
                state.phase === 'revelation'
                  ? 'Turns remaining before the House claims victory'
                  : 'House Dread — when Dread reaches the threshold, the Revelation begins'
              }
              className="font-body text-xs text-[#c7b38e]"
            >
              {state.phase === 'revelation' && state.scenario ? (
                <span className="text-[#f0a599]">
                  Countdown <span className="font-mono-num">{state.scenario.countdown}</span>
                </span>
              ) : (
                <>
                  Dread{' '}
                  <span className="font-mono-num text-[#e6c483]">
                    {state.pressure}/{state.revelationThreshold}
                  </span>
                </>
              )}
            </span>
          </div>

          {/* Revelation Objective */}
          {state.phase === 'revelation' && state.scenario && (
            <p className="pt-1 text-xs text-[#f4d4cc] font-body leading-snug max-w-sm">
              <span className="font-display text-sm font-semibold text-[#ef8f82] mr-1.5">
                {state.scenario.title} ({state.scenario.progress}/{state.scenario.goal}) —
              </span>
              {state.scenario.publicObjective}
            </p>
          )}

          {state.phase === 'revelation' && isChosenOrMimic && me.privateObjective && (
            <p className="text-xs italic text-[#f1c772] font-body leading-snug max-w-sm">
              Secret ({me.role === 'chosen' ? 'Chosen' : 'Mimic'}): {me.privateObjective}
            </p>
          )}
        </div>
      )}

      {/* TOP-RIGHT: Grouped View & Study Tools (explicit Tabletop/Room View toggle + compact Menu popover) */}
      {!zenHudHidden && (
        <div className="fixed top-4 right-5 z-20 flex items-center gap-1.5 [filter:drop-shadow(0_2px_8px_rgba(0,0,0,0.88))]">
          {/* Floor filter tabs (Tabletop mode only) */}
          {cameraMode === 'dollhouse' && (
            <div className="hidden md:flex items-center gap-0.5 mr-1 pr-2 border-r border-[#e8d5b3]/20">
              {(
                [
                  { id: 'all', label: 'All', keyHint: '0' },
                  { id: 1, label: 'Upper', keyHint: '1' },
                  { id: 0, label: 'Ground', keyHint: '2' },
                  { id: -1, label: 'Cellar', keyHint: '3' },
                ] as const
              ).map((f) => {
                const active = floorFilter === f.id;
                return (
                  <button
                    key={String(f.id)}
                    type="button"
                    onClick={() => onChangeFloorFilter(f.id)}
                    title={`${f.label} Floor (${f.keyHint})`}
                    className={`tactile-btn px-2 py-1 text-xs font-body cursor-pointer relative ${
                      active
                        ? 'text-[#f3cb7b] font-semibold'
                        : 'text-[#dcd0bb]/75 hover:text-[#f7eedc]'
                    }`}
                  >
                    {f.label}
                    {active && (
                      <span className="absolute left-2 right-2 bottom-0 h-[1.5px] bg-[#d9ad5e]" />
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Explicit Tabletop / Room View toggle (distinct Camera vs Box icon) */}
          <button
            type="button"
            onClick={onToggleCameraMode}
            aria-label={
              cameraMode === 'dollhouse'
                ? 'Switch to Immersive Room View'
                : 'Switch to Tabletop Dollhouse View'
            }
            title={
              cameraMode === 'dollhouse'
                ? 'Enter Immersive Room View (Tab)'
                : 'Return to Tabletop Dollhouse (Tab)'
            }
            className={`tactile-btn flex items-center gap-1.5 px-2.5 py-1.5 border text-xs font-body cursor-pointer ${
              cameraMode === 'immersive'
                ? 'bg-[#261d14]/90 border-[#dfa953]/70 text-[#f3cb7b]'
                : 'bg-[#140f0c]/75 border-[#c99c52]/32 text-[#e6dac4] hover:border-[#d4aa62] hover:text-[#f7eedc]'
            }`}
          >
            {cameraMode === 'dollhouse' ? (
              <>
                <Camera className="w-3.5 h-3.5 text-[#d4aa62]" />
                <span className="hidden sm:inline">Room View</span>
              </>
            ) : (
              <>
                <Box className="w-3.5 h-3.5 text-[#f0be64]" />
                <span className="hidden sm:inline">Tabletop</span>
              </>
            )}
          </button>

          {onFocusExplorer && (
            <button
              type="button"
              onClick={onFocusExplorer}
              aria-label="Center on Explorer"
              title="Center on Explorer (Space)"
              className="tactile-btn p-2 text-[#dfd2bc]/85 hover:text-[#f5d083] cursor-pointer"
            >
              <Compass className="w-4 h-4" />
            </button>
          )}

          <button
            type="button"
            onClick={onOpenFloorPlan}
            aria-label="2D Floor Plan"
            title="2D Floor Plan (M)"
            className="tactile-btn p-2 text-[#dfd2bc]/85 hover:text-[#f5d083] cursor-pointer"
          >
            <MapIcon className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => onOpenJournal('log')}
            aria-label="Archivist Journal & Relics"
            title="Journal & Relics (J)"
            className="tactile-btn p-2 text-[#dfd2bc]/85 hover:text-[#f5d083] cursor-pointer"
          >
            <BookOpen className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onToggleMute}
            aria-label={muted ? 'Unmute audio' : 'Mute audio'}
            title={muted ? 'Unmute' : 'Mute'}
            className="tactile-btn p-2 text-[#dfd2bc]/85 hover:text-[#f5d083] cursor-pointer"
          >
            {muted ? (
              <VolumeX className="w-4 h-4 text-[#e07a6f]" />
            ) : (
              <Volume2 className="w-4 h-4" />
            )}
          </button>

          {/* Compact Study Menu Popover */}
          <div ref={menuRef} className="relative">
            <button
              type="button"
              onClick={() => {
                setMenuOpen((v) => !v);
                setConfirmLeaveMp(false);
              }}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              aria-label="Tabletop menu"
              className="tactile-btn flex items-center gap-1 px-2.5 py-1.5 border border-[#c99c52]/32 bg-[#140f0c]/75 text-xs font-body text-[#e6dac4] hover:border-[#d4aa62] hover:text-[#f7eedc] cursor-pointer"
            >
              <span>Menu</span>
              <ChevronDown className="w-3.5 h-3.5 opacity-80" />
            </button>

            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 mt-2 w-56 walnut-panel border border-[#c99c52]/45 py-1.5 shadow-[0_14px_34px_rgba(0,0,0,0.82)] z-30"
              >
                {/* Mobile Floor Filter inside Menu on narrow viewports */}
                {cameraMode === 'dollhouse' && (
                  <div className="md:hidden px-3 py-2 border-b border-[#c99c52]/20 space-y-1.5">
                    <p className="font-body italic text-[11px] text-[#c7ad7c]">Floor Filter</p>
                    <div className="grid grid-cols-4 gap-1">
                      {(
                        [
                          { id: 'all', label: 'All' },
                          { id: 1, label: 'Up' },
                          { id: 0, label: 'Gnd' },
                          { id: -1, label: 'Cel' },
                        ] as const
                      ).map((f) => (
                        <button
                          key={String(f.id)}
                          type="button"
                          onClick={() => {
                            onChangeFloorFilter(f.id);
                            setMenuOpen(false);
                          }}
                          className={`py-1 text-[11px] font-body border cursor-pointer ${
                            floorFilter === f.id
                              ? 'bg-[#c99c52] text-[#17110b] border-[#c99c52] font-semibold'
                              : 'bg-[#14100c] text-[#dfd2bc] border-[#c99c52]/25'
                          }`}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenSettings('audio');
                  }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-left text-xs font-body text-[#efe3cd] hover:bg-[#241b13] hover:text-[#f5cf84] cursor-pointer"
                >
                  <Settings className="w-3.5 h-3.5 text-[#c99c52]" />
                  Settings & Saves
                </button>

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenSettings('controls');
                  }}
                  className="w-full flex items-center justify-between px-3.5 py-2 text-left text-xs font-body text-[#efe3cd] hover:bg-[#241b13] hover:text-[#f5cf84] cursor-pointer"
                >
                  <span className="flex items-center gap-2.5">
                    <Keyboard className="w-3.5 h-3.5 text-[#c99c52]" />
                    Controls & Shortcuts
                  </span>
                  <span className="font-mono-num text-[10px] text-[#a89a84]">?</span>
                </button>

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    setZenHudHidden(true);
                  }}
                  className="w-full flex items-center justify-between px-3.5 py-2 text-left text-xs font-body text-[#efe3cd] hover:bg-[#241b13] hover:text-[#f5cf84] cursor-pointer"
                >
                  <span className="flex items-center gap-2.5">
                    <EyeOff className="w-3.5 h-3.5 text-[#c99c52]" />
                    Hide Tabletop HUD
                  </span>
                  <span className="font-mono-num text-[10px] text-[#a89a84]">H</span>
                </button>

                {onToggleDevInspector && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      onToggleDevInspector();
                    }}
                    className="w-full flex items-center justify-between px-3.5 py-2 text-left text-xs font-body text-[#efe3cd] hover:bg-[#241b13] hover:text-[#f5cf84] cursor-pointer"
                  >
                    <span className="flex items-center gap-2.5">
                      <Terminal className="w-3.5 h-3.5 text-[#c99c52]" />
                      {showDeveloperPanel ? 'Hide Inspector' : 'Developer Inspector'}
                    </span>
                    <span className="font-mono-num text-[10px] text-[#a89a84]">⇧D</span>
                  </button>
                )}

                <div className="my-1 border-t border-[#c99c52]/20" />

                {!confirmLeaveMp ? (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      if (isMultiplayerSession) {
                        setConfirmLeaveMp(true);
                      } else {
                        setMenuOpen(false);
                        onReturnMenu();
                      }
                    }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 text-left text-xs font-body text-[#e59a8e] hover:bg-[#2a1513] hover:text-[#f6cbc4] cursor-pointer"
                  >
                    <Home className="w-3.5 h-3.5" />
                    Return to Study
                  </button>
                ) : (
                  <div className="px-3.5 py-2 space-y-2 bg-[#231311]">
                    <p className="text-[11px] font-body text-[#f2cbc5] leading-snug">
                      Leave this live multiplayer expedition?
                    </p>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmLeaveMp(false);
                          setMenuOpen(false);
                          onReturnMenu();
                        }}
                        className="flex-1 py-1 bg-[#9e3b33] text-[#f8eedb] text-[11px] font-body font-medium cursor-pointer"
                      >
                        Leave Party
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmLeaveMp(false)}
                        className="px-2 py-1 border border-[#c99c52]/35 text-[11px] font-body text-[#dfd2bc] cursor-pointer"
                      >
                        Stay
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* STAIRCASE QUICK PICKER (Accessible ModalShell) */}
      {stairPromptRooms && stairPromptRooms.length > 0 && onSelectStairRoom && (
        <ModalShell
          ariaLabelledBy="stair-picker-title"
          onClose={onCloseStairPrompt}
          backdropClassName="bg-[#080605]/45"
          zIndexClassName="z-30"
        >
          <div className="parchment-card animate-card-deal px-5 py-4 space-y-3 min-w-[270px] max-w-sm w-full">
            <div className="flex items-center justify-between gap-4">
              <span
                id="stair-picker-title"
                className="font-display text-lg font-semibold text-[#1f160e] flex items-center gap-2"
              >
                <Layers className="w-4 h-4 text-[#7c5c2e]" />
                Take the Stairs
              </span>
              {onCloseStairPrompt && (
                <button
                  type="button"
                  onClick={onCloseStairPrompt}
                  aria-label="Cancel stairs"
                  className="tactile-btn text-[#6e5230] hover:text-[#1f160e] cursor-pointer p-0.5"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="flex flex-col gap-2">
              {stairPromptRooms.map((sr) => (
                <button
                  key={sr.id}
                  type="button"
                  disabled={!canAct || me.actionPoints < 1}
                  onClick={() => onSelectStairRoom(sr.id)}
                  className="tactile-btn w-full text-left px-3.5 py-2.5 bg-[#f7efe0] border border-[#8e6d3e]/55 hover:border-[#3b2816] hover:bg-[#fcf6ea] text-sm text-[#1f160e] cursor-pointer disabled:opacity-40 flex items-center justify-between gap-3"
                >
                  <span>
                    {sr.floor > currentRoom.floor ? 'Ascend to ' : 'Descend to '}
                    <strong className="font-semibold">{sr.name}</strong>
                  </span>
                  <span className="font-mono-num text-[11px] text-[#7a5b30]">1 AP</span>
                </button>
              ))}
            </div>
          </div>
        </ModalShell>
      )}

      {/* GHOST ENCOUNTER SLIP (All 4 engine approaches: Observe, Soothe, Ward, Confront · keys 1–4) */}
      {activeGhostPrompt && (
        <ModalShell
          ariaLabelledBy="ghost-encounter-title"
          onClose={onCloseGhostPrompt}
          backdropClassName="bg-[#080605]/52"
          zIndexClassName="z-30"
        >
          <div className="parchment-card animate-card-deal px-5 py-5 space-y-3.5 max-w-md w-full">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-body italic text-xs text-[#6e5230] capitalize">
                  {activeGhostPrompt.disposition} Apparition · {currentRoom.name}
                </p>
                <h3
                  id="ghost-encounter-title"
                  className="font-display text-2xl font-semibold text-[#1f160e] leading-tight flex items-center gap-2"
                >
                  <Ghost className="w-5 h-5 text-[#2d6253] shrink-0" />
                  {activeGhostPrompt.name}
                </h3>
              </div>
              {onCloseGhostPrompt && (
                <button
                  type="button"
                  onClick={onCloseGhostPrompt}
                  aria-label="Close spirit encounter"
                  className="tactile-btn text-[#6e5230] hover:text-[#1f160e] cursor-pointer p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {activeGhostPrompt.lastActionNote && (
              <p className="text-xs font-body italic text-[#5c4529] leading-relaxed">
                {activeGhostPrompt.lastActionNote}
              </p>
            )}

            <div className="space-y-2">
              {(
                [
                  {
                    key: '1',
                    approach: 'observe',
                    label: 'Observe Quietly',
                    trait: 'Insight',
                    dc: activeGhostPrompt.archetype === 'lantern_wisp' ? 6 : 7,
                    detail: 'Uncover a witness-clue & calm 1 Fear (low risk).',
                  },
                  {
                    key: '2',
                    approach: 'soothe',
                    label: 'Soothe the Spirit',
                    trait: 'Nerve',
                    dc: activeGhostPrompt.archetype === 'mourner' ? 7 : 8,
                    detail: 'Lay it peacefully to rest (−6 Dread, −1 Fear).',
                  },
                  {
                    key: '3',
                    approach: 'ward',
                    label: 'Ward & Banish',
                    trait: 'Nerve',
                    dc: 8,
                    detail: 'Drive it from the room (+2 with Mirror or Tuning Fork).',
                  },
                  {
                    key: '4',
                    approach: 'confront',
                    label: 'Confront Forcefully',
                    trait: 'Body',
                    dc: 9,
                    detail: 'Expel by force; failure provokes hostility (−1 Health, +1 Fear).',
                  },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.approach}
                  type="button"
                  disabled={!canAct || me.actionPoints < 1}
                  onClick={() => {
                    onCloseGhostPrompt?.();
                    onDispatchAction({
                      type: 'INTERACT_GHOST',
                      ghostId: activeGhostPrompt.id,
                      approach: opt.approach,
                    });
                  }}
                  className="tactile-btn w-full text-left px-3.5 py-2.5 bg-[#f7efe0] border border-[#8e6d3e]/55 hover:border-[#3b2816] hover:bg-[#fcf6ea] cursor-pointer disabled:opacity-40 space-y-0.5"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-display text-base font-semibold text-[#1f160e]">
                      <span className="font-mono-num text-xs text-[#7a5b30] mr-1.5">
                        {opt.key}.
                      </span>
                      {opt.label}
                    </span>
                    <span className="font-mono-num text-[11px] text-[#6b4d27] shrink-0">
                      {opt.trait} {opt.dc}+ · 1 AP
                    </span>
                  </div>
                  <p className="text-xs font-body text-[#4a3620]">{opt.detail}</p>
                </button>
              ))}
            </div>
          </div>
        </ModalShell>
      )}

      {/* BOTTOM-CENTER: Accessible Toast/Caption + Whisper-Quiet "This Room" Contextual Action Ribbon */}
      <div className="fixed left-1/2 -translate-x-1/2 bottom-5 z-20 flex flex-col items-center gap-2 max-w-[min(640px,calc(100vw-260px))] pointer-events-none">
        <div
          aria-live="polite"
          aria-atomic="true"
          className="flex flex-col items-center gap-1 text-center px-3 [text-shadow:0_2px_10px_rgba(0,0,0,0.98)]"
        >
          {actionToast && (
            <p className="font-body text-sm text-[#f7eedc] px-3 py-1 bg-[#130e0b]/82 border-b border-[#c99c52]/45">
              {actionToast}
            </p>
          )}
          {audioCaption && !actionToast && (
            <p className="text-xs font-body italic text-[#d8c9ae]">{audioCaption}</p>
          )}
        </div>

        {showRibbon && (
          <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-1.5">
            {inlineRibbonItems.map((item) => (
              <button
                key={item.id}
                type="button"
                disabled={item.disabled}
                title={item.title}
                onClick={item.onClick}
                className={`tactile-btn inline-flex items-center gap-1.5 px-3 py-1.5 border text-xs font-body shadow-md cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${ribbonToneClass(item.tone)}`}
              >
                {renderRibbonIcon(item.icon)}
                <span>{item.label}</span>
                {item.apCost && (
                  <span className="font-mono-num text-[10px] opacity-75">{item.apCost} AP</span>
                )}
              </button>
            ))}

            {/* Chosen / Mimic House's Mandate Popover (both Stoke Dread & Shift Bolts) */}
            {state.phase === 'revelation' && isChosenOrMimic && (
              <div ref={mandateRef} className="relative">
                <button
                  type="button"
                  onClick={() => setMandateOpen((v) => !v)}
                  aria-expanded={mandateOpen}
                  className="tactile-btn inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#2c1311]/94 border border-[#a8453d]/80 text-xs font-body text-[#f6cec8] hover:border-[#e3887d] cursor-pointer shadow-md"
                >
                  <Feather className="w-3.5 h-3.5" />
                  <span>House’s Mandate</span>
                  <ChevronUp className="w-3 h-3 opacity-80" />
                </button>

                {mandateOpen && (
                  <div className="absolute bottom-full mb-2 right-0 w-64 walnut-panel border border-[#a8453d]/65 p-2 space-y-1.5 shadow-[0_14px_32px_rgba(0,0,0,0.85)] z-30">
                    <button
                      type="button"
                      onClick={() => {
                        setMandateOpen(false);
                        onDispatchAction({
                          type: 'SCENARIO_ACTION',
                          subAction: 'chosen_stoke_dread',
                        });
                      }}
                      className="tactile-btn w-full text-left p-2 bg-[#241210] border border-[#a8453d]/45 hover:border-[#e3887d] cursor-pointer"
                    >
                      <div className="flex items-baseline justify-between text-xs font-body text-[#f6cec8] font-medium">
                        <span>Stoke Dread</span>
                        <span className="font-mono-num text-[10px] opacity-80">1 AP</span>
                      </div>
                      <p className="text-[11px] font-body text-[#c7b3a8] mt-0.5">
                        +6 Dread &amp; +1 Fear to all other explorers.
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMandateOpen(false);
                        onDispatchAction({
                          type: 'SCENARIO_ACTION',
                          subAction: 'chosen_shift_door',
                        });
                      }}
                      className="tactile-btn w-full text-left p-2 bg-[#241210] border border-[#a8453d]/45 hover:border-[#e3887d] cursor-pointer"
                    >
                      <div className="flex items-baseline justify-between text-xs font-body text-[#f6cec8] font-medium">
                        <span>Shift Bolts</span>
                        <span className="font-mono-num text-[10px] opacity-80">1 AP</span>
                      </div>
                      <p className="text-[11px] font-body text-[#c7b3a8] mt-0.5">
                        Seal a doorway here (+8 Dread, −1 Countdown).
                      </p>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Overflow "More (N) ▾" Popover */}
            {overflowRibbonItems.length > 0 && (
              <div ref={moreRef} className="relative">
                <button
                  type="button"
                  onClick={() => setMoreActionsOpen((v) => !v)}
                  aria-expanded={moreActionsOpen}
                  className="tactile-btn inline-flex items-center gap-1 px-2.5 py-1.5 bg-[#17120e]/92 border border-[#c99c52]/40 text-xs font-body text-[#e6dac4] hover:border-[#e0b66d] cursor-pointer shadow-md"
                >
                  <MoreHorizontal className="w-3.5 h-3.5 text-[#d4aa62]" />
                  <span>More ({overflowRibbonItems.length})</span>
                </button>

                {moreActionsOpen && (
                  <div className="absolute bottom-full mb-2 right-0 min-w-[220px] walnut-panel border border-[#c99c52]/45 py-1.5 shadow-[0_14px_32px_rgba(0,0,0,0.85)] z-30">
                    {overflowRibbonItems.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        disabled={item.disabled}
                        title={item.title}
                        onClick={() => {
                          setMoreActionsOpen(false);
                          item.onClick();
                        }}
                        className="w-full flex items-center justify-between gap-3 px-3.5 py-2 text-left text-xs font-body text-[#efe3cd] hover:bg-[#241b13] hover:text-[#f5cf84] cursor-pointer disabled:opacity-40"
                      >
                        <span className="flex items-center gap-2">
                          {renderRibbonIcon(item.icon)}
                          <span>{item.label}</span>
                        </span>
                        {item.apCost && (
                          <span className="font-mono-num text-[10px] text-[#c7ad7c]">
                            {item.apCost} AP
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* COARSE-POINTER TOUCH PAD (Immersive Room View on tablets/phones) */}
      {!zenHudHidden && cameraMode === 'immersive' && isCoarsePointer && onMoveTouchPad && (
        <div
          aria-label="Room view movement pad"
          className="fixed bottom-24 left-5 z-20 grid grid-cols-3 gap-1 w-28 select-none touch-none"
        >
          <div />
          <button
            type="button"
            aria-label="Move forward"
            onPointerDown={() => startTouchMove(0, 1)}
            onPointerUp={stopTouchMove}
            onPointerLeave={stopTouchMove}
            onPointerCancel={stopTouchMove}
            className="h-9 bg-[#17120e]/85 border border-[#c99c52]/45 text-[#f5ebd8] flex items-center justify-center active:bg-[#2d2217]"
          >
            <ChevronUp className="w-4 h-4" />
          </button>
          <div />
          <button
            type="button"
            aria-label="Strafe left"
            onPointerDown={() => startTouchMove(-1, 0)}
            onPointerUp={stopTouchMove}
            onPointerLeave={stopTouchMove}
            onPointerCancel={stopTouchMove}
            className="h-9 bg-[#17120e]/85 border border-[#c99c52]/45 text-[#f5ebd8] flex items-center justify-center active:bg-[#2d2217]"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            aria-label="Move backward"
            onPointerDown={() => startTouchMove(0, -1)}
            onPointerUp={stopTouchMove}
            onPointerLeave={stopTouchMove}
            onPointerCancel={stopTouchMove}
            className="h-9 bg-[#17120e]/85 border border-[#c99c52]/45 text-[#f5ebd8] flex items-center justify-center active:bg-[#2d2217]"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
          <button
            type="button"
            aria-label="Strafe right"
            onPointerDown={() => startTouchMove(1, 0)}
            onPointerUp={stopTouchMove}
            onPointerLeave={stopTouchMove}
            onPointerCancel={stopTouchMove}
            className="h-9 bg-[#17120e]/85 border border-[#c99c52]/45 text-[#f5ebd8] flex items-center justify-center active:bg-[#2d2217]"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* BOTTOM-LEFT: Quiet Engraved Explorer Cameo (opens directly to Explorer & Relics tab!) */}
      {!zenHudHidden && myChar && (
        <button
          type="button"
          onClick={() => onOpenJournal('satchel')}
          title="Open Explorer Sheet & Relics (J)"
          className="tactile-btn group fixed bottom-5 left-5 z-20 flex items-center gap-3 text-left cursor-pointer [filter:drop-shadow(0_3px_12px_rgba(0,0,0,0.9))]"
        >
          <CharacterPortrait character={myChar} size={54} />
          <div className="space-y-0.5 [text-shadow:0_2px_8px_rgba(0,0,0,0.98)]">
            <p className="font-display text-lg font-semibold text-[#f7eedc] leading-none group-hover:text-[#f3ca78] transition-colors">
              {me.displayName}
            </p>
            <div className="hidden sm:flex items-center gap-2.5 text-[11px] font-body text-[#d6c3a1]">
              <span>
                Body <strong className="font-mono-num text-[#f5ebd8]">{me.stats.body}</strong>
              </span>
              <span>
                Grace <strong className="font-mono-num text-[#f5ebd8]">{me.stats.grace}</strong>
              </span>
              <span>
                Insight <strong className="font-mono-num text-[#f5ebd8]">{me.stats.insight}</strong>
              </span>
              <span>
                Nerve <strong className="font-mono-num text-[#f5ebd8]">{me.stats.nerve}</strong>
              </span>
            </div>
            <p className="font-body italic text-[11px] text-[#c7ad7c]">
              {me.inventory.length} {me.inventory.length === 1 ? 'relic' : 'relics'} ·{' '}
              {state.cluesFound.length} {state.cluesFound.length === 1 ? 'clue' : 'clues'}
              {me.nextRollBonus > 0 && (
                <span className="not-italic text-[#96d2c2] ml-1.5 font-mono-num">
                  +{me.nextRollBonus} next roll
                </span>
              )}
            </p>
          </div>
        </button>
      )}

      {/* BOTTOM-RIGHT: Tactile Antique Brass End Turn Medallion */}
      {!zenHudHidden && (
        <div className="fixed bottom-5 right-5 z-20 flex items-center justify-end">
          <button
            type="button"
            disabled={!canAct}
            onClick={() => onDispatchAction({ type: 'END_TURN' })}
            title="End Turn (E)"
            className={`tactile-btn flex items-center gap-2 px-4 py-2.5 font-display text-base font-semibold tracking-wide whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-35 ${
              turnExhausted
                ? 'bg-gradient-to-b from-[#ecc376] to-[#c59446] text-[#17110b] shadow-[0_0_24px_rgba(232,188,108,0.52),inset_0_1px_0_rgba(255,244,218,0.65)] ring-1 ring-[#f6dfb0]/80'
                : 'bg-gradient-to-b from-[#d3a75d] to-[#ad803b] text-[#17110b] hover:from-[#e2b86d] hover:to-[#bc8d45] shadow-[0_8px_24px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(255,240,205,0.45)]'
            }`}
          >
            <span>End Turn</span>
            <SkipForward className="w-3.5 h-3.5 opacity-85" />
          </button>
        </div>
      )}
    </>
  );
};

export const GameHud = React.memo(GameHudInner);

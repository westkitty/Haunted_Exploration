import React, { useMemo, useState } from 'react';
import { Compass, Layers, Search, Sparkles, X } from 'lucide-react';
import { getCharacterById } from '../engine/characters';
import { findRoomPath } from '../engine/pathfinding';
import { getRoomTemplate } from '../engine/rooms';
import type { Direction, FloorId, GameActionInput, GameState } from '../engine/types';
import { ModalShell } from './ModalShell';

interface FloorPlan2DProps {
  state: GameState;
  localPlayerId: string;
  canAct: boolean;
  onMoveToRoom: (roomId: string) => void;
  onWalkToRoom?: (path: string[]) => void;
  onDiscoverDoor: (direction: Direction) => void;
  onDispatchAction?: (action: GameActionInput) => void;
  onSelectGhost?: (ghostId: string) => void;
  onClose: () => void;
}

const FLOOR_LABELS: { id: FloorId; label: string }[] = [
  { id: 1, label: 'Upper Story' },
  { id: 0, label: 'Ground Story' },
  { id: -1, label: 'Basement Vaults' },
];

export const FloorPlan2D: React.FC<FloorPlan2DProps> = ({
  state,
  localPlayerId,
  canAct,
  onMoveToRoom,
  onWalkToRoom,
  onDiscoverDoor,
  onDispatchAction,
  onSelectGhost,
  onClose,
}) => {
  const me =
    state.players.find((p) => p.id === localPlayerId) ??
    state.players[state.currentPlayerIndex];
  const currentRoom = state.rooms[me.roomId];
  const [selectedFloor, setSelectedFloor] = useState<FloorId>(currentRoom?.floor ?? 0);

  const floorRooms = state.roomOrder
    .map((id) => state.rooms[id])
    .filter((r) => r && r.floor === selectedFloor);

  const minX = floorRooms.length ? Math.min(...floorRooms.map((r) => r.x)) - 1 : -2;
  const maxX = floorRooms.length ? Math.max(...floorRooms.map((r) => r.x)) + 1 : 2;
  const minZ = floorRooms.length ? Math.min(...floorRooms.map((r) => r.z)) - 1 : -2;
  const maxZ = floorRooms.length ? Math.max(...floorRooms.map((r) => r.z)) + 1 : 2;

  const cols = Math.max(3, maxX - minX + 1);
  const rows = Math.max(3, maxZ - minZ + 1);

  // Precompute shortest room paths for multi-step auto-walk parity with the 3D board
  const pathsByRoomId = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const r of floorRooms) {
      if (r.id === currentRoom.id) continue;
      const path = findRoomPath(state, currentRoom.id, r.id);
      if (path && path.length > 0) {
        map.set(r.id, path);
      }
    }
    return map;
  }, [state, currentRoom.id, floorRooms]);

  const unexploredDirsOnCurrent = currentRoom.doors.filter(
    (d) => !currentRoom.connectedTo[d] && !(currentRoom.lockedDirections ?? []).includes(d)
  );

  // Current room interactive actions for full 2D keyboard/blueprint accessibility parity
  const roomTemplate = getRoomTemplate(currentRoom.templateId);
  const uninspectedInteractables = roomTemplate.interactables.filter(
    (inter) => !currentRoom.inspectedIds.includes(inter.id)
  );
  const ghostsInCurrentRoom = state.ghosts.filter((g) => g.roomId === currentRoom.id);
  const stairDestinations = currentRoom.stairLinks
    .map((rid) => state.rooms[rid])
    .filter(Boolean);

  const hasCurrentRoomActions =
    canAct &&
    me.actionPoints >= 1 &&
    Boolean(onDispatchAction) &&
    (!currentRoom.searched ||
      uninspectedInteractables.length > 0 ||
      ghostsInCurrentRoom.length > 0 ||
      stairDestinations.length > 0 ||
      Boolean(currentRoom.hasAnchor && !currentRoom.anchorDisabled) ||
      Boolean(currentRoom.hasClockMechanism && !currentRoom.clockAligned) ||
      Boolean(currentRoom.hasReflectionProof && !currentRoom.reflectionGathered));

  const handleRoomClick = (roomId: string, path: string[]) => {
    if (onWalkToRoom && path.length > 1) {
      onWalkToRoom(path);
    } else if (path.length === 1) {
      onMoveToRoom(roomId);
    }
    onClose();
  };

  return (
    <ModalShell
      ariaLabelledBy="floorplan-modal-title"
      onClose={onClose}
      backdropClassName="bg-[#080605]/74"
    >
      <div className="walnut-panel animate-card-deal relative max-w-4xl w-full p-5 sm:p-6 max-h-[90vh] flex flex-col">
        {/* Engraved brass corner hairlines */}
        <span className="pointer-events-none absolute top-2.5 left-2.5 w-3.5 h-3.5 border-t border-l border-[#c99c52]/45" />
        <span className="pointer-events-none absolute top-2.5 right-2.5 w-3.5 h-3.5 border-t border-r border-[#c99c52]/45" />
        <span className="pointer-events-none absolute bottom-2.5 left-2.5 w-3.5 h-3.5 border-b border-l border-[#c99c52]/45" />
        <span className="pointer-events-none absolute bottom-2.5 right-2.5 w-3.5 h-3.5 border-b border-r border-[#c99c52]/45" />

        <div className="flex flex-wrap items-center justify-between gap-3 pb-3.5 border-b border-[#c99c52]/25">
          <div className="flex items-center gap-3">
            <Layers className="w-5 h-5 text-[#d4aa62] shrink-0" />
            <div>
              <p className="font-body italic text-xs text-[#c7ad7c]">
                Living Architectural Blueprint
              </p>
              <h3
                id="floorplan-modal-title"
                className="font-display text-2xl font-semibold text-[#f5ebd8] leading-tight"
              >
                Blackwood Estate Floor Plan
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {FLOOR_LABELS.map((fl) => {
              const active = selectedFloor === fl.id;
              return (
                <button
                  key={fl.id}
                  type="button"
                  onClick={() => setSelectedFloor(fl.id)}
                  className={`tactile-btn relative px-3 py-1.5 text-xs font-body whitespace-nowrap cursor-pointer ${
                    active
                      ? 'bg-[#261d14] text-[#f3cb7b] font-medium border border-[#c99c52]/60'
                      : 'bg-[#14100d] text-[#d6c8b0] border border-[#c99c52]/22 hover:border-[#c99c52]/55 hover:text-[#f5ebd8]'
                  }`}
                >
                  {fl.label}
                </button>
              );
            })}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close floor plan"
              className="tactile-btn p-1.5 text-[#b5a48b] hover:text-[#f5ebd8] cursor-pointer ml-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Grid Viewport */}
        <div
          className="flex-1 overflow-auto py-6 px-2"
          style={{
            backgroundImage: 'radial-gradient(rgba(201, 156, 82, 0.12) 1px, transparent 1px)',
            backgroundSize: '20px 20px',
          }}
        >
          {floorRooms.length === 0 ? (
            <div className="py-16 text-center text-sm font-body text-[#a89a84] italic">
              No rooms have been discovered on this floor yet. Use the Grand Staircase to ascend or
              descend.
            </div>
          ) : (
            <div
              className="grid gap-3 mx-auto"
              style={{
                gridTemplateColumns: `repeat(${cols}, minmax(122px, 152px))`,
                width: 'fit-content',
              }}
            >
              {Array.from({ length: rows }).map((_, rIdx) => {
                const z = minZ + rIdx;
                return Array.from({ length: cols }).map((__, cIdx) => {
                  const x = minX + cIdx;
                  const room = floorRooms.find((rm) => rm.x === x && rm.z === z);

                  if (!room) {
                    let discoverDir: Direction | null = null;
                    if (currentRoom.floor === selectedFloor) {
                      if (
                        x === currentRoom.x &&
                        z === currentRoom.z - 1 &&
                        unexploredDirsOnCurrent.includes('N')
                      )
                        discoverDir = 'N';
                      if (
                        x === currentRoom.x &&
                        z === currentRoom.z + 1 &&
                        unexploredDirsOnCurrent.includes('S')
                      )
                        discoverDir = 'S';
                      if (
                        x === currentRoom.x + 1 &&
                        z === currentRoom.z &&
                        unexploredDirsOnCurrent.includes('E')
                      )
                        discoverDir = 'E';
                      if (
                        x === currentRoom.x - 1 &&
                        z === currentRoom.z &&
                        unexploredDirsOnCurrent.includes('W')
                      )
                        discoverDir = 'W';
                    }

                    if (discoverDir) {
                      const dir = discoverDir;
                      return (
                        <button
                          key={`${x}_${z}`}
                          type="button"
                          disabled={!canAct || me.actionPoints < 1}
                          onClick={() => {
                            onDiscoverDoor(dir);
                            onClose();
                          }}
                          className="tactile-btn min-h-[96px] border border-dashed border-[#e2b45e]/75 bg-[#241b12]/80 hover:bg-[#322416] hover:border-[#f0cb7e] flex flex-col items-center justify-center p-2.5 text-center cursor-pointer disabled:opacity-45"
                        >
                          <Compass className="w-4 h-4 text-[#e8be6e] mb-1" />
                          <span className="font-display text-sm font-semibold text-[#f5ebd8]">
                            Open {dir} Door
                          </span>
                          <span className="font-body italic text-[11px] text-[#cfa762]">
                            Discover · <span className="not-italic font-mono-num">1 AP</span>
                          </span>
                        </button>
                      );
                    }
                    return <div key={`${x}_${z}`} className="min-h-[96px]" />;
                  }

                  const isCurrent = room.id === currentRoom.id;
                  const path = pathsByRoomId.get(room.id) ?? null;
                  const stepCost = path ? path.length : null;
                  const canWalkHere = Boolean(
                    !isCurrent && path && stepCost !== null && stepCost <= me.actionPoints
                  );
                  const playersHere = state.players.filter((p) => p.alive && p.roomId === room.id);
                  const ghostsHere = state.ghosts.filter((g) => g.roomId === room.id);
                  const hasScenarioObj =
                    (room.hasAnchor && !room.anchorDisabled) ||
                    (room.hasClockMechanism && !room.clockAligned) ||
                    (room.hasReflectionProof && !room.reflectionGathered) ||
                    room.isHeartChamber;

                  return (
                    <button
                      key={room.id}
                      type="button"
                      disabled={!canWalkHere || !canAct}
                      onClick={() => {
                        if (canWalkHere && path) {
                          handleRoomClick(room.id, path);
                        }
                      }}
                      className={`tactile-btn relative min-h-[96px] p-2.5 text-left border ${
                        isCurrent
                          ? 'bg-[#2c2117] border-[#e5ba68] shadow-[0_0_16px_rgba(229,186,104,0.22)]'
                          : canWalkHere && canAct
                            ? 'bg-[#1a1814] border-[#7fb5a6]/75 hover:border-[#a2dacb] hover:bg-[#22201a] cursor-pointer'
                            : 'bg-[#14100d] border-[#c99c52]/25'
                      }`}
                    >
                      {/* Doorway edge indicators */}
                      {room.doors.includes('N') && (
                        <span
                          className={`absolute top-0 left-1/2 -translate-x-1/2 w-5 h-1 ${
                            room.connectedTo.N ? 'bg-[#d4aa62]' : 'bg-[#e2a84b]/45'
                          }`}
                        />
                      )}
                      {room.doors.includes('S') && (
                        <span
                          className={`absolute bottom-0 left-1/2 -translate-x-1/2 w-5 h-1 ${
                            room.connectedTo.S ? 'bg-[#d4aa62]' : 'bg-[#e2a84b]/45'
                          }`}
                        />
                      )}
                      {room.doors.includes('E') && (
                        <span
                          className={`absolute right-0 top-1/2 -translate-y-1/2 w-1 h-5 ${
                            room.connectedTo.E ? 'bg-[#d4aa62]' : 'bg-[#e2a84b]/45'
                          }`}
                        />
                      )}
                      {room.doors.includes('W') && (
                        <span
                          className={`absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 ${
                            room.connectedTo.W ? 'bg-[#d4aa62]' : 'bg-[#e2a84b]/45'
                          }`}
                        />
                      )}

                      <div className="flex items-start justify-between gap-1">
                        <p className="font-display text-sm leading-snug text-[#f5ebd8] font-semibold">
                          {room.name}
                        </p>
                        {canWalkHere && canAct && stepCost !== null && (
                          <span className="font-mono-num text-[10px] text-[#9de0cf] shrink-0">
                            {stepCost} AP
                          </span>
                        )}
                      </div>

                      <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] font-body italic">
                        {room.stairLinks.length > 0 && (
                          <span className="text-[#d6b16d]">Stairs</span>
                        )}
                        {room.darkened && <span className="text-[#e08276]">Dark</span>}
                        {hasScenarioObj && <span className="text-[#f0c778]">Objective</span>}
                        {!room.searched && <span className="text-[#a89a84]">Unsearched</span>}
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {playersHere.map((p) => {
                          const c = getCharacterById(p.characterId);
                          return (
                            <span
                              key={p.id}
                              title={p.displayName}
                              className="w-4 h-4 rounded-full inline-flex items-center justify-center text-[9px] font-mono-num font-bold text-[#120d0a] ring-1 ring-[#f5ebd8]/55"
                              style={{ backgroundColor: c.accentColor }}
                            >
                              {p.displayName[0]}
                            </span>
                          );
                        })}
                        {ghostsHere.map((g) => (
                          <span
                            key={g.id}
                            title={g.name}
                            className="px-1.5 text-[10px] font-body bg-[#1c2e2a] text-[#9de0cf] border border-[#7fb5a6]/50"
                          >
                            Spirit
                          </span>
                        ))}
                      </div>
                    </button>
                  );
                });
              })}
            </div>
          )}
        </div>

        {/* Current Room Actions Strip (100% keyboard / 2D accessibility parity) */}
        {hasCurrentRoomActions && onDispatchAction && (
          <div className="pt-3 pb-2 border-t border-[#c99c52]/22 space-y-2">
            <p className="font-body italic text-xs text-[#d1ab67]">
              Actions in {currentRoom.name}
            </p>
            <div className="flex flex-wrap gap-2">
              {!currentRoom.searched && (
                <button
                  type="button"
                  onClick={() => {
                    onDispatchAction({ type: 'SEARCH_ROOM' });
                    onClose();
                  }}
                  className="tactile-btn inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#241b13] border border-[#c99c52]/55 text-xs font-body text-[#f5ebd8] hover:border-[#e6be72] cursor-pointer"
                >
                  <Search className="w-3.5 h-3.5 text-[#d4aa62]" />
                  Search Curio · <span className="font-mono-num text-[11px]">1 AP</span>
                </button>
              )}

              {uninspectedInteractables.map((inter) => (
                <button
                  key={inter.id}
                  type="button"
                  onClick={() => {
                    onDispatchAction({ type: 'INSPECT_OBJECT', interactableId: inter.id });
                    onClose();
                  }}
                  className="tactile-btn inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#1b1510] border border-[#c99c52]/40 text-xs font-body text-[#efe3cd] hover:border-[#d4aa62] cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#d4aa62]" />
                  Inspect {inter.name} · <span className="font-mono-num text-[11px]">1 AP</span>
                </button>
              ))}

              {ghostsInCurrentRoom.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => {
                    onClose();
                    if (onSelectGhost) {
                      onSelectGhost(g.id);
                    } else {
                      onDispatchAction({
                        type: 'INTERACT_GHOST',
                        ghostId: g.id,
                        approach: 'observe',
                      });
                    }
                  }}
                  className="tactile-btn px-3 py-1.5 bg-[#14221f] border border-[#7fb5a6]/55 text-xs font-body text-[#d6f2ea] hover:border-[#9cd3c3] cursor-pointer"
                >
                  Interact with {g.name} · <span className="font-mono-num text-[11px]">1 AP</span>
                </button>
              ))}

              {stairDestinations.map((dest) => (
                <button
                  key={dest.id}
                  type="button"
                  onClick={() => {
                    onMoveToRoom(dest.id);
                    onClose();
                  }}
                  className="tactile-btn px-3 py-1.5 bg-[#1d1711] border border-[#c99c52]/45 text-xs font-body text-[#e6be72] hover:border-[#f0c778] cursor-pointer"
                >
                  {dest.floor > currentRoom.floor ? 'Ascend' : 'Descend'} to {dest.name} ·{' '}
                  <span className="font-mono-num text-[11px]">1 AP</span>
                </button>
              ))}

              {currentRoom.hasAnchor && !currentRoom.anchorDisabled && (
                <button
                  type="button"
                  onClick={() => {
                    onDispatchAction({ type: 'SCENARIO_ACTION', subAction: 'disable_anchor' });
                    onClose();
                  }}
                  className="tactile-btn px-3 py-1.5 bg-[#2d1614] border border-[#e2a84b]/75 text-xs font-body text-[#f5ebd8] cursor-pointer"
                >
                  Sever Anchor · <span className="font-mono-num text-[11px]">1 AP</span>
                </button>
              )}

              {currentRoom.hasClockMechanism && !currentRoom.clockAligned && (
                <button
                  type="button"
                  onClick={() => {
                    onDispatchAction({ type: 'SCENARIO_ACTION', subAction: 'align_clock' });
                    onClose();
                  }}
                  className="tactile-btn px-3 py-1.5 bg-[#2d1614] border border-[#e2a84b]/75 text-xs font-body text-[#f5ebd8] cursor-pointer"
                >
                  Align Clock Mechanism · <span className="font-mono-num text-[11px]">1 AP</span>
                </button>
              )}

              {currentRoom.hasReflectionProof && !currentRoom.reflectionGathered && (
                <button
                  type="button"
                  onClick={() => {
                    onDispatchAction({ type: 'SCENARIO_ACTION', subAction: 'gather_proof' });
                    onClose();
                  }}
                  className="tactile-btn px-3 py-1.5 bg-[#2d1614] border border-[#e2a84b]/75 text-xs font-body text-[#f5ebd8] cursor-pointer"
                >
                  Gather Reflection Proof · <span className="font-mono-num text-[11px]">1 AP</span>
                </button>
              )}
            </div>
          </div>
        )}

        <div className="pt-3 border-t border-[#c99c52]/22 flex flex-wrap items-center justify-between gap-2 text-xs font-body text-[#b3a38c]">
          <span>
            Current Room: <strong className="text-[#f5ebd8] font-medium">{currentRoom.name}</strong>{' '}
            · <span className="font-mono-num">{state.roomOrder.length}</span> rooms mapped
          </span>
          <span className="italic">
            Click any highlighted room to walk there (shows AP cost), or a brass door to discover
          </span>
        </div>
      </div>
    </ModalShell>
  );
};

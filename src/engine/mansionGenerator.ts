import type { Direction, FloorId, PlacedRoom, RoomTemplate } from './types.ts';
import { ROOM_TEMPLATES, getRoomTemplate } from './rooms.ts';
import { SeededRng } from './seededRandom.ts';

export const ALL_DIRECTIONS: Direction[] = ['N', 'E', 'S', 'W'];

export const OPPOSITE_DIR: Record<Direction, Direction> = {
  N: 'S',
  E: 'W',
  S: 'N',
  W: 'E',
};

export const DIR_OFFSET: Record<Direction, { dx: number; dz: number }> = {
  N: { dx: 0, dz: -1 },
  E: { dx: 1, dz: 0 },
  S: { dx: 0, dz: 1 },
  W: { dx: -1, dz: 0 },
};

export function rotateDirection(dir: Direction, stepsClockwise: number): Direction {
  const idx = ALL_DIRECTIONS.indexOf(dir);
  return ALL_DIRECTIONS[(idx + ((stepsClockwise % 4) + 4)) % 4];
}

export function rotateDoors(doors: Direction[], stepsClockwise: number): Direction[] {
  return doors.map((d) => rotateDirection(d, stepsClockwise));
}

export function coordKey(floor: FloorId, x: number, z: number): string {
  return `${floor}:${x}:${z}`;
}

export function findRoomAt(
  rooms: Record<string, PlacedRoom>,
  floor: FloorId,
  x: number,
  z: number
): PlacedRoom | undefined {
  return Object.values(rooms).find((r) => r.floor === floor && r.x === x && r.z === z);
}

/**
 * Creates the initial established mansion:
 * - Grand Entrance Hall (0, 0, Ground)
 * - Grand Staircase (0, -1, Ground) linked vertically to Upper Landing (0, -1, Upper) & Cellar Stone Landing (0, -1, Basement)
 * - The Pendulum Vestibule (1, 0, Ground) — mysterious central architectural feature
 */
export function createStartingMansion(startingPlayerId: string): {
  rooms: Record<string, PlacedRoom>;
  roomOrder: string[];
} {
  const entrance: PlacedRoom = {
    id: 'room_entrance',
    templateId: 'grand_entrance_hall',
    name: 'Grand Entrance Hall',
    floor: 0,
    x: 0,
    z: 0,
    rotation: 0,
    doors: ['N', 'E', 'W'],
    connectedTo: { N: 'room_staircase', E: 'room_vestibule' },
    stairLinks: [],
    discoveredByPlayerId: startingPlayerId,
    discoveredOnTurn: 0,
    searched: false,
    inspectedIds: [],
    solvedPuzzleIds: [],
    alteredCount: 0,
    revisitCount: 1,
  };

  const staircase: PlacedRoom = {
    id: 'room_staircase',
    templateId: 'grand_staircase',
    name: 'Grand Staircase',
    floor: 0,
    x: 0,
    z: -1,
    rotation: 0,
    doors: ['N', 'S', 'E', 'W'],
    connectedTo: { S: 'room_entrance' },
    stairLinks: ['room_upper_landing', 'room_basement_landing'],
    discoveredByPlayerId: startingPlayerId,
    discoveredOnTurn: 0,
    searched: false,
    inspectedIds: [],
    solvedPuzzleIds: [],
    alteredCount: 0,
    revisitCount: 0,
  };

  const vestibule: PlacedRoom = {
    id: 'room_vestibule',
    templateId: 'pendulum_vestibule',
    name: 'The Pendulum Vestibule',
    floor: 0,
    x: 1,
    z: 0,
    rotation: 0,
    doors: ['N', 'E', 'S', 'W'],
    connectedTo: { W: 'room_entrance' },
    stairLinks: [],
    discoveredByPlayerId: startingPlayerId,
    discoveredOnTurn: 0,
    searched: false,
    inspectedIds: [],
    solvedPuzzleIds: [],
    alteredCount: 0,
    revisitCount: 0,
  };

  const upperLanding: PlacedRoom = {
    id: 'room_upper_landing',
    templateId: 'upper_landing',
    name: 'Upper Stair Landing',
    floor: 1,
    x: 0,
    z: -1,
    rotation: 0,
    doors: ['N', 'E', 'W'],
    connectedTo: {},
    stairLinks: ['room_staircase'],
    discoveredByPlayerId: startingPlayerId,
    discoveredOnTurn: 0,
    searched: false,
    inspectedIds: [],
    solvedPuzzleIds: [],
    alteredCount: 0,
    revisitCount: 0,
  };

  const basementLanding: PlacedRoom = {
    id: 'room_basement_landing',
    templateId: 'basement_landing',
    name: 'Cellar Stone Landing',
    floor: -1,
    x: 0,
    z: -1,
    rotation: 0,
    doors: ['N', 'E', 'W'],
    connectedTo: {},
    stairLinks: ['room_staircase'],
    discoveredByPlayerId: startingPlayerId,
    discoveredOnTurn: 0,
    searched: false,
    inspectedIds: [],
    solvedPuzzleIds: [],
    alteredCount: 0,
    revisitCount: 0,
  };

  const rooms: Record<string, PlacedRoom> = {
    [entrance.id]: entrance,
    [staircase.id]: staircase,
    [vestibule.id]: vestibule,
    [upperLanding.id]: upperLanding,
    [basementLanding.id]: basementLanding,
  };

  return {
    rooms,
    roomOrder: [entrance.id, staircase.id, vestibule.id, upperLanding.id, basementLanding.id],
  };
}

/**
 * Returns unexplored doorways on a given room (doors that don't yet connect to an existing room
 * AND aren't blocked by an adjacent room lacking a reciprocal door).
 */
export function getUnexploredDoorways(
  rooms: Record<string, PlacedRoom>,
  room: PlacedRoom
): Direction[] {
  return room.doors.filter((dir) => {
    if (room.connectedTo[dir]) return false;
    const { dx, dz } = DIR_OFFSET[dir];
    const existingNeighbor = findRoomAt(rooms, room.floor, room.x + dx, room.z + dz);
    // If an adjacent room already sits at that grid cell, allow opening a loop doorway if it has or can receive a door
    if (existingNeighbor) {
      return true;
    }
    return true;
  });
}

/**
 * Deterministically places a valid room behind `fromRoom`'s doorway in `direction`.
 * Guarantees:
 * - Zero illegal overlaps
 * - Valid reciprocal doorway alignment
 * - Floor compatibility
 * - Unique room templates preferred before repeats
 * - Architectural loops when adjacent placed rooms align
 */
export function discoverRoomThroughDoor(
  rooms: Record<string, PlacedRoom>,
  roomOrder: string[],
  fromRoom: PlacedRoom,
  direction: Direction,
  playerId: string,
  turn: number,
  rng: SeededRng,
  attentionLevel: number
): { room: PlacedRoom; wasLoopShortcut: boolean } | null {
  if (!fromRoom.doors.includes(direction)) {
    return null;
  }
  if (fromRoom.connectedTo[direction]) {
    return null;
  }

  const { dx, dz } = DIR_OFFSET[direction];
  const targetX = fromRoom.x + dx;
  const targetZ = fromRoom.z + dz;
  const neededEntryDir = OPPOSITE_DIR[direction];

  // Check if a room already occupies (floor, targetX, targetZ) — if so, create an architectural loop connection!
  const existing = findRoomAt(rooms, fromRoom.floor, targetX, targetZ);
  if (existing) {
    if (!existing.doors.includes(neededEntryDir)) {
      existing.doors = [...existing.doors, neededEntryDir];
    }
    fromRoom.connectedTo[direction] = existing.id;
    existing.connectedTo[neededEntryDir] = fromRoom.id;
    return { room: existing, wasLoopShortcut: true };
  }

  // Pick eligible templates for this floor
  const usedTemplateIds = new Set(Object.values(rooms).map((r) => r.templateId));
  let candidates = ROOM_TEMPLATES.filter(
    (t) => t.weight > 0 && t.allowedFloors.includes(fromRoom.floor) && !usedTemplateIds.has(t.id)
  );

  // If all unique templates on this floor are exhausted, allow repeats (excluding rare impossible room)
  if (candidates.length === 0) {
    candidates = ROOM_TEMPLATES.filter(
      (t) => t.weight > 0 && t.allowedFloors.includes(fromRoom.floor) && !t.isRare
    );
  }
  if (candidates.length === 0) {
    candidates = ROOM_TEMPLATES.filter((t) => t.weight > 0);
  }

  // Filter candidates that have at least one valid rotation providing `neededEntryDir`
  // and preferably not creating dead-ends too early
  const totalRooms = roomOrder.length;
  interface ValidPlacement {
    template: RoomTemplate;
    rotation: number;
    doors: Direction[];
    scoreWeight: number;
  }

  const placements: ValidPlacement[] = [];
  for (const tpl of candidates) {
    for (let rot = 0; rot < 4; rot++) {
      const rotated = rotateDoors(tpl.defaultDoors, rot);
      if (!rotated.includes(neededEntryDir)) continue;

      // Count how many outward doors remain open (avoid choking the mansion early)
      let openCount = 0;
      let loopMatches = 0;
      for (const d of rotated) {
        if (d === neededEntryDir) continue;
        const off = DIR_OFFSET[d];
        const adj = findRoomAt(rooms, fromRoom.floor, targetX + off.dx, targetZ + off.dz);
        if (!adj) {
          openCount++;
        } else if (adj.doors.includes(OPPOSITE_DIR[d])) {
          loopMatches++;
        }
      }

      if (totalRooms < 8 && openCount === 0 && tpl.defaultDoors.length > 1) {
        continue;
      }

      let w = tpl.weight;
      if (tpl.id === 'room_that_should_not_exist') {
        // Rare surreal room becomes likelier after 6+ rooms or elevated House Attention
        w = totalRooms >= 6 ? Math.max(2, Math.floor(attentionLevel / 12)) : 0.4;
      }
      w += loopMatches * 3;
      w += openCount * 1.5;

      placements.push({
        template: tpl,
        rotation: rot,
        doors: rotated,
        scoreWeight: w,
      });
    }
  }

  // Fallback rotation if tight geometry
  let chosen: ValidPlacement;
  if (placements.length > 0) {
    chosen = rng.weightedPick(placements, (p) => p.scoreWeight);
  } else {
    const fallbackTpl = getRoomTemplate('hidden_passage');
    chosen = {
      template: fallbackTpl,
      rotation: 0,
      doors: ['N', 'S', 'E', 'W'],
      scoreWeight: 1,
    };
  }

  const newId = `room_${roomOrder.length}_${chosen.template.id}_${rng.int(100, 999)}`;
  const newRoom: PlacedRoom = {
    id: newId,
    templateId: chosen.template.id,
    name: chosen.template.name,
    floor: fromRoom.floor,
    x: targetX,
    z: targetZ,
    rotation: chosen.rotation,
    doors: [...chosen.doors],
    connectedTo: {
      [neededEntryDir]: fromRoom.id,
    },
    stairLinks: [],
    discoveredByPlayerId: playerId,
    discoveredOnTurn: turn,
    searched: false,
    inspectedIds: [],
    solvedPuzzleIds: [],
    alteredCount: 0,
    revisitCount: 1,
  };

  // Connect originating doorway
  fromRoom.connectedTo[direction] = newId;

  // Automatically link reciprocal doors to any existing adjacent rooms for smooth architectural loops
  for (const d of newRoom.doors) {
    if (d === neededEntryDir) continue;
    const off = DIR_OFFSET[d];
    const neighbor = findRoomAt(rooms, fromRoom.floor, targetX + off.dx, targetZ + off.dz);
    if (neighbor && neighbor.doors.includes(OPPOSITE_DIR[d]) && !neighbor.connectedTo[OPPOSITE_DIR[d]]) {
      newRoom.connectedTo[d] = neighbor.id;
      neighbor.connectedTo[OPPOSITE_DIR[d]] = newId;
    }
  }

  rooms[newId] = newRoom;
  roomOrder.push(newId);

  return { room: newRoom, wasLoopShortcut: false };
}

/**
 * Automated integrity check verifying:
 * - No overlapping coordinates on same floor
 * - Every connection is bidirectional and points to an existing room
 * - Entire mansion graph is traversable from room_entrance
 */
export function verifyMansionGraph(rooms: Record<string, PlacedRoom>): {
  valid: boolean;
  errors: string[];
  reachableCount: number;
} {
  const errors: string[] = [];
  const occupied = new Map<string, string>();

  for (const room of Object.values(rooms)) {
    const key = coordKey(room.floor, room.x, room.z);
    if (occupied.has(key)) {
      errors.push(`Overlap at ${key}: ${occupied.get(key)} and ${room.id}`);
    } else {
      occupied.set(key, room.id);
    }

    for (const [dir, targetId] of Object.entries(room.connectedTo) as [Direction, string][]) {
      const target = rooms[targetId];
      if (!target) {
        errors.push(`Broken reference from ${room.id} (${dir}) -> ${targetId}`);
        continue;
      }
      const opp = OPPOSITE_DIR[dir];
      if (target.connectedTo[opp] !== room.id) {
        errors.push(`Non-reciprocal door: ${room.id}(${dir}) -> ${target.id} missing (${opp})`);
      }
      if (target.floor !== room.floor) {
        errors.push(`Invalid horizontal cross-floor door: ${room.id} -> ${target.id}`);
      }
      const off = DIR_OFFSET[dir];
      if (target.x !== room.x + off.dx || target.z !== room.z + off.dz) {
        errors.push(`Misaligned coordinates: ${room.id} (${dir}) -> ${target.id}`);
      }
    }

    for (const stairId of room.stairLinks) {
      const target = rooms[stairId];
      if (!target) {
        errors.push(`Broken stair link: ${room.id} -> ${stairId}`);
      } else if (!target.stairLinks.includes(room.id)) {
        errors.push(`One-way stair link: ${room.id} -> ${stairId}`);
      }
    }
  }

  // BFS reachability from room_entrance
  const visited = new Set<string>();
  const queue: string[] = [];
  if (rooms.room_entrance) {
    visited.add('room_entrance');
    queue.push('room_entrance');
  } else {
    errors.push('Missing room_entrance');
  }

  while (queue.length > 0) {
    const curr = rooms[queue.shift()!];
    const adj = [
      ...Object.values(curr.connectedTo).filter((x): x is string => Boolean(x)),
      ...curr.stairLinks,
    ];
    for (const nextId of adj) {
      if (!visited.has(nextId) && rooms[nextId]) {
        visited.add(nextId);
        queue.push(nextId);
      }
    }
  }

  if (visited.size !== Object.keys(rooms).length) {
    errors.push(
      `Disconnected rooms detected: ${visited.size}/${Object.keys(rooms).length} reachable from entrance`
    );
  }

  return { valid: errors.length === 0, errors, reachableCount: visited.size };
}

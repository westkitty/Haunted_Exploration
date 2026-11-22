import type { GameState } from './types';

/**
 * Shortest room-to-room path across connected doorways and staircase links.
 * Returns the ordered array of room IDs to step into (excluding fromRoomId),
 * or null if unreachable.
 */
export function findRoomPath(
  state: GameState,
  fromRoomId: string,
  toRoomId: string
): string[] | null {
  if (fromRoomId === toRoomId) return [];
  const visited = new Set<string>([fromRoomId]);
  const queue: { roomId: string; path: string[] }[] = [{ roomId: fromRoomId, path: [] }];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const room = state.rooms[current.roomId];
    if (!room) continue;
    const neighbors = [
      ...Object.values(room.connectedTo).filter((id): id is string => Boolean(id)),
      ...(room.stairLinks ?? []),
    ];
    for (const nextId of neighbors) {
      if (visited.has(nextId) || !state.rooms[nextId]) continue;
      const nextPath = [...current.path, nextId];
      if (nextId === toRoomId) return nextPath;
      visited.add(nextId);
      queue.push({ roomId: nextId, path: nextPath });
    }
  }
  return null;
}

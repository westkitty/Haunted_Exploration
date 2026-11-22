import type { GhostArchetypeId, GhostInstance, GameState } from './types.ts';
import { SeededRng } from './seededRandom.ts';

export interface GhostArchetypeDef {
  id: GhostArchetypeId;
  name: string;
  subtitle: string;
  description: string;
  primaryColor: string;
  defaultDisposition: GhostInstance['disposition'];
  observeReward: string;
  sootheHint: string;
}

export const GHOST_ARCHETYPES: Record<GhostArchetypeId, GhostArchetypeDef> = {
  watcher: {
    id: 'watcher',
    name: 'The Watcher',
    subtitle: 'Still as a coat rack until you blink.',
    description:
      'A tall, motionless Victorian silhouette that shifts rooms silently when unobserved. Rewards calm observation.',
    primaryColor: '#88c5d9',
    defaultDisposition: 'neutral',
    observeReward: 'Watching patiently reveals a clue about adjacent chambers.',
    sootheHint: 'Insight or Nerve checks calm it; aggression makes it stalk you.',
  },
  mourner: {
    id: 'mourner',
    name: 'The Mourner',
    subtitle: 'Weeps softly behind a drifting linen veil.',
    description:
      'A grieving apparition drawn to music, nurseries, and broken vows. Can become a protective ally if soothed.',
    primaryColor: '#a6c4e8',
    defaultDisposition: 'curious',
    observeReward: 'Listening quietly lowers Pressure and uncovers family history.',
    sootheHint: 'Soothing with Nerve or music quiets its grief permanently.',
  },
  borrower: {
    id: 'borrower',
    name: 'The Borrower',
    subtitle: 'Wears a coat cut remarkably like yours.',
    description:
      'A spectral mimic that imitates explorer footsteps, voices, and gestures—especially dangerous during The Mirror Jury.',
    primaryColor: '#7ad7d4',
    defaultDisposition: 'hostile',
    observeReward: 'Spotting its lagging reflection earns a Reflection Proof.',
    sootheHint: 'Silver Mirror or Tuning Fork disrupts its imitation immediately.',
  },
  lantern_wisp: {
    id: 'lantern_wisp',
    name: 'The Lantern Wisp',
    subtitle: 'Pale cyan flame drifting like a polite usher.',
    description:
      'A compact spectral flame that guides curious explorers toward hidden compartments—or away from teammates.',
    primaryColor: '#66f0df',
    defaultDisposition: 'helpful',
    observeReward: 'Following its drift reveals items or calms Fear.',
    sootheHint: 'Rarely hostile; observing or soothing grants safe guidance.',
  },
  wall_choir: {
    id: 'wall_choir',
    name: 'The Wall Choir',
    subtitle: 'Shifting shadows singing inside the plaster.',
    description:
      'An environmental apparition moving along wainscot trim rather than standing as one body. Amplifies dread in dark wings.',
    primaryColor: '#9c7ab8',
    defaultDisposition: 'neutral',
    observeReward: 'Harmonizing with Nerve lowers House Attention.',
    sootheHint: 'Light sources and Tuning Forks quiet the walls.',
  },
};

export function createGhostInstance(
  archetype: GhostArchetypeId,
  roomId: string,
  rng: SeededRng,
  targetPlayerId?: string
): GhostInstance {
  const def = GHOST_ARCHETYPES[archetype];
  return {
    id: `ghost_${archetype}_${rng.int(1000, 9999)}`,
    archetype,
    name: def.name,
    roomId,
    state: 'manifesting',
    disposition: def.defaultDisposition,
    observedCount: 0,
    soothed: false,
    mimicTargetPlayerId: targetPlayerId,
    lastActionNote: `${def.name} manifests silently within the room.`,
  };
}

/**
 * Advances all active ghosts deterministically at the end of a turn using lightweight state machines:
 * dormant -> manifesting -> observing -> investigating -> reacting -> vanishing
 */
export function advanceGhostsOnTurnEnd(state: GameState, rng: SeededRng): string[] {
  const notes: string[] = [];

  for (const ghost of state.ghosts) {
    if (ghost.soothed || ghost.state === 'vanishing') {
      ghost.state = 'dormant';
      continue;
    }

    const currentRoom = state.rooms[ghost.roomId];
    if (!currentRoom) continue;

    const playersInRoom = state.players.filter((p) => p.alive && p.roomId === ghost.roomId);
    const neighborIds = [
      ...Object.values(currentRoom.connectedTo).filter((id): id is string => Boolean(id)),
      ...currentRoom.stairLinks,
    ];

    if (ghost.state === 'dormant') {
      if (state.pressure >= 20 || rng.next() < 0.35) {
        ghost.state = 'manifesting';
        ghost.lastActionNote = `${ghost.name} stirs back into sight in ${currentRoom.name}.`;
      }
      continue;
    }

    if (ghost.state === 'manifesting') {
      ghost.state = playersInRoom.length > 0 ? 'observing' : 'investigating';
      ghost.lastActionNote =
        playersInRoom.length > 0
          ? `${ghost.name} fixes its silent attention on the explorer in ${currentRoom.name}.`
          : `${ghost.name} drifts along the molding of ${currentRoom.name}.`;
      continue;
    }

    if (ghost.archetype === 'watcher') {
      // Moves ONLY when nobody is observing it in its current room
      if (playersInRoom.length === 0 && neighborIds.length > 0) {
        const activePlayer = state.players[state.currentPlayerIndex];
        // Move closer to or adjacent to active player
        const preferred = neighborIds.find((nid) => nid === activePlayer?.roomId) ?? rng.pick(neighborIds);
        const dest = state.rooms[preferred];
        if (dest && dest.templateId !== 'forgotten_chapel') {
          ghost.roomId = preferred;
          ghost.state = 'observing';
          ghost.lastActionNote = `Unwatched, ${ghost.name} repositioned silently into ${dest.name}.`;
          notes.push(ghost.lastActionNote);
        }
      } else if (playersInRoom.length > 0) {
        ghost.state = 'observing';
        ghost.lastActionNote = `${ghost.name} stands utterly motionless while watched.`;
      }
      continue;
    }

    if (ghost.archetype === 'lantern_wisp') {
      // Drifts toward unexplored doorways or rooms with secrets
      if (neighborIds.length > 0 && rng.next() < 0.65) {
        const destId = rng.pick(neighborIds);
        ghost.roomId = destId;
        ghost.state = 'investigating';
        ghost.lastActionNote = `${ghost.name} floats gently into ${state.rooms[destId]?.name ?? 'an adjacent room'}.`;
      }
      continue;
    }

    // Mourner, Borrower, Wall Choir
    if (playersInRoom.length > 0) {
      ghost.state = 'reacting';
      for (const p of playersInRoom) {
        const hasWardLight = p.inventory.includes('storm_lantern') || p.inventory.includes('tuning_fork');
        if (ghost.disposition === 'hostile') {
          const fearGain = hasWardLight ? 0 : 1;
          if (fearGain > 0) {
            p.fear = Math.min(p.maxFear, p.fear + fearGain);
            notes.push(`${ghost.name} unsettles ${p.displayName} in ${currentRoom.name} (+1 Fear).`);
          } else {
            notes.push(`${p.displayName}'s lantern/ward keeps ${ghost.name} at bay.`);
          }
        } else if (ghost.disposition === 'curious') {
          notes.push(`${ghost.name} hovers near ${p.displayName} in ${currentRoom.name}, waiting to be observed or soothed.`);
        }
      }
    } else if (neighborIds.length > 0 && rng.next() < 0.5) {
      const destId = rng.pick(neighborIds);
      const dest = state.rooms[destId];
      if (dest && (dest.templateId !== 'forgotten_chapel' || ghost.disposition !== 'hostile')) {
        ghost.roomId = destId;
        ghost.state = 'investigating';
        ghost.lastActionNote = `${ghost.name} glides into ${dest.name}.`;
      }
    }
  }

  return notes;
}

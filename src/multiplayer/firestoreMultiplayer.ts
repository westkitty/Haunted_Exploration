import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  firebaseAuth,
  firestoreDb,
  handleFirestoreError,
  OperationType,
} from '../firebase/firebase';
import {
  createNewGame,
  resolveGameAction,
  sanitizeStateForPlayer,
} from '../engine/actionResolver';
import type {
  ActionResult,
  ExpeditionSize,
  GameAction,
  GameState,
  PlayerRole,
} from '../engine/types';
import { generateReadableSeed } from '../engine/seededRandom';

export interface CloudLobbyPlayer {
  uid: string;
  lobbyId: string;
  displayName: string;
  characterId: string;
  ready: boolean;
}

export interface CloudPrivateRole {
  uid: string;
  lobbyId: string;
  role: PlayerRole;
  privateObjective: string;
}

export interface CloudLobbyDoc {
  inviteCode: string;
  hostUid: string;
  status: 'waiting' | 'active' | 'finished';
  seed: string;
  expeditionSize: ExpeditionSize;
  version: number;
  currentTurnUid: string;
  memberUids: string[];
  publicState?: GameState;
}

const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateInviteCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += INVITE_ALPHABET[Math.floor(Math.random() * INVITE_ALPHABET.length)];
  }
  return code;
}

function sanitizeDisplayName(raw: string): string {
  const cleaned = raw.trim().slice(0, 40);
  return cleaned.length > 0 ? cleaned : 'Explorer';
}

/**
 * Removes undefined values recursively because Firestore rejects `undefined` in map fields.
 */
function stripUndefined<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export async function createCloudLobby(options: {
  displayName: string;
  characterId: string;
  seed?: string;
  expeditionSize: ExpeditionSize;
}): Promise<string> {
  const db = firestoreDb;
  const user = firebaseAuth?.currentUser;
  if (!db || !user) throw new Error('Please sign in with Google to host a cloud lobby.');

  const inviteCode = generateInviteCode();
  const lobbyPath = `lobbies/${inviteCode}`;
  const playerPath = `lobbies/${inviteCode}/players/${user.uid}`;
  const seed = (options.seed?.trim() || generateReadableSeed()).toUpperCase().slice(0, 64);

  try {
    await setDoc(doc(db, 'lobbies', inviteCode), {
      inviteCode,
      hostUid: user.uid,
      status: 'waiting',
      seed,
      expeditionSize: options.expeditionSize,
      version: 0,
      currentTurnUid: user.uid,
      memberUids: [user.uid],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, lobbyPath);
  }

  try {
    await setDoc(doc(db, 'lobbies', inviteCode, 'players', user.uid), {
      uid: user.uid,
      lobbyId: inviteCode,
      displayName: sanitizeDisplayName(options.displayName),
      characterId: options.characterId,
      ready: true,
      joinedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, playerPath);
  }

  return inviteCode;
}

export async function joinCloudLobby(options: {
  inviteCode: string;
  displayName: string;
  characterId: string;
}): Promise<string> {
  const db = firestoreDb;
  const user = firebaseAuth?.currentUser;
  if (!db || !user) throw new Error('Please sign in with Google to join a cloud lobby.');

  const code = options.inviteCode.trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) {
    throw new Error('Invite code must be 6 letters/numbers.');
  }

  const lobbyRef = doc(db, 'lobbies', code);
  const playerRef = doc(db, 'lobbies', code, 'players', user.uid);
  const lobbyPath = `lobbies/${code}`;

  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(lobbyRef);
      if (!snap.exists()) {
        throw new Error('No cloud lobby was found with that invite code.');
      }
      const data = snap.data() as CloudLobbyDoc;
      const alreadyMember = data.memberUids.includes(user.uid);
      if (!alreadyMember) {
        if (data.status !== 'waiting') {
          throw new Error('This expedition has already begun.');
        }
        if (data.memberUids.length >= 4) {
          throw new Error('This expedition already has 4 explorers.');
        }
        tx.update(lobbyRef, {
          memberUids: [...data.memberUids, user.uid],
          updatedAt: serverTimestamp(),
        });
      }
    });
  } catch (error) {
    if (error instanceof Error && (error.message.includes('No cloud lobby') || error.message.includes('already'))) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, lobbyPath);
  }

  try {
    const existingPlayer = await getDoc(playerRef);
    if (!existingPlayer.exists()) {
      await setDoc(playerRef, {
        uid: user.uid,
        lobbyId: code,
        displayName: sanitizeDisplayName(options.displayName),
        characterId: options.characterId,
        ready: false,
        joinedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${lobbyPath}/players/${user.uid}`);
  }

  return code;
}

export async function updateCloudPlayerChoice(options: {
  inviteCode: string;
  displayName: string;
  characterId: string;
  ready: boolean;
}): Promise<void> {
  const db = firestoreDb;
  const user = firebaseAuth?.currentUser;
  if (!db || !user) return;
  const code = options.inviteCode.toUpperCase();
  const path = `lobbies/${code}/players/${user.uid}`;
  try {
    await updateDoc(doc(db, 'lobbies', code, 'players', user.uid), {
      displayName: sanitizeDisplayName(options.displayName),
      characterId: options.characterId,
      ready: options.ready,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function startCloudLobbyGame(
  inviteCode: string,
  players: CloudLobbyPlayer[],
  lobby: CloudLobbyDoc
): Promise<void> {
  const db = firestoreDb;
  const user = firebaseAuth?.currentUser;
  if (!db || !user) throw new Error('Not signed in.');
  if (lobby.hostUid !== user.uid) throw new Error('Only the expedition host can start.');
  if (players.length < 1) throw new Error('At least one explorer is required.');

  const orderedPlayers = lobby.memberUids
    .map((uid) => players.find((p) => p.uid === uid))
    .filter((p): p is CloudLobbyPlayer => Boolean(p));

  const initialState = createNewGame({
    seed: lobby.seed,
    expeditionSize: lobby.expeditionSize,
    isMultiplayer: orderedPlayers.length > 1,
    players: orderedPlayers.map((p) => ({
      id: p.uid,
      displayName: p.displayName,
      characterId: p.characterId,
    })),
  });

  const publicState = stripUndefined(sanitizeStateForPlayer(initialState, '__public__'));
  const code = inviteCode.toUpperCase();
  const lobbyRef = doc(db, 'lobbies', code);

  try {
    await runTransaction(db, async (tx) => {
      tx.update(lobbyRef, {
        status: 'active',
        version: 1,
        currentTurnUid: initialState.players[0].id,
        publicState,
        updatedAt: serverTimestamp(),
      });
      for (const p of initialState.players) {
        const roleRef = doc(db, 'lobbies', code, 'privateRoles', p.id);
        tx.set(roleRef, {
          uid: p.id,
          lobbyId: code,
          role: p.role,
          privateObjective: p.privateObjective ?? 'Survive the house and uncover its secrets.',
          updatedAt: serverTimestamp(),
        });
      }
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `lobbies/${code}`);
  }
}

export async function submitCloudAction(
  inviteCode: string,
  action: GameAction
): Promise<ActionResult> {
  const db = firestoreDb;
  const user = firebaseAuth?.currentUser;
  if (!db || !user) {
    throw new Error('You must be signed in to submit an action.');
  }

  const code = inviteCode.toUpperCase();
  const lobbyRef = doc(db, 'lobbies', code);
  const actionRef = doc(db, 'lobbies', code, 'actions', action.actionId);

  let finalResult: ActionResult | null = null;

  try {
    await runTransaction(db, async (tx) => {
      const lobbySnap = await tx.get(lobbyRef);
      if (!lobbySnap.exists()) {
        throw new Error('Lobby no longer exists.');
      }
      const lobby = lobbySnap.data() as CloudLobbyDoc;
      if (lobby.status !== 'active' || !lobby.publicState) {
        throw new Error('Expedition is not currently active.');
      }
      if (lobby.currentTurnUid !== user.uid) {
        throw new Error('It is not your turn.');
      }
      const dupSnap = await tx.get(actionRef);
      if (dupSnap.exists()) {
        throw new Error('Duplicate action ignored.');
      }

      // Re-attach caller's own private role so betrayer/chosen actions resolve accurately
      const myRoleSnap = await tx.get(doc(db, 'lobbies', code, 'privateRoles', user.uid));
      const workingState = structuredClone(lobby.publicState);
      if (myRoleSnap.exists()) {
        const myRole = myRoleSnap.data() as CloudPrivateRole;
        const me = workingState.players.find((p) => p.id === user.uid);
        if (me) {
          me.role = myRole.role;
          me.privateObjective = myRole.privateObjective;
        }
        if (workingState.scenario && (myRole.role === 'chosen' || myRole.role === 'mimic')) {
          workingState.scenario.betrayerPlayerId = user.uid;
        }
      }

      const result = resolveGameAction(workingState, {
        ...action,
        playerId: user.uid,
        expectedVersion: workingState.version,
      });

      finalResult = result;
      if (!result.ok) {
        return;
      }

      const nextState = result.state;
      const nextTurnPlayer = nextState.players[nextState.currentPlayerIndex];
      const nextStatus: 'active' | 'finished' =
        nextState.phase === 'ended' ? 'finished' : 'active';
      const sanitizedPublic = stripUndefined(sanitizeStateForPlayer(nextState, '__public__'));

      tx.update(lobbyRef, {
        status: nextStatus,
        version: lobby.version + 1,
        currentTurnUid: nextTurnPlayer.id,
        publicState: sanitizedPublic,
        updatedAt: serverTimestamp(),
      });

      tx.set(actionRef, {
        actionId: action.actionId,
        lobbyId: code,
        actorUid: user.uid,
        actionType: action.type,
        resultingVersion: lobby.version + 1,
        createdAt: serverTimestamp(),
      });

      // If Revelation just triggered, persist each player's isolated private role doc
      if (result.triggeredRevelation) {
        for (const p of nextState.players) {
          const rRef = doc(db, 'lobbies', code, 'privateRoles', p.id);
          tx.set(rRef, {
            uid: p.id,
            lobbyId: code,
            role: p.role,
            privateObjective:
              p.privateObjective ??
              nextState.scenario?.publicObjective ??
              'Survive the house and uncover its truth.',
            updatedAt: serverTimestamp(),
          });
        }
      }
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('not your turn') ||
        error.message.includes('Duplicate action') ||
        error.message.includes('not currently active'))
    ) {
      return { ok: false, error: error.message, state: {} as GameState };
    }
    handleFirestoreError(error, OperationType.WRITE, `lobbies/${code}`);
  }

  return finalResult ?? { ok: false, error: 'Transaction did not commit.', state: {} as GameState };
}

export interface CloudLobbySubscriptions {
  unsubscribe: () => void;
}

export function subscribeToCloudLobby(
  inviteCode: string,
  uid: string,
  callbacks: {
    onLobby: (lobby: CloudLobbyDoc | null) => void;
    onPlayers: (players: CloudLobbyPlayer[]) => void;
    onPrivateRole: (role: CloudPrivateRole | null) => void;
    onError: (err: string) => void;
  }
): CloudLobbySubscriptions {
  const db = firestoreDb;
  if (!db) {
    callbacks.onError('Firestore is not initialized.');
    return { unsubscribe: () => {} };
  }

  const code = inviteCode.toUpperCase();
  const unsubs: Unsubscribe[] = [];

  unsubs.push(
    onSnapshot(
      doc(db, 'lobbies', code),
      (snap) => {
        callbacks.onLobby(snap.exists() ? (snap.data() as CloudLobbyDoc) : null);
      },
      (err) => {
        callbacks.onError(err.message);
      }
    )
  );

  const playersQuery = query(
    collection(db, 'lobbies', code, 'players'),
    where('lobbyId', '==', code)
  );
  unsubs.push(
    onSnapshot(
      playersQuery,
      (snap) => {
        const list = snap.docs.map((d) => d.data() as CloudLobbyPlayer);
        callbacks.onPlayers(list);
      },
      (err) => {
        callbacks.onError(err.message);
      }
    )
  );

  // Subscribe ONLY to caller's own isolated privateRole document
  unsubs.push(
    onSnapshot(
      doc(db, 'lobbies', code, 'privateRoles', uid),
      (snap) => {
        callbacks.onPrivateRole(snap.exists() ? (snap.data() as CloudPrivateRole) : null);
      },
      () => {
        // Ignore transient permission error before game starts or before role doc exists
      }
    )
  );

  return {
    unsubscribe: () => {
      for (const u of unsubs) u();
    },
  };
}

/**
 * Merges a player's own isolated privateRole doc back into the sanitized public GameState for UI display.
 */
export function mergePrivateRoleIntoState(
  publicState: GameState,
  uid: string,
  privateRole: CloudPrivateRole | null
): GameState {
  const merged = structuredClone(publicState);
  if (privateRole && merged.phase !== 'ended') {
    const me = merged.players.find((p) => p.id === uid);
    if (me) {
      me.role = privateRole.role;
      me.privateObjective = privateRole.privateObjective;
    }
    if (merged.scenario && (privateRole.role === 'chosen' || privateRole.role === 'mimic')) {
      merged.scenario.betrayerPlayerId = uid;
    }
  }
  return merged;
}

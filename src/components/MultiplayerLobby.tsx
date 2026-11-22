import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Cloud,
  Copy,
  Dices,
  LogIn,
  LogOut,
  Radio,
  Users,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import { CHARACTERS } from '../engine/characters';
import { generateReadableSeed } from '../engine/seededRandom';
import type { ExpeditionSize } from '../engine/types';
import type { CloudLobbyDoc, CloudLobbyPlayer } from '../multiplayer/firestoreMultiplayer';
import type { WsLobbySnapshot } from '../multiplayer/wsMultiplayer';
import { CharacterPortrait } from './CharacterPortrait';
import { ExplorerSummaryCard } from './ExplorerSummaryCard';

export type MultiplayerTransport = 'ws' | 'firebase';

const PACING_OPTIONS: { id: ExpeditionSize; label: string; sub: string }[] = [
  { id: 'short', label: 'Short', sub: 'Dread 42' },
  { id: 'standard', label: 'Standard', sub: 'Dread 58' },
  { id: 'extended', label: 'Extended', sub: 'Dread 75' },
];

interface MultiplayerLobbyProps {
  initialJoinCode?: string;
  transport: MultiplayerTransport;
  onChangeTransport: (t: MultiplayerTransport) => void;
  // Firebase state
  firebaseReady: boolean;
  firebaseUser: User | null;
  onSignInGoogle: () => Promise<void>;
  onSignOutGoogle: () => Promise<void>;
  cloudLobby: CloudLobbyDoc | null;
  cloudPlayers: CloudLobbyPlayer[];
  onCreateCloudLobby: (opts: {
    displayName: string;
    characterId: string;
    seed: string;
    expeditionSize: ExpeditionSize;
  }) => Promise<void>;
  onJoinCloudLobby: (opts: {
    inviteCode: string;
    displayName: string;
    characterId: string;
  }) => Promise<void>;
  onUpdateCloudPlayer: (opts: {
    displayName: string;
    characterId: string;
    ready: boolean;
  }) => Promise<void>;
  onStartCloudGame: () => Promise<void>;
  onLeaveCloudLobby: () => void;
  // Live WS Server state
  wsStatus: 'connecting' | 'connected' | 'reconnecting' | 'disconnected';
  wsPlayerId: string;
  wsLobby: WsLobbySnapshot | null;
  onCreateWsLobby: (opts: {
    displayName: string;
    characterId: string;
    seed: string;
    expeditionSize: ExpeditionSize;
  }) => void;
  onJoinWsLobby: (opts: {
    lobbyCode: string;
    displayName: string;
    characterId: string;
  }) => void;
  onUpdateWsMember: (opts: {
    displayName: string;
    characterId: string;
    ready: boolean;
  }) => void;
  onStartWsGame: () => void;
  onLeaveWsLobby: () => void;
  error: string | null;
  onBack: () => void;
}

export const MultiplayerLobby: React.FC<MultiplayerLobbyProps> = ({
  initialJoinCode,
  transport,
  onChangeTransport,
  firebaseReady,
  firebaseUser,
  onSignInGoogle,
  onSignOutGoogle,
  cloudLobby,
  cloudPlayers,
  onCreateCloudLobby,
  onJoinCloudLobby,
  onUpdateCloudPlayer,
  onStartCloudGame,
  onLeaveCloudLobby,
  wsStatus,
  wsPlayerId,
  wsLobby,
  onCreateWsLobby,
  onJoinWsLobby,
  onUpdateWsMember,
  onStartWsGame,
  onLeaveWsLobby,
  error,
  onBack,
}) => {
  const [displayName, setDisplayName] = useState<string>(
    firebaseUser?.displayName || 'Archivist Guest'
  );
  const [characterId, setCharacterId] = useState<string>(CHARACTERS[0].id);
  const [joinCode, setJoinCode] = useState<string>(initialJoinCode || '');
  const [seed, setSeed] = useState<string>(generateReadableSeed());
  const [expeditionSize, setExpeditionSize] = useState<ExpeditionSize>('standard');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [inviteOnlyView, setInviteOnlyView] = useState<boolean>(Boolean(initialJoinCode));

  useEffect(() => {
    if (initialJoinCode) {
      setJoinCode(initialJoinCode);
      setInviteOnlyView(true);
    }
  }, [initialJoinCode]);

  const activeLobbyCode =
    transport === 'firebase' ? cloudLobby?.inviteCode ?? null : wsLobby?.lobbyCode ?? null;
  const isHost =
    transport === 'firebase'
      ? Boolean(firebaseUser && cloudLobby && cloudLobby.hostUid === firebaseUser.uid)
      : Boolean(wsLobby && wsLobby.hostPlayerId === wsPlayerId);

  useEffect(() => {
    if (activeLobbyCode) return;
    const onKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        onBack();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeLobbyCode, onBack]);

  const members =
    transport === 'firebase'
      ? cloudPlayers.map((p) => ({
          id: p.uid,
          displayName: p.displayName,
          characterId: p.characterId,
          ready: p.ready,
          connected: true,
        }))
      : (wsLobby?.members ?? []).map((m) => ({
          id: m.playerId,
          displayName: m.displayName,
          characterId: m.characterId,
          ready: m.ready,
          connected: m.connected,
        }));

  const myMemberId = transport === 'firebase' ? firebaseUser?.uid ?? '' : wsPlayerId;
  const myMember = members.find((m) => m.id === myMemberId);
  const activeCharacter =
    CHARACTERS.find((c) => c.id === (myMember?.characterId ?? characterId)) ?? CHARACTERS[0];

  const handleCopyInvite = () => {
    if (!activeLobbyCode) return;
    const shareUrl = `${window.location.origin}${window.location.pathname}?lobby=${activeLobbyCode}&mode=${transport}`;
    navigator.clipboard?.writeText(shareUrl).catch(() => {});
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const handleCreate = async () => {
    setBusy(true);
    try {
      const effectiveName = displayName.trim() || firebaseUser?.displayName || 'Explorer';
      if (transport === 'firebase') {
        await onCreateCloudLobby({
          displayName: effectiveName,
          characterId,
          seed,
          expeditionSize,
        });
      } else {
        onCreateWsLobby({
          displayName: effectiveName,
          characterId,
          seed,
          expeditionSize,
        });
      }
    } finally {
      setBusy(false);
    }
  };

  const handleJoin = async () => {
    if (!joinCode.trim()) return;
    setBusy(true);
    try {
      const effectiveName = displayName.trim() || firebaseUser?.displayName || 'Explorer';
      if (transport === 'firebase') {
        await onJoinCloudLobby({
          inviteCode: joinCode.trim().toUpperCase(),
          displayName: effectiveName,
          characterId,
        });
      } else {
        onJoinWsLobby({
          lobbyCode: joinCode.trim().toUpperCase(),
          displayName: effectiveName,
          characterId,
        });
      }
    } finally {
      setBusy(false);
    }
  };

  const handlePickCharacterInLobby = async (cid: string) => {
    setCharacterId(cid);
    const effectiveName = displayName.trim() || myMember?.displayName || 'Explorer';
    if (transport === 'firebase') {
      await onUpdateCloudPlayer({
        displayName: effectiveName,
        characterId: cid,
        ready: myMember?.ready ?? false,
      });
    } else {
      onUpdateWsMember({
        displayName: effectiveName,
        characterId: cid,
        ready: myMember?.ready ?? false,
      });
    }
  };

  const handleToggleReady = async () => {
    const nextReady = !(myMember?.ready ?? false);
    const effectiveName = displayName.trim() || myMember?.displayName || 'Explorer';
    if (transport === 'firebase') {
      await onUpdateCloudPlayer({
        displayName: effectiveName,
        characterId: myMember?.characterId ?? characterId,
        ready: nextReady,
      });
    } else {
      onUpdateWsMember({
        displayName: effectiveName,
        characterId: myMember?.characterId ?? characterId,
        ready: nextReady,
      });
    }
  };

  return (
    <div className="fixed inset-0 z-30 bg-[#0b0807]/84 overflow-y-auto p-4 sm:p-8">
      <div className="max-w-5xl mx-auto space-y-6 animate-card-deal">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#c99c52]/25 pb-4">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={onBack}
              className="tactile-btn flex items-center gap-2 px-3 py-1.5 border border-[#c99c52]/35 bg-[#15100c]/85 text-xs font-body text-[#dfd2bc] hover:border-[#d4aa62] hover:text-[#f5ebd8] whitespace-nowrap cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Menu
            </button>
            <div>
              <p className="font-body italic text-xs text-[#89cbb9]">
                Synchronized Expedition · 2–4 Players
              </p>
              <h2 className="font-display text-3xl sm:text-4xl font-semibold text-[#f5ebd8] leading-tight">
                Play With Friends
              </h2>
            </div>
          </div>

          {!activeLobbyCode && (
            <div className="flex border border-[#c99c52]/35 bg-[#14100c]">
              <button
                type="button"
                onClick={() => onChangeTransport('ws')}
                className={`tactile-btn flex items-center gap-2 px-3.5 py-2 text-xs font-body whitespace-nowrap cursor-pointer ${
                  transport === 'ws'
                    ? 'bg-gradient-to-b from-[#dfb467] to-[#b8893f] text-[#17110b] font-semibold'
                    : 'text-[#d9ccb5] hover:text-[#f5ebd8]'
                }`}
              >
                <Radio className="w-3.5 h-3.5" />
                Quick Room (No Sign-In)
              </button>
              <button
                type="button"
                onClick={() => onChangeTransport('firebase')}
                className={`tactile-btn flex items-center gap-2 px-3.5 py-2 text-xs font-body whitespace-nowrap cursor-pointer ${
                  transport === 'firebase'
                    ? 'bg-gradient-to-b from-[#dfb467] to-[#b8893f] text-[#17110b] font-semibold'
                    : 'text-[#d9ccb5] hover:text-[#f5ebd8]'
                }`}
              >
                <Cloud className="w-3.5 h-3.5" />
                Cloud Room (Google)
              </button>
            </div>
          )}
        </div>

        {error && (
          <div className="p-3.5 bg-[#361614] border border-[#9e3b33] text-sm font-body text-[#f4cac3]">
            {error}
          </div>
        )}

        {/* Firebase Google Auth gate when Cloud Room selected */}
        {transport === 'firebase' && (
          <div className="walnut-panel p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-body text-[#dfd2bc]">
              {firebaseUser ? (
                <span>
                  Signed in as{' '}
                  <strong className="text-[#f5ebd8] font-medium">
                    {firebaseUser.displayName || firebaseUser.email}
                  </strong>
                  {' · '}
                  <span className="text-[#89cbb9]">Cloud sync active</span>
                </span>
              ) : (
                <span>
                  Sign in with Google to host or join persistent Cloud Rooms with isolated secret
                  betrayal roles across sessions.
                </span>
              )}
            </div>
            {firebaseReady ? (
              firebaseUser ? (
                <button
                  type="button"
                  onClick={onSignOutGoogle}
                  className="tactile-btn flex items-center gap-2 px-3.5 py-2 border border-[#c99c52]/40 text-xs font-body text-[#dfd2bc] hover:border-[#d4aa62] whitespace-nowrap cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Sign Out
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onSignInGoogle}
                  className="tactile-btn flex items-center gap-2 px-4 py-2 bg-gradient-to-b from-[#dfb467] to-[#b8893f] text-[#17110b] text-sm font-display font-semibold hover:from-[#eac379] hover:to-[#c79547] whitespace-nowrap cursor-pointer"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  Sign In With Google
                </button>
              )
            ) : (
              <span className="font-body italic text-xs text-[#a89a84]">Cloud sync unavailable</span>
            )}
          </div>
        )}

        {/* Active Lobby Waiting Room */}
        {activeLobbyCode ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 walnut-panel relative p-6 space-y-5">
              <span className="pointer-events-none absolute top-2.5 left-2.5 w-3 h-3 border-t border-l border-[#c99c52]/45" />
              <span className="pointer-events-none absolute top-2.5 right-2.5 w-3 h-3 border-t border-r border-[#c99c52]/45" />
              <span className="pointer-events-none absolute bottom-2.5 left-2.5 w-3 h-3 border-b border-l border-[#c99c52]/45" />
              <span className="pointer-events-none absolute bottom-2.5 right-2.5 w-3 h-3 border-b border-r border-[#c99c52]/45" />

              <div>
                <p className="font-body italic text-xs text-[#c7ad7c]">Invite Code</p>
                <div className="flex items-center justify-between mt-1">
                  <span className="font-mono-num text-3xl tracking-[0.26em] text-[#f5ebd8] font-semibold">
                    {activeLobbyCode}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyInvite}
                    className="tactile-btn flex items-center gap-1.5 px-3 py-1.5 border border-[#c99c52]/45 bg-[#201812] text-xs font-body text-[#f0c778] hover:border-[#e6be72] whitespace-nowrap cursor-pointer"
                  >
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? 'Copied Link' : 'Copy Link'}
                  </button>
                </div>
                <p className="text-xs font-body text-[#a89a84] mt-2">
                  Seed:{' '}
                  <span className="font-mono-num text-[#dfd2bc]">
                    {transport === 'firebase' ? cloudLobby?.seed : wsLobby?.seed}
                  </span>
                  {' · '}
                  Pacing:{' '}
                  <span className="capitalize text-[#dfd2bc]">
                    {transport === 'firebase'
                      ? cloudLobby?.expeditionSize
                      : wsLobby?.expeditionSize}
                  </span>
                </p>
              </div>

              <div className="brass-divider" />

              <div className="space-y-2.5">
                <p className="font-body italic text-xs text-[#c7ad7c]">
                  Expedition Party{' '}
                  <span className="not-italic font-mono-num text-[11px] text-[#a89a84]">
                    ({members.length} / 4)
                  </span>
                </p>
                {members.map((m) => {
                  const char = CHARACTERS.find((c) => c.id === m.characterId) ?? CHARACTERS[0];
                  return (
                    <div
                      key={m.id}
                      className="flex items-center justify-between p-2.5 bg-[#15100c] border border-[#c99c52]/24"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <CharacterPortrait character={char} size={42} />
                        <div className="min-w-0">
                          <p className="text-sm font-body text-[#f5ebd8] truncate">
                            {m.displayName}{' '}
                            {m.id === myMemberId && (
                              <span className="italic text-xs text-[#d4aa62]">(You)</span>
                            )}
                          </p>
                          <p className="text-xs font-body italic text-[#a89a84] truncate">
                            {char.name}
                          </p>
                        </div>
                      </div>
                      <span
                        className={`font-body text-xs whitespace-nowrap shrink-0 ${
                          m.ready ? 'text-[#89cbb9] font-medium' : 'italic text-[#a89a84]'
                        }`}
                      >
                        {m.ready ? 'Ready' : 'Preparing'}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-wrap gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={handleToggleReady}
                  className="tactile-btn flex-1 py-2.5 border border-[#c99c52]/48 bg-[#1e1711] font-display text-base font-semibold text-[#f5ebd8] hover:border-[#e6be72] whitespace-nowrap cursor-pointer"
                >
                  {myMember?.ready ? 'Cancel Ready' : 'Mark Ready'}
                </button>
                {isHost && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        if (transport === 'firebase') await onStartCloudGame();
                        else onStartWsGame();
                      } finally {
                        setBusy(false);
                      }
                    }}
                    className="tactile-btn flex-1 py-2.5 bg-gradient-to-b from-[#dfb467] to-[#b8893f] text-[#17110b] font-display text-base font-semibold hover:from-[#eac379] hover:to-[#c79547] whitespace-nowrap cursor-pointer disabled:opacity-50"
                  >
                    Launch Expedition
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={transport === 'firebase' ? onLeaveCloudLobby : onLeaveWsLobby}
                className="tactile-btn w-full py-2 text-xs font-body text-[#a89a84] hover:text-[#e5897d] cursor-pointer"
              >
                Leave Lobby
              </button>
            </div>

            {/* Character picker + Full Explorer Trait & Relic Preview inside lobby */}
            <div className="lg:col-span-7 walnut-panel relative p-6 space-y-4">
              <span className="pointer-events-none absolute top-2.5 left-2.5 w-3 h-3 border-t border-l border-[#c99c52]/45" />
              <span className="pointer-events-none absolute top-2.5 right-2.5 w-3 h-3 border-t border-r border-[#c99c52]/45" />
              <span className="pointer-events-none absolute bottom-2.5 left-2.5 w-3 h-3 border-b border-l border-[#c99c52]/45" />
              <span className="pointer-events-none absolute bottom-2.5 right-2.5 w-3 h-3 border-b border-r border-[#c99c52]/45" />

              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-display text-2xl font-semibold text-[#f5ebd8]">
                  Select Your Explorer
                </h3>
                <span className="font-body italic text-xs text-[#a89a84]">
                  Synced live across all party members
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {CHARACTERS.map((char) => {
                  const pickedByMe = (myMember?.characterId ?? characterId) === char.id;
                  const pickedByOther = members.some(
                    (m) => m.id !== myMemberId && m.characterId === char.id
                  );
                  return (
                    <button
                      key={char.id}
                      type="button"
                      onClick={() => handlePickCharacterInLobby(char.id)}
                      className={`tactile-btn text-left p-2.5 border cursor-pointer ${
                        pickedByMe
                          ? 'bg-[#261d15] border-[#dfb467] shadow-[0_0_16px_rgba(223,180,103,0.16)]'
                          : 'bg-[#16110d] border-[#c99c52]/24 hover:border-[#c99c52]/55'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <CharacterPortrait character={char} size={40} />
                        <div className="min-w-0">
                          <p className="font-display text-sm font-semibold text-[#f5ebd8] truncate">
                            {char.name.split(' ')[0]}
                          </p>
                          <p className="text-[11px] font-body italic text-[#d4aa62] truncate">
                            {char.title.replace(/^The\s+/i, '')}
                          </p>
                          {pickedByOther && (
                            <p className="font-body text-[10px] text-[#89cbb9]">Ally pick</p>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Full trait / passive / weakness / starting relic preview */}
              <ExplorerSummaryCard character={activeCharacter} compact tone="walnut" />
            </div>
          </div>
        ) : (
          /* Create or Join Lobby Forms (single shared Display Name bar) */
          <div className="space-y-5">
            <div className="walnut-panel p-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <label
                htmlFor="mp-display-name"
                className="font-body italic text-xs text-[#c7ad7c] shrink-0 sm:w-36"
              >
                Your Display Name
              </label>
              <input
                id="mp-display-name"
                type="text"
                maxLength={36}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Archivist Guest"
                className="flex-1 px-3 py-2 bg-[#120d0a] border border-[#c99c52]/35 text-sm font-body text-[#f5ebd8] focus:outline-none focus:border-[#d4aa62]"
              />
              {transport === 'ws' && (
                <span className="font-body italic text-xs text-[#89cbb9] shrink-0">
                  {wsStatus === 'connected' ? 'Live server ready' : `Server: ${wsStatus}`}
                </span>
              )}
            </div>

            {inviteOnlyView ? (
              /* Focused Invite-Link Join View */
              <div className="walnut-panel relative max-w-lg mx-auto p-6 space-y-4">
                <span className="pointer-events-none absolute top-2.5 left-2.5 w-3 h-3 border-t border-l border-[#c99c52]/45" />
                <span className="pointer-events-none absolute top-2.5 right-2.5 w-3 h-3 border-t border-r border-[#c99c52]/45" />
                <span className="pointer-events-none absolute bottom-2.5 left-2.5 w-3 h-3 border-b border-l border-[#c99c52]/45" />
                <span className="pointer-events-none absolute bottom-2.5 right-2.5 w-3 h-3 border-b border-r border-[#c99c52]/45" />

                <div>
                  <p className="font-body italic text-xs text-[#89cbb9]">Invitation Received</p>
                  <h3 className="font-display text-2xl font-semibold text-[#f5ebd8]">
                    Join Expedition {joinCode || 'Room'}
                  </h3>
                </div>
                <p className="text-xs font-body text-[#c7b9a2] leading-relaxed">
                  Confirm your display name above and step into your host’s waiting room.
                </p>

                <div>
                  <label className="block font-body italic text-xs text-[#c7ad7c] mb-1">
                    6-Character Invite Code
                  </label>
                  <input
                    type="text"
                    maxLength={6}
                    value={joinCode}
                    onChange={(e) =>
                      setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))
                    }
                    placeholder="e.g. K7M4QX"
                    className="w-full px-3 py-2.5 bg-[#120d0a] border border-[#c99c52]/45 font-mono-num text-lg tracking-[0.26em] text-[#f5ebd8] uppercase focus:outline-none focus:border-[#d4aa62]"
                  />
                </div>

                <button
                  type="button"
                  disabled={
                    busy || joinCode.length !== 6 || (transport === 'firebase' && !firebaseUser)
                  }
                  onClick={handleJoin}
                  className="tactile-btn w-full py-3 bg-gradient-to-b from-[#dfb467] to-[#b8893f] text-[#17110b] font-display text-base font-semibold tracking-wide hover:from-[#eac379] hover:to-[#c79547] cursor-pointer disabled:opacity-45"
                >
                  Join Expedition
                </button>

                <button
                  type="button"
                  onClick={() => setInviteOnlyView(false)}
                  className="tactile-btn w-full py-1.5 text-xs font-body text-[#c7ad7c] hover:text-[#f5ebd8] cursor-pointer"
                >
                  Host a new expedition instead
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Host New Expedition */}
                <div className="walnut-panel relative p-6 space-y-4">
                  <span className="pointer-events-none absolute top-2.5 left-2.5 w-3 h-3 border-t border-l border-[#c99c52]/45" />
                  <span className="pointer-events-none absolute top-2.5 right-2.5 w-3 h-3 border-t border-r border-[#c99c52]/45" />
                  <span className="pointer-events-none absolute bottom-2.5 left-2.5 w-3 h-3 border-b border-l border-[#c99c52]/45" />
                  <span className="pointer-events-none absolute bottom-2.5 right-2.5 w-3 h-3 border-b border-r border-[#c99c52]/45" />

                  <div className="flex items-center justify-between">
                    <h3 className="font-display text-2xl font-semibold text-[#f5ebd8]">
                      Host Expedition
                    </h3>
                    <Users className="w-4 h-4 text-[#d4aa62]" />
                  </div>
                  <p className="text-xs font-body text-[#c7b9a2] leading-relaxed">
                    {transport === 'ws'
                      ? 'Instant room with no account required. Share the 6-character code or invite link across tabs or devices.'
                      : 'Persistent cloud room with turn enforcement and private per-player betrayal documents.'}
                  </p>

                  <div className="space-y-3.5">
                    <div>
                      <label className="block font-body italic text-xs text-[#c7ad7c] mb-1">
                        Mansion Seed
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          maxLength={40}
                          value={seed}
                          onChange={(e) => setSeed(e.target.value.toUpperCase())}
                          className="flex-1 px-3 py-2 bg-[#120d0a] border border-[#c99c52]/32 font-mono-num text-xs text-[#f5ebd8] focus:outline-none focus:border-[#d4aa62]"
                        />
                        <button
                          type="button"
                          onClick={() => setSeed(generateReadableSeed())}
                          aria-label="Roll random seed"
                          title="Roll random seed"
                          className="tactile-btn px-3 py-2 bg-[#231b14] border border-[#c99c52]/35 text-[#d4aa62] hover:border-[#e6be72] cursor-pointer"
                        >
                          <Dices className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div>
                      <span className="block font-body italic text-xs text-[#c7ad7c] mb-1">
                        Expedition Pacing (Revelation Threshold)
                      </span>
                      <div className="grid grid-cols-3 gap-2">
                        {PACING_OPTIONS.map((p) => {
                          const active = expeditionSize === p.id;
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => setExpeditionSize(p.id)}
                              className={`tactile-btn py-1.5 border text-center cursor-pointer ${
                                active
                                  ? 'bg-gradient-to-b from-[#dfb467] to-[#b8893f] text-[#17110b] border-[#dfb467]'
                                  : 'bg-[#120d0a] text-[#d9ccb5] border-[#c99c52]/28 hover:border-[#c99c52]/60'
                              }`}
                            >
                              <span
                                className={`block text-xs font-body ${active ? 'font-semibold' : ''}`}
                              >
                                {p.label}
                              </span>
                              <span
                                className={`block font-mono-num text-[10px] ${
                                  active ? 'text-[#281b0c]' : 'text-[#a89a84]'
                                }`}
                              >
                                {p.sub}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={busy || (transport === 'firebase' && !firebaseUser)}
                    onClick={handleCreate}
                    className="tactile-btn w-full py-3 bg-gradient-to-b from-[#dfb467] to-[#b8893f] text-[#17110b] font-display text-base font-semibold tracking-wide hover:from-[#eac379] hover:to-[#c79547] cursor-pointer disabled:opacity-45"
                  >
                    Create Invite Code
                  </button>
                </div>

                {/* Join Existing Expedition */}
                <div className="walnut-panel relative p-6 space-y-4 flex flex-col justify-between">
                  <span className="pointer-events-none absolute top-2.5 left-2.5 w-3 h-3 border-t border-l border-[#c99c52]/45" />
                  <span className="pointer-events-none absolute top-2.5 right-2.5 w-3 h-3 border-t border-r border-[#c99c52]/45" />
                  <span className="pointer-events-none absolute bottom-2.5 left-2.5 w-3 h-3 border-b border-l border-[#c99c52]/45" />
                  <span className="pointer-events-none absolute bottom-2.5 right-2.5 w-3 h-3 border-b border-r border-[#c99c52]/45" />

                  <div className="space-y-4">
                    <h3 className="font-display text-2xl font-semibold text-[#f5ebd8]">
                      Join by Invite Code
                    </h3>
                    <p className="text-xs font-body text-[#c7b9a2] leading-relaxed">
                      Enter the 6-character code from your expedition host to join their manor
                      party.
                    </p>

                    <div>
                      <label className="block font-body italic text-xs text-[#c7ad7c] mb-1">
                        6-Character Invite Code
                      </label>
                      <input
                        type="text"
                        maxLength={6}
                        value={joinCode}
                        onChange={(e) =>
                          setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))
                        }
                        placeholder="e.g. K7M4QX"
                        className="w-full px-3 py-2.5 bg-[#120d0a] border border-[#c99c52]/45 font-mono-num text-lg tracking-[0.26em] text-[#f5ebd8] uppercase focus:outline-none focus:border-[#d4aa62]"
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={
                      busy || joinCode.length !== 6 || (transport === 'firebase' && !firebaseUser)
                    }
                    onClick={handleJoin}
                    className="tactile-btn w-full py-3 bg-[#231b14] border border-[#c99c52] text-[#f5ebd8] font-display text-base font-semibold tracking-wide hover:bg-[#31261d] cursor-pointer disabled:opacity-45"
                  >
                    Join Expedition
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

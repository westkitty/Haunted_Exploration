import type { ExpeditionSize, GameAction, GameState } from '../engine/types';

export interface WsLobbyMember {
  playerId: string;
  displayName: string;
  characterId: string;
  ready: boolean;
  connected: boolean;
}

export interface WsLobbySnapshot {
  lobbyCode: string;
  hostPlayerId: string;
  status: 'waiting' | 'active' | 'finished';
  seed: string;
  expeditionSize: ExpeditionSize;
  members: WsLobbyMember[];
  state: GameState | null;
}

export interface WsClientCallbacks {
  onConnected?: (playerId: string) => void;
  onLobbyUpdate: (snapshot: WsLobbySnapshot) => void;
  onActionFeedback?: (payload: {
    ok: boolean;
    error?: string;
    soundCue?: string;
    caption?: string;
    triggeredRevelation?: boolean;
  }) => void;
  onStatusChange?: (status: 'connecting' | 'connected' | 'reconnecting' | 'disconnected') => void;
  onError?: (message: string) => void;
}

const SESSION_KEY = 'thtr_ws_session_v1';

interface StoredWsSession {
  playerId: string;
  lobbyCode?: string;
  displayName?: string;
}

function getOrCreatePlayerId(): string {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as StoredWsSession;
      if (parsed.playerId && typeof parsed.playerId === 'string') {
        return parsed.playerId;
      }
    }
  } catch {
    // ignore
  }
  const fresh = `plr_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
  try {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify({ playerId: fresh }));
  } catch {
    // ignore
  }
  return fresh;
}

export class WsMultiplayerClient {
  private ws: WebSocket | null = null;
  private callbacks: WsClientCallbacks;
  public readonly playerId: string;
  private activeLobbyCode: string | null = null;
  private reconnectTimer: number | null = null;
  private intentionallyClosed = false;
  private pendingQueue: Record<string, unknown>[] = [];

  constructor(callbacks: WsClientCallbacks, customPlayerId?: string) {
    this.callbacks = callbacks;
    this.playerId = customPlayerId ?? getOrCreatePlayerId();
  }

  public connect(): void {
    this.intentionallyClosed = false;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${window.location.host}/ws/mp`;
    this.callbacks.onStatusChange?.('connecting');

    const socket = new WebSocket(url);
    this.ws = socket;

    socket.onopen = () => {
      this.callbacks.onStatusChange?.('connected');
      this.callbacks.onConnected?.(this.playerId);

      // Rejoin active lobby automatically on reconnect
      if (this.activeLobbyCode) {
        this.sendRaw({
          type: 'reconnect',
          lobbyCode: this.activeLobbyCode,
          playerId: this.playerId,
        });
      }

      while (this.pendingQueue.length > 0) {
        const msg = this.pendingQueue.shift();
        if (msg) this.sendRaw(msg);
      }
    };

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(String(event.data)) as Record<string, unknown>;
        if (msg.type === 'lobby_state' && msg.snapshot) {
          const snap = msg.snapshot as WsLobbySnapshot;
          this.activeLobbyCode = snap.lobbyCode;
          this.callbacks.onLobbyUpdate(snap);
        } else if (msg.type === 'action_result') {
          this.callbacks.onActionFeedback?.({
            ok: Boolean(msg.ok),
            error: typeof msg.error === 'string' ? msg.error : undefined,
            soundCue: typeof msg.soundCue === 'string' ? msg.soundCue : undefined,
            caption: typeof msg.caption === 'string' ? msg.caption : undefined,
            triggeredRevelation: Boolean(msg.triggeredRevelation),
          });
        } else if (msg.type === 'error' && typeof msg.error === 'string') {
          this.callbacks.onError?.(msg.error);
        }
      } catch {
        // ignore malformed frames
      }
    };

    socket.onclose = () => {
      this.ws = null;
      if (this.intentionallyClosed) {
        this.callbacks.onStatusChange?.('disconnected');
        return;
      }
      this.callbacks.onStatusChange?.('reconnecting');
      this.reconnectTimer = window.setTimeout(() => {
        this.connect();
      }, 1500);
    };

    socket.onerror = () => {
      this.callbacks.onError?.('Live server connection interrupted. Attempting reconnect…');
    };
  }

  private sendRaw(payload: Record<string, unknown>): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    } else {
      this.pendingQueue.push(payload);
      this.connect();
    }
  }

  public createLobby(options: {
    displayName: string;
    characterId: string;
    seed?: string;
    expeditionSize: ExpeditionSize;
  }): void {
    this.sendRaw({
      type: 'create_lobby',
      playerId: this.playerId,
      ...options,
    });
  }

  public joinLobby(options: {
    lobbyCode: string;
    displayName: string;
    characterId: string;
  }): void {
    this.activeLobbyCode = options.lobbyCode.trim().toUpperCase();
    this.sendRaw({
      type: 'join_lobby',
      playerId: this.playerId,
      lobbyCode: this.activeLobbyCode,
      displayName: options.displayName,
      characterId: options.characterId,
    });
  }

  public updateMember(options: {
    lobbyCode: string;
    displayName: string;
    characterId: string;
    ready: boolean;
  }): void {
    this.sendRaw({
      type: 'update_member',
      playerId: this.playerId,
      ...options,
    });
  }

  public startGame(lobbyCode: string): void {
    this.sendRaw({
      type: 'start_game',
      playerId: this.playerId,
      lobbyCode,
    });
  }

  public submitAction(lobbyCode: string, action: GameAction): void {
    this.sendRaw({
      type: 'submit_action',
      playerId: this.playerId,
      lobbyCode,
      action,
    });
  }

  public leaveLobby(): void {
    if (this.activeLobbyCode) {
      this.sendRaw({
        type: 'leave_lobby',
        playerId: this.playerId,
        lobbyCode: this.activeLobbyCode,
      });
      this.activeLobbyCode = null;
    }
  }

  public disconnect(): void {
    this.intentionallyClosed = true;
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }
}

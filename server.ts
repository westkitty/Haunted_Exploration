import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import {
  createNewGame,
  resolveGameAction,
  sanitizeStateForPlayer,
} from './src/engine/actionResolver.ts';
import type { ExpeditionSize, GameAction, GameState } from './src/engine/types.ts';
import { generateReadableSeed } from './src/engine/seededRandom.ts';

interface ServerLobbyMember {
  playerId: string;
  displayName: string;
  characterId: string;
  ready: boolean;
  connected: boolean;
}

interface ServerLobby {
  lobbyCode: string;
  hostPlayerId: string;
  status: 'waiting' | 'active' | 'finished';
  seed: string;
  expeditionSize: ExpeditionSize;
  members: ServerLobbyMember[];
  state: GameState | null;
  sockets: Map<string, WebSocket>;
  updatedAt: number;
}

const VALID_CHARACTER_IDS = new Set([
  'archivist',
  'medium',
  'locksmith',
  'physician',
  'magician',
  'heir',
]);
const VALID_SIZES = new Set<ExpeditionSize>(['short', 'standard', 'extended']);
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const lobbies = new Map<string, ServerLobby>();

function generateLobbyCode(): string {
  for (let attempt = 0; attempt < 20; attempt++) {
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }
    if (!lobbies.has(code)) return code;
  }
  return `H${Date.now().toString(36).toUpperCase().slice(-5)}`;
}

function cleanId(val: unknown): string | null {
  if (typeof val !== 'string') return null;
  const trimmed = val.trim();
  if (trimmed.length < 2 || trimmed.length > 80) return null;
  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) return null;
  return trimmed;
}

function cleanName(val: unknown): string {
  if (typeof val !== 'string') return 'Explorer';
  const trimmed = val.trim().slice(0, 40);
  return trimmed.length > 0 ? trimmed : 'Explorer';
}

function cleanCharId(val: unknown): string {
  return typeof val === 'string' && VALID_CHARACTER_IDS.has(val) ? val : 'archivist';
}

function sendJson(ws: WebSocket | undefined, payload: unknown): void {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function broadcastLobby(lobby: ServerLobby): void {
  lobby.updatedAt = Date.now();
  for (const [playerId, ws] of lobby.sockets.entries()) {
    const sanitized = lobby.state ? sanitizeStateForPlayer(lobby.state, playerId) : null;
    sendJson(ws, {
      type: 'lobby_state',
      snapshot: {
        lobbyCode: lobby.lobbyCode,
        hostPlayerId: lobby.hostPlayerId,
        status: lobby.status,
        seed: lobby.seed,
        expeditionSize: lobby.expeditionSize,
        members: lobby.members,
        state: sanitized,
      },
    });
  }
}

function attachWebSocketServer(server: http.Server): WebSocketServer {
  const wss = new WebSocketServer({ server, path: '/ws/mp' });

  wss.on('connection', (ws: WebSocket) => {
    let boundLobbyCode: string | null = null;
    let boundPlayerId: string | null = null;

    ws.on('message', (raw) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(String(raw)) as Record<string, unknown>;
      } catch {
        sendJson(ws, { type: 'error', error: 'Invalid JSON payload.' });
        return;
      }

      const type = msg.type;
      const playerId = cleanId(msg.playerId);
      if (!playerId) {
        sendJson(ws, { type: 'error', error: 'Valid playerId is required.' });
        return;
      }

      if (type === 'create_lobby') {
        const lobbyCode = generateLobbyCode();
        const seedRaw =
          typeof msg.seed === 'string' && msg.seed.trim().length >= 3
            ? msg.seed.trim().toUpperCase().slice(0, 64)
            : generateReadableSeed();
        const size: ExpeditionSize =
          typeof msg.expeditionSize === 'string' && VALID_SIZES.has(msg.expeditionSize as ExpeditionSize)
            ? (msg.expeditionSize as ExpeditionSize)
            : 'standard';

        const lobby: ServerLobby = {
          lobbyCode,
          hostPlayerId: playerId,
          status: 'waiting',
          seed: seedRaw,
          expeditionSize: size,
          members: [
            {
              playerId,
              displayName: cleanName(msg.displayName),
              characterId: cleanCharId(msg.characterId),
              ready: true,
              connected: true,
            },
          ],
          state: null,
          sockets: new Map([[playerId, ws]]),
          updatedAt: Date.now(),
        };
        lobbies.set(lobbyCode, lobby);
        boundLobbyCode = lobbyCode;
        boundPlayerId = playerId;
        broadcastLobby(lobby);
        return;
      }

      if (type === 'join_lobby' || type === 'reconnect') {
        const code = typeof msg.lobbyCode === 'string' ? msg.lobbyCode.trim().toUpperCase() : '';
        const lobby = lobbies.get(code);
        if (!lobby) {
          sendJson(ws, { type: 'error', error: `Lobby "${code}" not found.` });
          return;
        }

        const existing = lobby.members.find((m) => m.playerId === playerId);
        if (existing) {
          existing.connected = true;
          if (lobby.state) {
            const sp = lobby.state.players.find((p) => p.id === playerId);
            if (sp) sp.connected = true;
          }
        } else {
          if (type === 'reconnect') {
            sendJson(ws, { type: 'error', error: 'Player is not a member of this lobby.' });
            return;
          }
          if (lobby.status !== 'waiting') {
            sendJson(ws, { type: 'error', error: 'This expedition has already started.' });
            return;
          }
          if (lobby.members.length >= 4) {
            sendJson(ws, { type: 'error', error: 'This lobby already has 4 explorers.' });
            return;
          }
          // Pick an unused character if requested one is taken
          const taken = new Set(lobby.members.map((m) => m.characterId));
          let chosenChar = cleanCharId(msg.characterId);
          if (taken.has(chosenChar)) {
            for (const candidate of VALID_CHARACTER_IDS) {
              if (!taken.has(candidate)) {
                chosenChar = candidate;
                break;
              }
            }
          }
          lobby.members.push({
            playerId,
            displayName: cleanName(msg.displayName),
            characterId: chosenChar,
            ready: false,
            connected: true,
          });
        }

        lobby.sockets.set(playerId, ws);
        boundLobbyCode = code;
        boundPlayerId = playerId;
        broadcastLobby(lobby);
        return;
      }

      if (type === 'update_member') {
        const code = typeof msg.lobbyCode === 'string' ? msg.lobbyCode.trim().toUpperCase() : '';
        const lobby = lobbies.get(code);
        if (!lobby || lobby.status !== 'waiting') {
          sendJson(ws, { type: 'error', error: 'Lobby is not accepting pre-game changes.' });
          return;
        }
        const member = lobby.members.find((m) => m.playerId === playerId);
        if (!member) {
          sendJson(ws, { type: 'error', error: 'Not a member of this lobby.' });
          return;
        }
        member.displayName = cleanName(msg.displayName);
        member.characterId = cleanCharId(msg.characterId);
        member.ready = Boolean(msg.ready);
        broadcastLobby(lobby);
        return;
      }

      if (type === 'start_game') {
        const code = typeof msg.lobbyCode === 'string' ? msg.lobbyCode.trim().toUpperCase() : '';
        const lobby = lobbies.get(code);
        if (!lobby) {
          sendJson(ws, { type: 'error', error: 'Lobby not found.' });
          return;
        }
        if (lobby.hostPlayerId !== playerId) {
          sendJson(ws, { type: 'error', error: 'Only the lobby host can begin the expedition.' });
          return;
        }
        if (lobby.status !== 'waiting') {
          sendJson(ws, { type: 'error', error: 'Expedition already started.' });
          return;
        }
        lobby.state = createNewGame({
          seed: lobby.seed,
          expeditionSize: lobby.expeditionSize,
          isMultiplayer: lobby.members.length > 1,
          players: lobby.members.map((m) => ({
            id: m.playerId,
            displayName: m.displayName,
            characterId: m.characterId,
          })),
        });
        lobby.status = 'active';
        broadcastLobby(lobby);
        return;
      }

      if (type === 'submit_action') {
        const code = typeof msg.lobbyCode === 'string' ? msg.lobbyCode.trim().toUpperCase() : '';
        const lobby = lobbies.get(code);
        if (!lobby || !lobby.state || lobby.status !== 'active') {
          sendJson(ws, { type: 'action_result', ok: false, error: 'Expedition is not active.' });
          return;
        }
        if (!lobby.members.some((m) => m.playerId === playerId)) {
          sendJson(ws, { type: 'action_result', ok: false, error: 'Unauthorized player.' });
          return;
        }

        const rawAction = msg.action as GameAction | undefined;
        if (!rawAction || typeof rawAction.actionId !== 'string' || typeof rawAction.type !== 'string') {
          sendJson(ws, { type: 'action_result', ok: false, error: 'Malformed action payload.' });
          return;
        }

        // Enforce server-authenticated playerId so clients cannot spoof another player
        const authoritativeAction: GameAction = {
          ...rawAction,
          playerId,
        };

        const result = resolveGameAction(lobby.state, authoritativeAction);
        if (!result.ok) {
          sendJson(ws, {
            type: 'action_result',
            ok: false,
            error: result.error ?? 'Invalid action.',
          });
          return;
        }

        lobby.state = result.state;
        if (lobby.state.phase === 'ended') {
          lobby.status = 'finished';
        }

        const actionPayload = JSON.stringify({
          type: 'action_result',
          ok: true,
          soundCue: result.soundCue,
          caption: result.caption,
          triggeredRevelation: result.triggeredRevelation,
        });
        for (const [, sock] of lobby.sockets.entries()) {
          if (sock.readyState === WebSocket.OPEN) {
            sock.send(actionPayload);
          }
        }
        broadcastLobby(lobby);
        return;
      }

      if (type === 'leave_lobby') {
        if (boundLobbyCode && boundPlayerId) {
          const lobby = lobbies.get(boundLobbyCode);
          if (lobby) {
            lobby.sockets.delete(boundPlayerId);
            const member = lobby.members.find((m) => m.playerId === boundPlayerId);
            if (member) member.connected = false;
            if (lobby.status === 'waiting') {
              lobby.members = lobby.members.filter((m) => m.playerId !== boundPlayerId);
              if (lobby.members.length === 0) {
                lobbies.delete(boundLobbyCode);
              } else {
                if (lobby.hostPlayerId === boundPlayerId) {
                  lobby.hostPlayerId = lobby.members[0].playerId;
                }
                broadcastLobby(lobby);
              }
            } else {
              if (lobby.state) {
                const sp = lobby.state.players.find((p) => p.id === boundPlayerId);
                if (sp) sp.connected = false;
              }
              broadcastLobby(lobby);
            }
          }
          boundLobbyCode = null;
        }
      }
    });

    ws.on('close', () => {
      if (!boundLobbyCode || !boundPlayerId) return;
      const lobby = lobbies.get(boundLobbyCode);
      if (!lobby) return;
      if (lobby.sockets.get(boundPlayerId) === ws) {
        lobby.sockets.delete(boundPlayerId);
      }
      const member = lobby.members.find((m) => m.playerId === boundPlayerId);
      if (member) member.connected = false;
      if (lobby.state) {
        const sp = lobby.state.players.find((p) => p.id === boundPlayerId);
        if (sp) sp.connected = false;
      }
      broadcastLobby(lobby);
    });
  });

  // Periodic stale waiting lobby cleanup (older than 4 hours)
  setInterval(() => {
    const cutoff = Date.now() - 4 * 60 * 60 * 1000;
    for (const [code, lobby] of lobbies.entries()) {
      if (lobby.sockets.size === 0 && lobby.updatedAt < cutoff) {
        lobbies.delete(code);
      }
    }
  }, 15 * 60 * 1000).unref();

  return wss;
}

export async function startServer(port = Number(process.env.PORT ?? 3000)): Promise<{
  server: http.Server;
  port: number;
}> {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'the-house-that-remembers',
      activeLobbies: lobbies.size,
    });
  });

  const isProd = process.env.NODE_ENV === 'production';
  const distDir = path.resolve(process.cwd(), 'dist');

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (fs.existsSync(distDir)) {
    const assetsDir = path.join(distDir, 'assets');
    if (fs.existsSync(assetsDir)) {
      app.use(
        '/assets',
        express.static(assetsDir, {
          maxAge: '1y',
          immutable: true,
        }),
      );
    }
    app.use(express.static(distDir, { index: false }));
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const server = http.createServer(app);
  attachWebSocketServer(server);

  await new Promise<void>((resolve) => {
    server.listen(port, '0.0.0.0', () => {
      const addr = server.address();
      const boundPort = typeof addr === 'object' && addr ? addr.port : port;
      console.log(`The House That Remembers server listening on http://0.0.0.0:${boundPort}`);
      resolve();
    });
  });

  const addr = server.address();
  const actualPort = typeof addr === 'object' && addr ? addr.port : port;
  return { server, port: actualPort };
}

// Start immediately when invoked directly as entrypoint
const isMainModule =
  process.argv[1] &&
  (process.argv[1].endsWith('server.ts') || process.argv[1].endsWith('server.js'));

if (isMainModule) {
  startServer().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}

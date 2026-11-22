import assert from 'node:assert/strict';
import WebSocket from 'ws';
import {
  createNewGame,
  resolveGameAction,
  sanitizeStateForPlayer,
} from '../src/engine/actionResolver.ts';
import { CHARACTERS } from '../src/engine/characters.ts';
import { EVENTS } from '../src/engine/events.ts';
import { CLUES, ITEMS, OMENS, PUZZLES } from '../src/engine/itemsAndOmens.ts';
import { verifyMansionGraph } from '../src/engine/mansionGenerator.ts';
import { ROOM_TEMPLATES } from '../src/engine/rooms.ts';
import { validateSaveObject } from '../src/engine/saveManager.ts';
import type { Direction, GameState } from '../src/engine/types.ts';
import { startServer } from '../server.ts';

function nextActId(n: number): string {
  return `verify_act_${n}`;
}

function clearAnyModals(state: GameState, playerId: string, counter: { n: number }): GameState {
  let cur = state;
  let guard = 0;
  while ((cur.activeEvent || cur.activePuzzle) && guard < 6) {
    guard++;
    if (cur.activeEvent) {
      if (!cur.activeEvent.resolved) {
        const ev = EVENTS.find((e) => e.id === cur.activeEvent!.eventId)!;
        const choice = ev.choices.find((c) => !c.requiredItemId) ?? ev.choices[0];
        const r = resolveGameAction(cur, {
          actionId: nextActId(++counter.n),
          expectedVersion: cur.version,
          playerId,
          type: 'RESOLVE_EVENT_CHOICE',
          choiceId: choice.id,
        });
        assert.equal(r.ok, true, `Event choice failed: ${r.error}`);
        cur = r.state;
        if (cur.activeEvent?.roll) {
          const roll = cur.activeEvent.roll;
          assert.ok(roll.dice[0] >= 1 && roll.dice[0] <= 6, 'Die 1 out of range');
          assert.ok(roll.dice[1] >= 1 && roll.dice[1] <= 6, 'Die 2 out of range');
          const expectedTotal =
            roll.dice[0] +
            roll.dice[1] +
            roll.traitValue +
            roll.itemModifier +
            roll.bonusModifier +
            roll.fearPenalty;
          assert.equal(roll.total, expectedTotal, 'Dice total mismatch');
        }
      }
      if (cur.activeEvent) {
        const d = resolveGameAction(cur, {
          actionId: nextActId(++counter.n),
          expectedVersion: cur.version,
          playerId,
          type: 'DISMISS_EVENT',
        });
        assert.equal(d.ok, true, `Event dismiss failed: ${d.error}`);
        cur = d.state;
      }
    } else if (cur.activePuzzle) {
      const c = resolveGameAction(cur, {
        actionId: nextActId(++counter.n),
        expectedVersion: cur.version,
        playerId,
        type: 'CLOSE_PUZZLE',
      });
      assert.equal(c.ok, true);
      cur = c.state;
    }
  }
  return cur;
}

async function runTests() {
  console.log('=== TEST A & B: Content Counts, Core Rules, Dice, & Invalid Action Rejection ===');
  assert.ok(CHARACTERS.length >= 6, `Expected >= 6 characters, got ${CHARACTERS.length}`);
  assert.ok(ROOM_TEMPLATES.length >= 24, `Expected >= 24 rooms, got ${ROOM_TEMPLATES.length}`);
  assert.ok(EVENTS.length >= 30, `Expected >= 30 events, got ${EVENTS.length}`);
  assert.ok(ITEMS.length >= 16, `Expected >= 16 items, got ${ITEMS.length}`);
  assert.ok(OMENS.length >= 12, `Expected >= 12 omens, got ${OMENS.length}`);
  assert.ok(CLUES.length >= 18, `Expected >= 18 clues, got ${CLUES.length}`);
  assert.ok(PUZZLES.length >= 5, `Expected >= 5 puzzles, got ${PUZZLES.length}`);

  const counter = { n: 0 };
  let state = createNewGame({
    seed: 'VERIFY-ALPHA-01',
    expeditionSize: 'short',
    players: [{ id: 'p1', displayName: 'Dr. Clara', characterId: 'archivist' }],
  });
  assert.equal(state.players[0].actionPoints, 3);
  assert.equal(state.version, 1);

  // Discover room through West unexplored door from Entrance Hall
  const discRes = resolveGameAction(state, {
    actionId: 'dup_test_1',
    expectedVersion: state.version,
    playerId: 'p1',
    type: 'DISCOVER_ROOM',
    direction: 'W',
  });
  assert.equal(discRes.ok, true, `Discover failed: ${discRes.error}`);
  assert.ok(discRes.discoveredRoomId, 'Expected discoveredRoomId');
  state = discRes.state;
  assert.equal(state.players[0].actionPoints, 2);
  assert.equal(state.version, 2);

  // Reject duplicate actionId
  const dupRes = resolveGameAction(state, {
    actionId: 'dup_test_1',
    expectedVersion: state.version,
    playerId: 'p1',
    type: 'SEARCH_ROOM',
  });
  assert.equal(dupRes.ok, false, 'Duplicate actionId must be rejected');

  // Reject stale expectedVersion
  const staleRes = resolveGameAction(state, {
    actionId: nextActId(++counter.n),
    expectedVersion: 1,
    playerId: 'p1',
    type: 'SEARCH_ROOM',
  });
  assert.equal(staleRes.ok, false, 'Stale expectedVersion must be rejected');

  // Reject wrong player
  const wrongPlayer = resolveGameAction(state, {
    actionId: nextActId(++counter.n),
    expectedVersion: state.version,
    playerId: 'intruder',
    type: 'SEARCH_ROOM',
  });
  assert.equal(wrongPlayer.ok, false, 'Unauthorized player must be rejected');

  state = clearAnyModals(state, 'p1', counter);

  // Search room
  const searchRes = resolveGameAction(state, {
    actionId: nextActId(++counter.n),
    expectedVersion: state.version,
    playerId: 'p1',
    type: 'SEARCH_ROOM',
  });
  assert.equal(searchRes.ok, true, `Search failed: ${searchRes.error}`);
  state = clearAnyModals(searchRes.state, 'p1', counter);

  // End turn resets AP & increments turn
  const endRes = resolveGameAction(state, {
    actionId: nextActId(++counter.n),
    expectedVersion: state.version,
    playerId: 'p1',
    type: 'END_TURN',
  });
  assert.equal(endRes.ok, true);
  state = endRes.state;
  assert.equal(state.turn, 2);
  assert.equal(state.players[0].actionPoints, 3);
  console.log('PASS: Tests A & B passed.');

  console.log('=== TEST C: Multi-Seed Procedural Generation (20 seeds) & Determinism ===');
  for (let s = 1; s <= 20; s++) {
    const seed = `MANOR-SEED-${String(s).padStart(2, '0')}`;
    let gs = createNewGame({
      seed,
      expeditionSize: 'extended',
      players: [{ id: 'p1', displayName: 'Explorer', characterId: CHARACTERS[s % CHARACTERS.length].id }],
    });
    const localC = { n: 1000 * s };
    let steps = 0;

    while (gs.roomOrder.length < 16 && steps < 45 && gs.phase !== 'ended') {
      steps++;
      gs = clearAnyModals(gs, 'p1', localC);
      if (gs.phase === 'ended') break;

      const p = gs.players[0];
      if (p.actionPoints < 1) {
        const er = resolveGameAction(gs, {
          actionId: nextActId(++localC.n),
          expectedVersion: gs.version,
          playerId: 'p1',
          type: 'END_TURN',
        });
        assert.equal(er.ok, true);
        gs = er.state;
        continue;
      }

      const curRoom = gs.rooms[p.roomId];
      const openDir = curRoom.doors.find(
        (d: Direction) => !curRoom.connectedTo[d] && !(curRoom.lockedDirections ?? []).includes(d)
      );

      if (openDir) {
        const r = resolveGameAction(gs, {
          actionId: nextActId(++localC.n),
          expectedVersion: gs.version,
          playerId: 'p1',
          type: 'DISCOVER_ROOM',
          direction: openDir,
        });
        if (r.ok) {
          gs = r.state;
          continue;
        }
      }

      // Otherwise move toward a neighbor or stair link with unexplored doors
      const candidates = [
        ...Object.values(curRoom.connectedTo).filter((id): id is string => Boolean(id)),
        ...curRoom.stairLinks,
      ];
      const target =
        candidates.find((rid) => {
          const rm = gs.rooms[rid];
          return rm && rm.doors.some((d) => !rm.connectedTo[d]);
        }) ?? candidates[steps % Math.max(1, candidates.length)];

      if (target) {
        const mv = resolveGameAction(gs, {
          actionId: nextActId(++localC.n),
          expectedVersion: gs.version,
          playerId: 'p1',
          type: 'MOVE_ROOM',
          targetRoomId: target,
        });
        if (mv.ok) {
          gs = mv.state;
          continue;
        }
      }

      const er = resolveGameAction(gs, {
        actionId: nextActId(++localC.n),
        expectedVersion: gs.version,
        playerId: 'p1',
        type: 'END_TURN',
      });
      gs = er.state;
    }

    const check = verifyMansionGraph(gs.rooms);
    assert.equal(
      check.valid,
      true,
      `Seed ${seed} failed graph integrity: ${check.errors.join('; ')}`
    );
    assert.ok(gs.roomOrder.length >= 10, `Seed ${seed} grew too few rooms (${gs.roomOrder.length})`);
  }

  // Deterministic replay check
  const detA1 = createNewGame({
    seed: 'DET-CHECK-99',
    players: [{ id: 'p1', displayName: 'A', characterId: 'locksmith' }],
  });
  const detB1 = createNewGame({
    seed: 'DET-CHECK-99',
    players: [{ id: 'p1', displayName: 'A', characterId: 'locksmith' }],
  });
  const ra = resolveGameAction(detA1, {
    actionId: 'det1',
    expectedVersion: detA1.version,
    playerId: 'p1',
    type: 'DISCOVER_ROOM',
    direction: 'W',
  });
  const rb = resolveGameAction(detB1, {
    actionId: 'det1',
    expectedVersion: detB1.version,
    playerId: 'p1',
    type: 'DISCOVER_ROOM',
    direction: 'W',
  });
  assert.equal(ra.discoveredRoomId, rb.discoveredRoomId);
  assert.equal(
    ra.state.rooms[ra.discoveredRoomId!].templateId,
    rb.state.rooms[rb.discoveredRoomId!].templateId
  );
  console.log('PASS: Test C (20 seeds + determinism) passed.');

  console.log('=== TEST D: Real Revelation Trigger, Altered Rules, & Endings ===');
  let revState = createNewGame({
    seed: 'REVELATION-SOLO-77',
    expeditionSize: 'short',
    players: [{ id: 'p1', displayName: 'Eleanor', characterId: 'heir' }],
  });
  let guardRev = 0;
  while (revState.phase === 'exploration' && guardRev < 40) {
    guardRev++;
    revState = clearAnyModals(revState, 'p1', counter);
    const p = revState.players[0];
    const room = revState.rooms[p.roomId];
    const openDir = room.doors.find((d) => !room.connectedTo[d]);
    if (p.actionPoints >= 1 && openDir) {
      const r = resolveGameAction(revState, {
        actionId: nextActId(++counter.n),
        expectedVersion: revState.version,
        playerId: 'p1',
        type: 'DISCOVER_ROOM',
        direction: openDir,
      });
      if (r.ok) {
        revState = r.state;
        continue;
      }
    }
    if (p.actionPoints >= 1 && !room.searched) {
      const s = resolveGameAction(revState, {
        actionId: nextActId(++counter.n),
        expectedVersion: revState.version,
        playerId: 'p1',
        type: 'SEARCH_ROOM',
      });
      if (s.ok) {
        revState = s.state;
        continue;
      }
    }
    const e = resolveGameAction(revState, {
      actionId: nextActId(++counter.n),
      expectedVersion: revState.version,
      playerId: 'p1',
      type: 'END_TURN',
    });
    assert.equal(e.ok, true);
    revState = e.state;
  }
  assert.equal(revState.phase, 'revelation', 'Solo expedition must reach Revelation');
  assert.ok(revState.scenario, 'Scenario must be populated in Revelation');
  assert.ok(revState.scenario!.countdown > 0);

  // Advance until countdown reaches ending cleanly
  let guardEnd = 0;
  while (revState.phase === 'revelation' && guardEnd < 25) {
    guardEnd++;
    revState = clearAnyModals(revState, 'p1', counter);
    if (revState.phase !== 'revelation') break;
    const e = resolveGameAction(revState, {
      actionId: nextActId(++counter.n),
      expectedVersion: revState.version,
      playerId: 'p1',
      type: 'END_TURN',
    });
    assert.equal(e.ok, true);
    revState = e.state;
  }
  assert.equal(revState.phase, 'ended', 'Revelation countdown must conclude with an Ending');
  assert.ok(revState.ending && revState.ending.title.length > 0);
  console.log(`PASS: Test D passed (Scenario "${revState.scenario?.id}" -> Ending "${revState.ending?.title}").`);

  console.log('=== TEST E: Save/Restore & Corrupted Save Handling ===');
  const validSave = validateSaveObject({
    schemaVersion: 1,
    savedAt: Date.now(),
    gameState: state,
  });
  assert.equal(validSave.ok, true);
  assert.equal(validateSaveObject(null).ok, false);
  assert.equal(validateSaveObject({ schemaVersion: 99, gameState: state }).ok, false);
  assert.equal(validateSaveObject({ schemaVersion: 1, gameState: { seed: 'X' } }).ok, false);
  console.log('PASS: Test E passed.');

  console.log('=== TEST F: Live 2-Client Authoritative WebSocket Multiplayer + Private Role Isolation ===');
  process.env.NODE_ENV = 'production';
  const { server, port } = await startServer(0);

  const openClient = () =>
    new Promise<{
      ws: WebSocket;
      nextMsg: (predicate?: (m: Record<string, unknown>) => boolean) => Promise<Record<string, unknown>>;
    }>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/mp`);
      const queue: Record<string, unknown>[] = [];
      const waiters: {
        pred?: (m: Record<string, unknown>) => boolean;
        res: (m: Record<string, unknown>) => void;
      }[] = [];

      ws.on('message', (data) => {
        const parsed = JSON.parse(String(data)) as Record<string, unknown>;
        const idx = waiters.findIndex((w) => !w.pred || w.pred(parsed));
        if (idx >= 0) {
          const [w] = waiters.splice(idx, 1);
          w.res(parsed);
        } else {
          queue.push(parsed);
        }
      });

      ws.on('open', () => {
        const nextMsg = (predicate?: (m: Record<string, unknown>) => boolean) => {
          const qIdx = queue.findIndex((m) => !predicate || predicate(m));
          if (qIdx >= 0) {
            return Promise.resolve(queue.splice(qIdx, 1)[0]);
          }
          return new Promise<Record<string, unknown>>((res, rej) => {
            const timer = setTimeout(() => rej(new Error('WS message timeout')), 4000);
            waiters.push({
              pred: predicate,
              res: (m) => {
                clearTimeout(timer);
                res(m);
              },
            });
          });
        };
        resolve({ ws, nextMsg });
      });
      ws.on('error', reject);
    });

  try {
    const c1 = await openClient();
    const c2 = await openClient();

    // 1. Client 1 creates lobby
    c1.ws.send(
      JSON.stringify({
        type: 'create_lobby',
        playerId: 'mp_host',
        displayName: 'Host Clara',
        characterId: 'archivist',
        seed: 'MP-LIVE-2026',
        expeditionSize: 'short',
      })
    );
    const createdMsg = await c1.nextMsg((m) => m.type === 'lobby_state');
    const createdSnap = createdMsg.snapshot as { lobbyCode: string; members: unknown[] };
    assert.match(createdSnap.lobbyCode, /^[A-Z0-9]{6}$/);

    // 2. Client 2 joins lobby
    c2.ws.send(
      JSON.stringify({
        type: 'join_lobby',
        playerId: 'mp_guest',
        lobbyCode: createdSnap.lobbyCode,
        displayName: 'Guest Thorne',
        characterId: 'medium',
      })
    );
    const [s1Join, s2Join] = await Promise.all([
      c1.nextMsg((m) => m.type === 'lobby_state'),
      c2.nextMsg((m) => m.type === 'lobby_state'),
    ]);
    assert.equal((s1Join.snapshot as { members: unknown[] }).members.length, 2);
    assert.equal((s2Join.snapshot as { members: unknown[] }).members.length, 2);

    // 3. Host starts expedition
    c1.ws.send(
      JSON.stringify({
        type: 'start_game',
        playerId: 'mp_host',
        lobbyCode: createdSnap.lobbyCode,
      })
    );
    const [s1Start, s2Start] = await Promise.all([
      c1.nextMsg((m) => m.type === 'lobby_state'),
      c2.nextMsg((m) => m.type === 'lobby_state'),
    ]);
    const st1 = (s1Start.snapshot as { state: GameState }).state;
    const st2 = (s2Start.snapshot as { state: GameState }).state;
    assert.equal(st1.version, 1);
    assert.equal(st2.version, 1);
    assert.equal(st1.seed, 'MP-LIVE-2026');

    // 4. Out-of-turn action by Client 2 MUST be rejected
    c2.ws.send(
      JSON.stringify({
        type: 'submit_action',
        playerId: 'mp_guest',
        lobbyCode: createdSnap.lobbyCode,
        action: {
          actionId: 'oot_1',
          expectedVersion: 1,
          playerId: 'mp_guest',
          type: 'SEARCH_ROOM',
        },
      })
    );
    const ootResp = await c2.nextMsg((m) => m.type === 'action_result');
    assert.equal(ootResp.ok, false, 'Out-of-turn action must be rejected by server');

    // 5. Valid action by Client 1 syncs to BOTH clients
    c1.ws.send(
      JSON.stringify({
        type: 'submit_action',
        playerId: 'mp_host',
        lobbyCode: createdSnap.lobbyCode,
        action: {
          actionId: 'mp_disc_1',
          expectedVersion: 1,
          playerId: 'mp_host',
          type: 'DISCOVER_ROOM',
          direction: 'W',
        },
      })
    );
    const [s1After, s2After] = await Promise.all([
      c1.nextMsg((m) => m.type === 'lobby_state'),
      c2.nextMsg((m) => m.type === 'lobby_state'),
    ]);
    const st1After = (s1After.snapshot as { state: GameState }).state;
    const st2After = (s2After.snapshot as { state: GameState }).state;
    assert.equal(st1After.version, 2);
    assert.equal(st2After.version, 2);
    assert.equal(st1After.roomOrder.length, st2After.roomOrder.length);

    // 6. Duplicate actionId rejected by server
    c1.ws.send(
      JSON.stringify({
        type: 'submit_action',
        playerId: 'mp_host',
        lobbyCode: createdSnap.lobbyCode,
        action: {
          actionId: 'mp_disc_1',
          expectedVersion: 2,
          playerId: 'mp_host',
          type: 'SEARCH_ROOM',
        },
      })
    );
    const dupServerResp = await c1.nextMsg((m) => m.type === 'action_result' && m.ok === false);
    assert.equal(dupServerResp.ok, false);

    // 7. Disconnect & Reconnect Recovery
    c2.ws.close();
    const afterDisconnect = await c1.nextMsg((m) => m.type === 'lobby_state');
    const discGuest = (afterDisconnect.snapshot as { members: { playerId: string; connected: boolean }[] }).members.find(
      (m) => m.playerId === 'mp_guest'
    );
    assert.equal(discGuest?.connected, false);

    const c2Re = await openClient();
    c2Re.ws.send(
      JSON.stringify({
        type: 'reconnect',
        playerId: 'mp_guest',
        lobbyCode: createdSnap.lobbyCode,
      })
    );
    const reconnSnap = await c2Re.nextMsg((m) => m.type === 'lobby_state');
    const reconnState = (reconnSnap.snapshot as { state: GameState }).state;
    assert.equal(reconnState.version, 2);
    assert.equal(
      reconnState.players.find((p) => p.id === 'mp_guest')?.connected,
      true
    );

    // 8. Private Role Isolation Check
    const secretState = structuredClone(st1After);
    secretState.phase = 'revelation';
    secretState.players[1].role = 'chosen';
    secretState.players[1].privateObjective = 'SECRET_BETRAYER_MANDATE';
    secretState.scenario = {
      id: 'the_house_has_chosen',
      title: 'The House Has Chosen',
      subtitle: 'Secret Mandate',
      publicObjective: 'Disable anchors',
      alteredRuleText: 'Doors lock',
      countdown: 10,
      maxCountdown: 10,
      progress: 0,
      goal: 3,
      betrayerPlayerId: 'mp_guest',
      betrayerRevealed: false,
      falseAccusations: 0,
    };
    const hostView = sanitizeStateForPlayer(secretState, 'mp_host');
    const betrayerView = sanitizeStateForPlayer(secretState, 'mp_guest');
    assert.equal(hostView.players[1].role, 'explorer', 'Host must NOT see guest betrayer role');
    assert.equal(hostView.players[1].privateObjective, undefined, 'Host must NOT see guest privateObjective');
    assert.equal(hostView.scenario?.betrayerPlayerId, null, 'Host must NOT see betrayerPlayerId');
    assert.equal(betrayerView.players[1].role, 'chosen', 'Betrayer MUST see own secret role');
    assert.equal(betrayerView.players[1].privateObjective, 'SECRET_BETRAYER_MANDATE');

    c1.ws.close();
    c2Re.ws.close();
    console.log('PASS: Test F (Live 2-client WebSocket multiplayer + isolation + reconnect) passed.');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  console.log('\nALL VERIFICATION TESTS (A through F) PASSED.');
}

runTests().catch((err) => {
  console.error('VERIFICATION FAILED:', err);
  process.exit(1);
});

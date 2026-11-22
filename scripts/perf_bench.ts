/**
 * Reproducible Performance Benchmark & Regression Suite for "The House That Remembers"
 * Measures:
 *  1. 3D Scene Graph Construction & GPU Resource Footprint (18-room mansion + 4 explorers + 5 ghosts)
 *  2. Procedural Sobel Normal Map Synthesis CPU Cost (5 x 512x512 maps)
 *  3. Deterministic Game Engine Throughput (200 actions + room discovery + ghost AI)
 *  4. Production Bundle Size Analysis (dist/assets/* raw + gzip)
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { performance } from 'node:perf_hooks';
import * as THREE from 'three';

// Minimal headless canvas shim so roomBuilder's nameplate/compass CanvasTextures run unmodified in Node
if (typeof globalThis.document === 'undefined') {
  const makeFakeCtx = (w: number, h: number) => ({
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    font: '12px serif',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    shadowColor: '',
    shadowBlur: 0,
    globalAlpha: 1,
    fillRect() {},
    strokeRect() {},
    clearRect() {},
    beginPath() {},
    closePath() {},
    moveTo() {},
    lineTo() {},
    arc() {},
    ellipse() {},
    quadraticCurveTo() {},
    bezierCurveTo() {},
    fill() {},
    stroke() {},
    fillText() {},
    save() {},
    restore() {},
    translate() {},
    rotate() {},
    scale() {},
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
    getImageData: () => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    createImageData: (cw: number, ch: number) => ({
      data: new Uint8ClampedArray(cw * ch * 4),
      width: cw,
      height: ch,
    }),
    putImageData() {},
  });

  (globalThis as unknown as Record<string, unknown>).document = {
    createElement: (tag: string) => {
      if (tag === 'canvas') {
        const c = {
          width: 256,
          height: 256,
          getContext() {
            return makeFakeCtx(this.width, this.height);
          },
        };
        return c;
      }
      return {};
    },
  };
}

import { createNewGame, resolveGameAction } from '../src/engine/actionResolver.ts';
import { CHARACTERS } from '../src/engine/characters.ts';
import { getEventById } from '../src/engine/events.ts';
import { ROOM_TEMPLATES } from '../src/engine/rooms.ts';
import type { GhostArchetypeId, PlacedRoom } from '../src/engine/types.ts';
import {
  buildExplorerFigurine,
  buildGhostMesh,
  buildRoomMesh,
  disposeObjectTree,
} from '../src/three/roomBuilder.ts';
import type { ProceduralTextures } from '../src/three/textures.ts';
import { createProceduralTextures } from '../src/three/textures.ts';

function makeStubTextures(): ProceduralTextures {
  const real = createProceduralTextures();
  return real;
}

function build18RoomShowcase(): PlacedRoom[] {
  const archetypes = [
    'grand_entrance_hall',
    'grand_staircase',
    'pendulum_vestibule',
    'grand_library',
    'banquet_dining_hall',
    'music_salon',
    'portrait_gallery',
    'candlelit_chapel',
    'abandoned_nursery',
    'master_bedroom',
    'glass_conservatory',
    'rooftop_observatory',
    'clockwork_parlor',
    'mirror_corridor',
    'wine_cellar',
    'boiler_room',
    'sealed_laboratory',
    'locked_vault',
  ];

  const rooms: PlacedRoom[] = [];
  archetypes.forEach((tplId, idx) => {
    const tpl = ROOM_TEMPLATES.find((t) => t.id === tplId) ?? ROOM_TEMPLATES[idx % ROOM_TEMPLATES.length];
    const floor = idx < 10 ? 0 : idx < 14 ? 1 : -1;
    rooms.push({
      id: `bench_room_${idx}`,
      templateId: tpl.id,
      name: tpl.name,
      floor: floor as -1 | 0 | 1,
      x: (idx % 5) - 2,
      z: Math.floor(idx / 5) - 1,
      rotation: 0,
      doors: ['N', 'S', 'E'],
      connectedTo: idx > 0 ? { S: `bench_room_${idx - 1}` } : {},
      stairLinks: tpl.geometry === 'staircase' ? ['bench_room_10'] : [],
      discoveredByPlayerId: 'p1',
      discoveredOnTurn: idx + 1,
      searched: idx % 3 === 0,
      inspectedIds: [],
      solvedPuzzleIds: [],
      alteredCount: 0,
      revisitCount: 0,
      darkened: false,
      hasAnchor: idx === 5,
      anchorDisabled: false,
    });
  });
  return rooms;
}

function measureSceneGraph(): void {
  const textures = makeStubTextures();
  const rooms = build18RoomShowcase();
  const root = new THREE.Group();

  const t0 = performance.now();
  const builtRooms = rooms.map((room) => {
    const ref = buildRoomMesh(room, textures, false);
    root.add(ref.group);
    return ref;
  });
  const figurines = CHARACTERS.slice(0, 4).map((ch, idx) => {
    const fig = buildExplorerFigurine(ch, textures, idx === 0);
    root.add(fig);
    return fig;
  });
  const ghostTypes: GhostArchetypeId[] = [
    'watcher',
    'mourner',
    'borrower',
    'lantern_wisp',
    'wall_choir',
  ];
  const ghosts = ghostTypes.map((arch, i) => {
    const g = buildGhostMesh(
      {
        id: `g_${i}`,
        archetype: arch,
        name: arch,
        roomId: 'bench_room_0',
        state: 'observing',
        disposition: 'curious',
        observedCount: 0,
        soothed: false,
        lastActionNote: '',
      },
      textures
    );
    root.add(g);
    return g;
  });
  const buildMs = performance.now() - t0;

  let drawObjects = 0;
  let visibleDrawObjects = 0;
  let visibleTransparentDrawObjects = 0;
  let instancedMeshes = 0;
  let instancedInstances = 0;
  let spriteCount = 0;
  let pointLights = 0;
  let totalTriangles = 0;
  let hitProxyCount = 0;
  const uniqueGeos = new Set<THREE.BufferGeometry>();
  const uniqueMats = new Set<THREE.Material>();
  const uniqueOwnedTextures = new Set<THREE.Texture>();

  root.traverse((obj) => {
    if ((obj as THREE.PointLight).isPointLight) {
      pointLights += 1;
    }
    const sprite = obj as THREE.Sprite;
    if (sprite.isSprite) {
      spriteCount += 1;
      drawObjects += 1;
      if (sprite.visible) {
        visibleDrawObjects += 1;
        visibleTransparentDrawObjects += 1;
      }
      if (sprite.material) uniqueMats.add(sprite.material);
      return;
    }
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh) {
      const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      const isHiddenMat = mat && mat.visible === false;
      if (isHiddenMat) {
        hitProxyCount += 1;
        if (mesh.geometry) uniqueGeos.add(mesh.geometry);
        if (mat) uniqueMats.add(mat);
        return;
      }

      drawObjects += 1;
      // Check ancestor visibility too
      let ancestorVisible = true;
      let cur: THREE.Object3D | null = mesh;
      while (cur) {
        if (!cur.visible) {
          ancestorVisible = false;
          break;
        }
        cur = cur.parent;
      }

      if (ancestorVisible) {
        visibleDrawObjects += 1;
        if (mat && mat.transparent) {
          visibleTransparentDrawObjects += 1;
        }
      }

      if (mesh.geometry) {
        uniqueGeos.add(mesh.geometry);
        const index = mesh.geometry.getIndex();
        const pos = mesh.geometry.getAttribute('position');
        const trisPerInstance = index ? index.count / 3 : pos ? pos.count / 3 : 0;
        const inst = mesh as THREE.InstancedMesh;
        if (inst.isInstancedMesh) {
          instancedMeshes += 1;
          instancedInstances += inst.count;
          totalTriangles += trisPerInstance * inst.count;
        } else {
          totalTriangles += trisPerInstance;
        }
      }

      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        if (!m) continue;
        uniqueMats.add(m);
        const std = m as THREE.MeshStandardMaterial;
        if (std.map && std.map.userData?.ownedTexture) {
          uniqueOwnedTextures.add(std.map);
        }
      }
    }
  });

  // Measure rebuild of 1 room (simulates searching a room or opening a door)
  const rebuildT0 = performance.now();
  const rebuilt = buildRoomMesh(rooms[3], textures, false); // Grand Library
  const rebuildLibraryMs = performance.now() - rebuildT0;
  disposeObjectTree(rebuilt.group);

  // Dispose showcase cleanly
  const disposeT0 = performance.now();
  builtRooms.forEach((r) => disposeObjectTree(r.group));
  figurines.forEach((f) => disposeObjectTree(f));
  ghosts.forEach((g) => disposeObjectTree(g));
  const disposeMs = performance.now() - disposeT0;

  console.log('\n=== 1. 3D SCENE GRAPH BENCHMARK (18 Rooms + 4 Explorers + 5 Ghosts) ===');
  console.log(`Build Time (18 rooms + actors):   ${buildMs.toFixed(2)} ms`);
  console.log(`Rebuild Time (Grand Library):     ${rebuildLibraryMs.toFixed(2)} ms`);
  console.log(`Dispose Time (full mansion):      ${disposeMs.toFixed(2)} ms`);
  console.log(`Rendered Draw Objects (total):    ${drawObjects}`);
  console.log(`Rendered Draw Objects (visible):  ${visibleDrawObjects}`);
  console.log(`Visible Transparent Draw Objects: ${visibleTransparentDrawObjects}`);
  console.log(`InstancedMeshes (instances):      ${instancedMeshes} (${instancedInstances} instances)`);
  console.log(`Sprites:                          ${spriteCount}`);
  console.log(`Invisible Raycast Proxies:        ${hitProxyCount}`);
  console.log(`Unique BufferGeometries:          ${uniqueGeos.size}`);
  console.log(`Unique Materials:                 ${uniqueMats.size}`);
  console.log(`Unique Owned CanvasTextures:      ${uniqueOwnedTextures.size}`);
  console.log(`Attached Room PointLights:        ${pointLights}`);
  console.log(`Total Triangles (visual parity):  ${Math.round(totalTriangles).toLocaleString()}`);
}

function measureProceduralTextures(): void {
  // Warm up JIT once, then measure 3 runs of createProceduralTextures()
  const warmup = createProceduralTextures();
  warmup.dispose();

  const runs: number[] = [];
  for (let i = 0; i < 3; i++) {
    const t0 = performance.now();
    const tex = createProceduralTextures();
    runs.push(performance.now() - t0);
    tex.dispose();
  }
  const avg = runs.reduce((a, b) => a + b, 0) / runs.length;
  const min = Math.min(...runs);
  console.log('\n=== 2. PROCEDURAL TEXTURE & SOBEL NORMAL MAP SYNTHESIS (Node CPU) ===');
  console.log(`createProceduralTextures() avg:   ${avg.toFixed(2)} ms (min: ${min.toFixed(2)} ms across 3 runs)`);
}

function measureEngineSimulation(): void {
  const t0 = performance.now();
  let state = createNewGame({
    seed: 'PERF-BENCH-1889',
    expeditionSize: 'extended',
    players: [
      { id: 'p1', displayName: 'Evelyn', characterId: 'archivist' },
      { id: 'p2', displayName: 'Arthur', characterId: 'locksmith' },
    ],
  });

  let actionsExecuted = 0;
  for (let step = 0; step < 220 && state.phase !== 'ended'; step++) {
    const active = state.players[state.currentPlayerIndex];
    const room = state.rooms[active.roomId];
    let action: Parameters<typeof resolveGameAction>[1];

    if (state.activeEvent && !state.activeEvent.resolved) {
      const ev = getEventById(state.activeEvent.eventId);
      const choiceId = ev?.choices[0]?.id ?? 'a';
      action = {
        actionId: `b_${step}`,
        expectedVersion: state.version,
        playerId: active.id,
        type: 'RESOLVE_EVENT_CHOICE',
        choiceId,
      };
      const res = resolveGameAction(state, action);
      if (res.ok) {
        state = res.state;
        actionsExecuted++;
        continue;
      }
    }
    if (state.activeEvent?.resolved) {
      const res = resolveGameAction(state, {
        actionId: `b_dismiss_${step}`,
        expectedVersion: state.version,
        playerId: active.id,
        type: 'DISMISS_EVENT',
      });
      if (res.ok) {
        state = res.state;
        actionsExecuted++;
        continue;
      }
    }

    if (active.actionPoints > 0) {
      const unexplored = room.doors.find((d) => !room.connectedTo[d]);
      if (unexplored && state.roomOrder.length < 22) {
        const res = resolveGameAction(state, {
          actionId: `b_disc_${step}`,
          expectedVersion: state.version,
          playerId: active.id,
          type: 'DISCOVER_ROOM',
          direction: unexplored,
        });
        if (res.ok) {
          state = res.state;
          actionsExecuted++;
          continue;
        }
      }
      if (!room.searched) {
        const res = resolveGameAction(state, {
          actionId: `b_srch_${step}`,
          expectedVersion: state.version,
          playerId: active.id,
          type: 'SEARCH_ROOM',
        });
        if (res.ok) {
          state = res.state;
          actionsExecuted++;
          continue;
        }
      }
      const connectedIds = Object.values(room.connectedTo).filter((id): id is string => Boolean(id));
      if (connectedIds.length > 0) {
        const res = resolveGameAction(state, {
          actionId: `b_mv_${step}`,
          expectedVersion: state.version,
          playerId: active.id,
          type: 'MOVE_ROOM',
          targetRoomId: connectedIds[step % connectedIds.length],
        });
        if (res.ok) {
          state = res.state;
          actionsExecuted++;
          continue;
        }
      }
    }

    const endRes = resolveGameAction(state, {
      actionId: `b_end_${step}`,
      expectedVersion: state.version,
      playerId: active.id,
      type: 'END_TURN',
    });
    if (endRes.ok) {
      state = endRes.state;
      actionsExecuted++;
    } else {
      break;
    }
  }
  const totalMs = performance.now() - t0;
  console.log('\n=== 3. ENGINE SIMULATION BENCHMARK ===');
  console.log(`Actions Resolved:                 ${actionsExecuted} (rooms discovered: ${state.roomOrder.length})`);
  console.log(`Total Simulation Time:            ${totalMs.toFixed(2)} ms (${(totalMs / Math.max(1, actionsExecuted)).toFixed(3)} ms/action)`);
}

function measureBundleSizes(): void {
  const assetsDir = path.resolve(process.cwd(), 'dist', 'assets');
  if (!fs.existsSync(assetsDir)) {
    console.log('\n=== 4. BUNDLE SIZES ===\n(dist/assets not built yet)');
    return;
  }
  const files = fs
    .readdirSync(assetsDir)
    .filter((f) => fs.statSync(path.join(assetsDir, f)).isFile())
    .sort();
  const indexHtmlPath = path.resolve(process.cwd(), 'dist', 'index.html');
  const eagerFiles = new Set<string>();
  if (fs.existsSync(indexHtmlPath)) {
    const html = fs.readFileSync(indexHtmlPath, 'utf8');
    for (const match of html.matchAll(/\/assets\/([^"'\s>]+\.js)/g)) {
      eagerFiles.add(match[1]);
    }
  }
  let totalJsRaw = 0;
  let totalJsGzip = 0;
  let entryJsRaw = 0;
  let entryJsGzip = 0;
  let eagerJsRaw = 0;
  let eagerJsGzip = 0;
  console.log('\n=== 4. PRODUCTION BUNDLE ASSETS (dist/assets) ===');
  for (const f of files) {
    const buf = fs.readFileSync(path.join(assetsDir, f));
    const gz = zlib.gzipSync(buf, { level: 9 }).length;
    const rawKb = (buf.length / 1024).toFixed(2);
    const gzKb = (gz / 1024).toFixed(2);
    const tag = f.endsWith('.js') ? (eagerFiles.has(f) ? ' [EAGER]' : ' [LAZY] ') : '        ';
    console.log(`  ${f.padEnd(42)}${tag} raw: ${rawKb.padStart(8)} kB | gzip: ${gzKb.padStart(7)} kB`);
    if (f.endsWith('.js')) {
      totalJsRaw += buf.length;
      totalJsGzip += gz;
      if (eagerFiles.has(f)) {
        eagerJsRaw += buf.length;
        eagerJsGzip += gz;
      }
      if (f.startsWith('index-')) {
        entryJsRaw = buf.length;
        entryJsGzip = gz;
      }
    }
  }
  console.log(`  TOTAL JS:   raw ${(totalJsRaw / 1024).toFixed(2)} kB | gzip ${(totalJsGzip / 1024).toFixed(2)} kB`);
  console.log(`  EAGER JS:   raw ${(eagerJsRaw / 1024).toFixed(2)} kB | gzip ${(eagerJsGzip / 1024).toFixed(2)} kB`);
  console.log(`  ENTRY JS:   raw ${(entryJsRaw / 1024).toFixed(2)} kB | gzip ${(entryJsGzip / 1024).toFixed(2)} kB`);
}

measureSceneGraph();
measureProceduralTextures();
measureEngineSimulation();
measureBundleSizes();

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { CharacterDef, Direction, GhostInstance, PlacedRoom } from '../engine/types';
import { getRoomTemplate } from '../engine/rooms';
import type { ProceduralTextures } from './textures';

export const ROOM_SIZE = 9.0;
export const ROOM_HEIGHT = 4.35;
export const FLOOR_SPACING = 5.5;

export interface WallFadeEntry {
  roomId: string;
  direction: Direction;
  wallKey: string;
  upperGroup: THREE.Group;
  materials: THREE.Material[];
  rayTarget: THREE.Mesh;
  outwardNormal: THREE.Vector3;
  worldCenter: THREE.Vector3;
  currentOpacity: number;
  baseOpacity: number;
  isOpaqueDefault: boolean;
  isTransparentActive: boolean;
  settled: boolean;
}

export interface RoomLightSpec {
  color: number;
  baseIntensity: number;
}

export interface BuiltRoomRefs {
  roomId: string;
  floor: number;
  worldPos: THREE.Vector3;
  group: THREE.Group;
  walls: Record<Direction, WallFadeEntry>;
  doorPivots: Partial<Record<Direction, THREE.Group>>;
  doorBaseAngles: Partial<Record<Direction, number>>;
  unexploredBeacons: Partial<Record<Direction, THREE.Group>>;
  unexploredBeaconCrests: THREE.Object3D[];
  hoverBorderMesh: THREE.Mesh;
  hoverBorderMat: THREE.MeshBasicMaterial;
  roomLight: THREE.PointLight | null;
  lightSpec: RoomLightSpec | null;
  baseLightIntensity: number;
  portraitEyes: THREE.Group[];
  animatedProps: {
    mesh: THREE.Object3D;
    kind:
      | 'pendulum'
      | 'pendulum_giant'
      | 'candle'
      | 'book'
      | 'astrolabe'
      | 'water'
      | 'gear'
      | 'beacon'
      | 'halo'
      | 'curtain'
      | 'rocker';
  }[];
  hitProxies: THREE.Object3D[];
}

export function roomWorldPosition(room: PlacedRoom): THREE.Vector3 {
  return new THREE.Vector3(room.x * ROOM_SIZE, room.floor * FLOOR_SPACING, room.z * ROOM_SIZE);
}

// ============================================================================
// SHARED MODULE-LEVEL GEOMETRY POOL (Zero duplicate GPU VBOs across rooms!)
// ============================================================================
const _geoCache = new Map<string, THREE.BufferGeometry>();

function markSharedGeo<T extends THREE.BufferGeometry>(geo: T): T {
  geo.userData.shared = true;
  return geo;
}

function getBoxGeo(w: number, h: number, d: number): THREE.BoxGeometry {
  const k = `box:${w.toFixed(4)}:${h.toFixed(4)}:${d.toFixed(4)}`;
  let g = _geoCache.get(k) as THREE.BoxGeometry | undefined;
  if (!g) {
    g = markSharedGeo(new THREE.BoxGeometry(w, h, d));
    _geoCache.set(k, g);
  }
  return g;
}

function getUnitBoxGeo(): THREE.BoxGeometry {
  return getBoxGeo(1, 1, 1);
}

function getPlaneGeo(w: number, h: number): THREE.PlaneGeometry {
  const k = `plane:${w.toFixed(4)}:${h.toFixed(4)}`;
  let g = _geoCache.get(k) as THREE.PlaneGeometry | undefined;
  if (!g) {
    g = markSharedGeo(new THREE.PlaneGeometry(w, h));
    _geoCache.set(k, g);
  }
  return g;
}

function getCylGeo(
  rt: number,
  rb: number,
  h: number,
  radialSegments = 12,
  heightSegments = 1,
  openEnded = false,
  thetaStart = 0,
  thetaLength = Math.PI * 2
): THREE.CylinderGeometry {
  const k = `cyl:${rt.toFixed(4)}:${rb.toFixed(4)}:${h.toFixed(4)}:${radialSegments}:${heightSegments}:${openEnded ? 1 : 0}:${thetaStart.toFixed(3)}:${thetaLength.toFixed(3)}`;
  let g = _geoCache.get(k) as THREE.CylinderGeometry | undefined;
  if (!g) {
    g = markSharedGeo(
      new THREE.CylinderGeometry(
        rt,
        rb,
        h,
        radialSegments,
        heightSegments,
        openEnded,
        thetaStart,
        thetaLength
      )
    );
    _geoCache.set(k, g);
  }
  return g;
}

function getSphereGeo(
  r: number,
  ws = 12,
  hs = 10,
  phiStart = 0,
  phiLength = Math.PI * 2,
  thetaStart = 0,
  thetaLength = Math.PI
): THREE.SphereGeometry {
  const k = `sph:${r.toFixed(4)}:${ws}:${hs}:${phiStart.toFixed(3)}:${phiLength.toFixed(3)}:${thetaStart.toFixed(3)}:${thetaLength.toFixed(3)}`;
  let g = _geoCache.get(k) as THREE.SphereGeometry | undefined;
  if (!g) {
    g = markSharedGeo(
      new THREE.SphereGeometry(r, ws, hs, phiStart, phiLength, thetaStart, thetaLength)
    );
    _geoCache.set(k, g);
  }
  return g;
}

function getTorusGeo(
  r: number,
  tube: number,
  rs = 8,
  ts = 20,
  arc = Math.PI * 2
): THREE.TorusGeometry {
  const k = `tor:${r.toFixed(4)}:${tube.toFixed(4)}:${rs}:${ts}:${arc.toFixed(3)}`;
  let g = _geoCache.get(k) as THREE.TorusGeometry | undefined;
  if (!g) {
    g = markSharedGeo(new THREE.TorusGeometry(r, tube, rs, ts, arc));
    _geoCache.set(k, g);
  }
  return g;
}

function getConeGeo(r: number, h: number, seg = 8, openEnded = false): THREE.ConeGeometry {
  const k = `cone:${r.toFixed(4)}:${h.toFixed(4)}:${seg}:${openEnded ? 1 : 0}`;
  let g = _geoCache.get(k) as THREE.ConeGeometry | undefined;
  if (!g) {
    g = markSharedGeo(new THREE.ConeGeometry(r, h, seg, 1, openEnded));
    _geoCache.set(k, g);
  }
  return g;
}

function getCircleGeo(
  r: number,
  seg = 24,
  thetaStart = 0,
  thetaLength = Math.PI * 2
): THREE.CircleGeometry {
  const k = `cir:${r.toFixed(4)}:${seg}:${thetaStart.toFixed(3)}:${thetaLength.toFixed(3)}`;
  let g = _geoCache.get(k) as THREE.CircleGeometry | undefined;
  if (!g) {
    g = markSharedGeo(new THREE.CircleGeometry(r, seg, thetaStart, thetaLength));
    _geoCache.set(k, g);
  }
  return g;
}

function getOctaGeo(r: number, detail = 0): THREE.OctahedronGeometry {
  const k = `oct:${r.toFixed(4)}:${detail}`;
  let g = _geoCache.get(k) as THREE.OctahedronGeometry | undefined;
  if (!g) {
    g = markSharedGeo(new THREE.OctahedronGeometry(r, detail));
    _geoCache.set(k, g);
  }
  return g;
}

function getRingGeo(ri: number, ro: number, seg = 32): THREE.RingGeometry {
  const k = `ring:${ri.toFixed(4)}:${ro.toFixed(4)}:${seg}`;
  let g = _geoCache.get(k) as THREE.RingGeometry | undefined;
  if (!g) {
    g = markSharedGeo(new THREE.RingGeometry(ri, ro, seg));
    _geoCache.set(k, g);
  }
  return g;
}

let _roomFloorGeo: THREE.PlaneGeometry | null = null;
function getRoomFloorGeo(): THREE.PlaneGeometry {
  if (!_roomFloorGeo) {
    _roomFloorGeo = markSharedGeo(new THREE.PlaneGeometry(ROOM_SIZE - 0.14, ROOM_SIZE - 0.14));
    _roomFloorGeo.setAttribute('uv2', _roomFloorGeo.attributes.uv);
  }
  return _roomFloorGeo;
}

let _hoverBorderGeo: THREE.BufferGeometry | null = null;
function getHoverBorderGeo(): THREE.BufferGeometry {
  if (!_hoverBorderGeo) {
    const borderW = ROOM_SIZE - 0.18;
    const borderT = 0.12;
    const strips: [number, number, number, number][] = [
      [0, borderW / 2, borderW, borderT],
      [0, -borderW / 2, borderW, borderT],
      [borderW / 2, 0, borderT, borderW],
      [-borderW / 2, 0, borderT, borderW],
    ];
    const parts = strips.map(([bx, bz, bw, bd]) => {
      const g = new THREE.PlaneGeometry(bw, bd);
      g.rotateX(-Math.PI / 2);
      g.translate(bx, 0.036, bz);
      return g;
    });
    _hoverBorderGeo = markSharedGeo(mergeGeometries(parts, false));
    parts.forEach((p) => p.dispose());
  }
  return _hoverBorderGeo;
}

// Reusable scratch objects for InstancedMesh matrix assembly (zero GC)
const _batchMat4 = new THREE.Matrix4();
const _batchPos = new THREE.Vector3();
const _batchQuat = new THREE.Quaternion();
const _batchEuler = new THREE.Euler();
const _batchScale = new THREE.Vector3();
const _batchColor = new THREE.Color();

interface BoxInstanceSpec {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  rx?: number;
  ry?: number;
  rz?: number;
  color?: number;
}

function makeBoxBatch(
  specs: BoxInstanceSpec[],
  material: THREE.Material,
  castShadow = false,
  receiveShadow = false
): THREE.InstancedMesh {
  const inst = new THREE.InstancedMesh(getUnitBoxGeo(), material, specs.length);
  inst.castShadow = castShadow;
  inst.receiveShadow = receiveShadow;
  for (let i = 0; i < specs.length; i++) {
    const s = specs[i];
    _batchPos.set(s.x, s.y, s.z);
    if (s.rx || s.ry || s.rz) {
      _batchEuler.set(s.rx ?? 0, s.ry ?? 0, s.rz ?? 0);
      _batchQuat.setFromEuler(_batchEuler);
    } else {
      _batchQuat.identity();
    }
    _batchScale.set(s.sx, s.sy, s.sz);
    _batchMat4.compose(_batchPos, _batchQuat, _batchScale);
    inst.setMatrixAt(i, _batchMat4);
    if (s.color !== undefined) {
      _batchColor.setHex(s.color);
      inst.setColorAt(i, _batchColor);
    }
  }
  inst.instanceMatrix.needsUpdate = true;
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  inst.computeBoundingSphere();
  return inst;
}

interface GeoInstanceSpec {
  x: number;
  y: number;
  z: number;
  rx?: number;
  ry?: number;
  rz?: number;
  sx?: number;
  sy?: number;
  sz?: number;
}

function makeGeoBatch(
  geo: THREE.BufferGeometry,
  specs: GeoInstanceSpec[],
  material: THREE.Material,
  castShadow = false,
  receiveShadow = false
): THREE.InstancedMesh {
  const inst = new THREE.InstancedMesh(geo, material, specs.length);
  inst.castShadow = castShadow;
  inst.receiveShadow = receiveShadow;
  for (let i = 0; i < specs.length; i++) {
    const s = specs[i];
    _batchPos.set(s.x, s.y, s.z);
    if (s.rx || s.ry || s.rz) {
      _batchEuler.set(s.rx ?? 0, s.ry ?? 0, s.rz ?? 0);
      _batchQuat.setFromEuler(_batchEuler);
    } else {
      _batchQuat.identity();
    }
    _batchScale.set(s.sx ?? 1, s.sy ?? 1, s.sz ?? 1);
    _batchMat4.compose(_batchPos, _batchQuat, _batchScale);
    inst.setMatrixAt(i, _batchMat4);
  }
  inst.instanceMatrix.needsUpdate = true;
  inst.computeBoundingSphere();
  return inst;
}

// Shared reusable sculpted geometries
let _candleStemGeo: THREE.LatheGeometry | null = null;
let _balusterGeo: THREE.LatheGeometry | null = null;
let _pawnBaseGeo: THREE.LatheGeometry | null = null;
let _coatSkirtGeo: THREE.LatheGeometry | null = null;
let _pianoBodyGeo: THREE.ExtrudeGeometry | null = null;
let _gearGeo: THREE.ExtrudeGeometry | null = null;
let _mournerGownGeo: THREE.LatheGeometry | null = null;

function getCandleStemGeo(): THREE.LatheGeometry {
  if (!_candleStemGeo) {
    const pts = [
      new THREE.Vector2(0.0, 0.0),
      new THREE.Vector2(0.14, 0.0),
      new THREE.Vector2(0.13, 0.04),
      new THREE.Vector2(0.06, 0.08),
      new THREE.Vector2(0.032, 0.16),
      new THREE.Vector2(0.052, 0.24),
      new THREE.Vector2(0.028, 0.3),
      new THREE.Vector2(0.085, 0.35),
      new THREE.Vector2(0.045, 0.37),
    ];
    _candleStemGeo = markSharedGeo(new THREE.LatheGeometry(pts, 16));
  }
  return _candleStemGeo;
}

function getBalusterGeo(): THREE.LatheGeometry {
  if (!_balusterGeo) {
    const pts = [
      new THREE.Vector2(0.055, 0.0),
      new THREE.Vector2(0.055, 0.08),
      new THREE.Vector2(0.032, 0.2),
      new THREE.Vector2(0.06, 0.42),
      new THREE.Vector2(0.028, 0.68),
      new THREE.Vector2(0.048, 0.88),
      new THREE.Vector2(0.048, 0.96),
    ];
    _balusterGeo = markSharedGeo(new THREE.LatheGeometry(pts, 12));
  }
  return _balusterGeo;
}

function getPawnBaseGeo(): THREE.LatheGeometry {
  if (!_pawnBaseGeo) {
    const pts = [
      new THREE.Vector2(0.0, 0.0),
      new THREE.Vector2(0.49, 0.0),
      new THREE.Vector2(0.49, 0.055),
      new THREE.Vector2(0.44, 0.105),
      new THREE.Vector2(0.36, 0.14),
      new THREE.Vector2(0.39, 0.18),
      new THREE.Vector2(0.0, 0.18),
    ];
    _pawnBaseGeo = markSharedGeo(new THREE.LatheGeometry(pts, 24));
  }
  return _pawnBaseGeo;
}

function getCoatSkirtGeo(): THREE.LatheGeometry {
  if (!_coatSkirtGeo) {
    const pts = [
      new THREE.Vector2(0.0, 0.18),
      new THREE.Vector2(0.33, 0.2),
      new THREE.Vector2(0.27, 0.56),
      new THREE.Vector2(0.18, 0.92),
      new THREE.Vector2(0.24, 1.18),
      new THREE.Vector2(0.2, 1.32),
      new THREE.Vector2(0.09, 1.37),
      new THREE.Vector2(0.0, 1.37),
    ];
    _coatSkirtGeo = markSharedGeo(new THREE.LatheGeometry(pts, 20));
  }
  return _coatSkirtGeo;
}

function getPianoBodyGeo(): THREE.ExtrudeGeometry {
  if (!_pianoBodyGeo) {
    const s = new THREE.Shape();
    s.moveTo(-0.88, -1.05);
    s.lineTo(0.88, -1.05);
    s.lineTo(0.88, -0.35);
    s.bezierCurveTo(0.88, 0.15, 0.35, 0.25, 0.32, 0.72);
    s.bezierCurveTo(0.3, 1.12, -0.35, 1.22, -0.78, 0.96);
    s.bezierCurveTo(-0.92, 0.85, -0.88, 0.4, -0.88, -1.05);
    _pianoBodyGeo = markSharedGeo(
      new THREE.ExtrudeGeometry(s, {
        depth: 0.34,
        bevelEnabled: true,
        bevelThickness: 0.03,
        bevelSize: 0.025,
        bevelSegments: 3,
      })
    );
    _pianoBodyGeo.rotateX(-Math.PI / 2);
  }
  return _pianoBodyGeo;
}

function getGearGeo(): THREE.ExtrudeGeometry {
  if (!_gearGeo) {
    const s = new THREE.Shape();
    const teeth = 12;
    const rIn = 0.52;
    const rOut = 0.66;
    for (let i = 0; i < teeth; i++) {
      const a0 = (i / teeth) * Math.PI * 2;
      const a1 = ((i + 0.3) / teeth) * Math.PI * 2;
      const a2 = ((i + 0.5) / teeth) * Math.PI * 2;
      const a3 = ((i + 0.8) / teeth) * Math.PI * 2;
      if (i === 0) s.moveTo(Math.cos(a0) * rIn, Math.sin(a0) * rIn);
      else s.lineTo(Math.cos(a0) * rIn, Math.sin(a0) * rIn);
      s.lineTo(Math.cos(a1) * rOut, Math.sin(a1) * rOut);
      s.lineTo(Math.cos(a2) * rOut, Math.sin(a2) * rOut);
      s.lineTo(Math.cos(a3) * rIn, Math.sin(a3) * rIn);
    }
    s.closePath();
    const hole = new THREE.Path();
    hole.absarc(0, 0, 0.18, 0, Math.PI * 2, true);
    s.holes.push(hole);
    _gearGeo = markSharedGeo(
      new THREE.ExtrudeGeometry(s, {
        depth: 0.08,
        bevelEnabled: true,
        bevelThickness: 0.015,
        bevelSize: 0.012,
        bevelSegments: 2,
      })
    );
  }
  return _gearGeo;
}

function getMournerGownGeo(): THREE.LatheGeometry {
  if (!_mournerGownGeo) {
    const cloakPts = [
      new THREE.Vector2(0.04, 0.28),
      new THREE.Vector2(0.42, 0.52),
      new THREE.Vector2(0.28, 1.1),
      new THREE.Vector2(0.17, 1.52),
      new THREE.Vector2(0.0, 1.62),
    ];
    _mournerGownGeo = markSharedGeo(new THREE.LatheGeometry(cloakPts, 18));
  }
  return _mournerGownGeo;
}

// ============================================================================
// SHARED MATERIAL CACHE (Per ProceduralTextures instance via WeakMap)
// ============================================================================
function markSharedMat<T extends THREE.Material>(mat: T): T {
  mat.userData.shared = true;
  return mat;
}

const _invisibleRayMat = markSharedMat(new THREE.MeshBasicMaterial({ visible: false }));
const _bookInstancedMat = markSharedMat(
  new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.78 })
);
const _candleWaxMat = markSharedMat(
  new THREE.MeshStandardMaterial({ color: 0xf0e4ca, roughness: 0.48 })
);
const _candleFlameMat = markSharedMat(new THREE.MeshBasicMaterial({ color: 0xffd782 }));
const _paperMat = markSharedMat(
  new THREE.MeshStandardMaterial({ color: 0xebdcb8, roughness: 0.88 })
);
const _plateMat = markSharedMat(
  new THREE.MeshStandardMaterial({ color: 0xeae0cc, roughness: 0.25, metalness: 0.08 })
);
const _gobletGlassMat = markSharedMat(
  new THREE.MeshPhysicalMaterial({
    color: 0xdbe6e8,
    roughness: 0.08,
    metalness: 0.1,
    transparent: true,
    opacity: 0.65,
  })
);
const _pianoLacquerMat = markSharedMat(
  new THREE.MeshPhysicalMaterial({
    color: 0x161215,
    roughness: 0.16,
    metalness: 0.08,
    clearcoat: 1.0,
    clearcoatRoughness: 0.14,
  })
);
const _pianoIvoryMat = markSharedMat(
  new THREE.MeshStandardMaterial({ color: 0xf2e9d6, roughness: 0.3 })
);
const _fireplaceMirrorMat = markSharedMat(
  new THREE.MeshPhysicalMaterial({ color: 0xc8d2d0, metalness: 0.92, roughness: 0.14 })
);
const _fireboxMat = markSharedMat(
  new THREE.MeshStandardMaterial({ color: 0x0d0908, roughness: 0.96 })
);
const _embersMat = markSharedMat(
  new THREE.MeshStandardMaterial({
    color: 0x38150c,
    emissive: 0xe35f1e,
    emissiveIntensity: 1.75,
    roughness: 0.82,
  })
);
const _fireFlameMat = markSharedMat(new THREE.MeshBasicMaterial({ color: 0xffac42 }));
const _pupilMat = markSharedMat(new THREE.MeshBasicMaterial({ color: 0x0b0807 }));
const _chandelierGlobeMat = markSharedMat(
  new THREE.MeshStandardMaterial({
    color: 0xfff0c8,
    emissive: 0xffb854,
    emissiveIntensity: 1.5,
    roughness: 0.2,
  })
);
const _palmPotMat = markSharedMat(
  new THREE.MeshStandardMaterial({ color: 0x73422c, roughness: 0.86 })
);
const _palmLeafMat = markSharedMat(
  new THREE.MeshStandardMaterial({ color: 0x265436, roughness: 0.62, side: THREE.DoubleSide })
);
const _inspectLensMat = markSharedMat(
  new THREE.MeshPhysicalMaterial({
    color: 0x9ce3d2,
    emissive: 0x4ca692,
    emissiveIntensity: 0.75,
    roughness: 0.1,
    transparent: true,
    opacity: 0.72,
  })
);
const _ironMat = markSharedMat(
  new THREE.MeshStandardMaterial({ color: 0x2f333a, metalness: 0.76, roughness: 0.48 })
);
const _copperMat = markSharedMat(
  new THREE.MeshStandardMaterial({ color: 0xb5693d, metalness: 0.86, roughness: 0.36 })
);
const _slateMat = markSharedMat(
  new THREE.MeshStandardMaterial({ color: 0x2a2f33, roughness: 0.45, metalness: 0.12 })
);
const _steelMat = markSharedMat(
  new THREE.MeshStandardMaterial({ color: 0x3b4047, metalness: 0.85, roughness: 0.4 })
);
const _bottleMat = markSharedMat(
  new THREE.MeshPhysicalMaterial({ color: 0x1a4028, roughness: 0.15, clearcoat: 0.8 })
);
const _mirrorGlassMat = markSharedMat(
  new THREE.MeshPhysicalMaterial({
    color: 0xdbe6e8,
    metalness: 0.96,
    roughness: 0.06,
    clearcoat: 1.0,
  })
);
const _floodedWaterMat = markSharedMat(
  new THREE.MeshPhysicalMaterial({
    color: 0x16313a,
    roughness: 0.08,
    metalness: 0.22,
    clearcoat: 1.0,
    transparent: true,
    opacity: 0.78,
  })
);
const _conservatoryWaterMat = markSharedMat(
  new THREE.MeshPhysicalMaterial({ color: 0x265452, roughness: 0.08, clearcoat: 1 })
);
const _glassDomeMat = markSharedMat(
  new THREE.MeshPhysicalMaterial({
    color: 0xdbe6e2,
    roughness: 0.08,
    transparent: true,
    opacity: 0.42,
  })
);
const _fanlightMat = markSharedMat(
  new THREE.MeshStandardMaterial({
    color: 0x627f9e,
    emissive: 0x2d4869,
    emissiveIntensity: 0.65,
    roughness: 0.25,
  })
);
const _newelGlobeMat = markSharedMat(
  new THREE.MeshStandardMaterial({
    color: 0xffefd0,
    emissive: 0xffb84d,
    emissiveIntensity: 1.35,
    roughness: 0.2,
  })
);
const _bankerShadeMat = markSharedMat(
  new THREE.MeshStandardMaterial({
    color: 0x1e6b48,
    emissive: 0x2a8a56,
    emissiveIntensity: 0.75,
    roughness: 0.25,
  })
);
const _globeSphereMat = markSharedMat(
  new THREE.MeshStandardMaterial({ color: 0x9a8966, roughness: 0.55 })
);
const _linenMat = markSharedMat(
  new THREE.MeshStandardMaterial({ color: 0xe6dac4, roughness: 0.88 })
);
const _blanketMat = markSharedMat(
  new THREE.MeshStandardMaterial({ color: 0x5c5346, roughness: 0.92 })
);
const _boilerGrateMat = markSharedMat(
  new THREE.MeshStandardMaterial({
    color: 0x3b1208,
    emissive: 0xff5a1f,
    emissiveIntensity: 1.9,
    roughness: 0.7,
  })
);
const _portalRingMat = markSharedMat(
  new THREE.MeshStandardMaterial({
    color: 0x8cded2,
    emissive: 0x4db5a6,
    emissiveIntensity: 1.25,
  })
);

const _velvetCache = new Map<number, THREE.MeshPhysicalMaterial>();
function getSharedVelvetMat(color: number): THREE.MeshPhysicalMaterial {
  let m = _velvetCache.get(color);
  if (!m) {
    m = markSharedMat(makeVelvetMat(color));
    _velvetCache.set(color, m);
  }
  return m;
}

const _plaqueMatCache = new Map<string, THREE.MeshPhysicalMaterial>();
function getSharedPlaqueMat(roomName: string, floor: number): THREE.MeshPhysicalMaterial {
  const key = `${roomName}|${floor}`;
  let m = _plaqueMatCache.get(key);
  if (!m) {
    const tex = createBrassNameplateTexture(roomName, floor);
    tex.userData.shared = true;
    m = markSharedMat(
      new THREE.MeshPhysicalMaterial({
        map: tex,
        roughness: 0.32,
        metalness: 0.78,
        clearcoat: 0.2,
      })
    );
    _plaqueMatCache.set(key, m);
  }
  return m;
}

interface TextureMaterialBundle {
  woodMat: THREE.MeshStandardMaterial;
  darkWoodMat: THREE.MeshStandardMaterial;
  brassMat: THREE.MeshPhysicalMaterial;
  slabShadowMat: THREE.MeshBasicMaterial;
  aoOverlayMat: THREE.MeshBasicMaterial;
  rugMat: THREE.MeshStandardMaterial;
  clockDialMat: THREE.MeshStandardMaterial;
  fireplaceStoneMat: THREE.MeshStandardMaterial;
  fireplaceSootMat: THREE.MeshBasicMaterial;
  portraitCanvasMat: THREE.MeshStandardMaterial;
  marblePedMat: THREE.MeshStandardMaterial;
  stainedGlassMat: THREE.MeshStandardMaterial;
  stainPoolMat: THREE.MeshBasicMaterial;
  unexploredSpillMat: THREE.MeshBasicMaterial;
  moonPoolMat: THREE.MeshBasicMaterial;
  conservatoryStoneMat: THREE.MeshStandardMaterial;
  floorMats: Map<string, THREE.Material>;
  contactShadowMats: Map<string, THREE.MeshBasicMaterial>;
  staticHaloMats: Map<string, THREE.SpriteMaterial>;
}

const _texMatBundles = new WeakMap<ProceduralTextures, TextureMaterialBundle>();

function getTextureMaterialBundle(textures: ProceduralTextures): TextureMaterialBundle {
  let bundle = _texMatBundles.get(textures);
  if (!bundle) {
    bundle = {
      woodMat: markSharedMat(makeWalnutMat(textures, 0xa8866b)),
      darkWoodMat: markSharedMat(makeWalnutMat(textures, 0x6b5140)),
      brassMat: markSharedMat(makeBrassMat(textures, 0xd8b166)),
      slabShadowMat: markSharedMat(
        new THREE.MeshBasicMaterial({
          map: textures.slabShadow,
          transparent: true,
          depthWrite: false,
          opacity: 0.78,
        })
      ),
      aoOverlayMat: markSharedMat(
        new THREE.MeshBasicMaterial({
          map: textures.roomAO,
          transparent: true,
          opacity: 0.6,
          blending: THREE.MultiplyBlending,
          premultipliedAlpha: true,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1,
        })
      ),
      rugMat: markSharedMat(
        new THREE.MeshStandardMaterial({
          map: textures.rug,
          roughness: 0.94,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -2,
        })
      ),
      clockDialMat: markSharedMat(
        new THREE.MeshStandardMaterial({ map: textures.clockFace, roughness: 0.35 })
      ),
      fireplaceStoneMat: markSharedMat(
        new THREE.MeshStandardMaterial({
          color: 0x5c544e,
          map: textures.stoneFloor,
          normalMap: textures.stoneNormal,
          roughnessMap: textures.stoneRough,
          roughness: 0.9,
        })
      ),
      fireplaceSootMat: markSharedMat(
        new THREE.MeshBasicMaterial({
          map: textures.contactShadow,
          transparent: true,
          opacity: 0.56,
          depthWrite: false,
        })
      ),
      portraitCanvasMat: markSharedMat(
        new THREE.MeshStandardMaterial({ map: textures.portrait, roughness: 0.58 })
      ),
      marblePedMat: markSharedMat(
        new THREE.MeshStandardMaterial({
          color: 0xd6cbb8,
          map: textures.marbleFloor,
          roughness: 0.35,
        })
      ),
      stainedGlassMat: markSharedMat(
        new THREE.MeshStandardMaterial({
          map: textures.stainedGlass,
          emissiveMap: textures.stainedGlass,
          emissive: new THREE.Color(0xdcb46b),
          emissiveIntensity: 1.05,
          roughness: 0.2,
        })
      ),
      stainPoolMat: markSharedMat(
        new THREE.MeshBasicMaterial({
          map: textures.stainedGlass,
          transparent: true,
          opacity: 0.26,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      ),
      unexploredSpillMat: markSharedMat(
        new THREE.MeshBasicMaterial({
          map: textures.lightGlow,
          color: 0xffc66b,
          transparent: true,
          opacity: 0.65,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      ),
      moonPoolMat: markSharedMat(
        new THREE.MeshBasicMaterial({
          map: textures.lightGlow,
          color: 0x86b2ea,
          transparent: true,
          opacity: 0.28,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      ),
      conservatoryStoneMat: markSharedMat(
        new THREE.MeshStandardMaterial({
          color: 0x7b8078,
          map: textures.stoneFloor,
          roughness: 0.78,
        })
      ),
      floorMats: new Map(),
      contactShadowMats: new Map(),
      staticHaloMats: new Map(),
    };
    _texMatBundles.set(textures, bundle);
  }
  return bundle;
}

/**
 * Engraved antique brass room nameplate inlaid into the front edge of each physical room tile
 * (Inspired by real physical haunted-house board game tiles like Betrayal at House on the Hill)
 */
function createBrassNameplateTexture(roomName: string, floor: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 96;
  const ctx = c.getContext('2d')!;

  // Aged oil-rubbed brass plate gradient
  const grad = ctx.createLinearGradient(0, 0, 512, 96);
  grad.addColorStop(0, '#4c381c');
  grad.addColorStop(0.22, '#8b6836');
  grad.addColorStop(0.5, '#b88f4c');
  grad.addColorStop(0.78, '#876332');
  grad.addColorStop(1, '#443017');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 96);

  // Subtle horizontal brushed brass patina lines
  ctx.strokeStyle = 'rgba(28, 18, 8, 0.18)';
  for (let y = 4; y < 92; y += 3) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(512, y);
    ctx.stroke();
  }

  // Engraved recessed double border + brass corner rivets
  ctx.strokeStyle = '#24170a';
  ctx.lineWidth = 4;
  ctx.strokeRect(8, 8, 496, 80);
  ctx.strokeStyle = 'rgba(247, 224, 174, 0.45)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(14, 14, 484, 68);

  [
    [26, 48],
    [486, 48],
  ].forEach(([rx, ry]) => {
    ctx.beginPath();
    ctx.arc(rx, ry, 5.5, 0, Math.PI * 2);
    ctx.fillStyle = '#30200e';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(rx - 1, ry - 1, 3.2, 0, Math.PI * 2);
    ctx.fillStyle = '#dec080';
    ctx.fill();
  });

  // Floor Roman tier mark & engraved room title
  const floorTag = floor === 1 ? 'UPPER' : floor === -1 ? 'CELLAR' : 'GROUND';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Embossed highlight shadow
  ctx.font = '600 30px "Cormorant Garamond", Georgia, serif';
  ctx.fillStyle = 'rgba(255, 238, 198, 0.35)';
  ctx.fillText(roomName, 256, 41);
  ctx.fillStyle = '#1b1107';
  ctx.fillText(roomName, 256, 39);

  ctx.font = '500 13px "IBM Plex Mono", monospace';
  ctx.fillStyle = 'rgba(32, 20, 8, 0.78)';
  ctx.fillText(`— ${floorTag} —`, 256, 68);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Inlaid Marble Compass Rose texture for The Pendulum Vestibule
 */
function createCompassRoseTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, 512, 512);

  const cx = 256;
  const cy = 256;

  // Outer brass rings
  ctx.strokeStyle = '#c89e52';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(cx, cy, 224, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(210, 174, 108, 0.55)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, 206, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, 148, 0, Math.PI * 2);
  ctx.stroke();

  // 16-point compass star
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 - Math.PI / 2;
    const isMajor = i % 4 === 0;
    const isMid = i % 2 === 0 && !isMajor;
    const outerR = isMajor ? 202 : isMid ? 162 : 122;
    const sideR = isMajor ? 34 : 20;

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * outerR, cy + Math.sin(a) * outerR);
    ctx.lineTo(cx + Math.cos(a + 0.18) * sideR, cy + Math.sin(a + 0.18) * sideR);
    ctx.closePath();
    ctx.fillStyle = isMajor ? '#d8b164' : 'rgba(182, 144, 78, 0.72)';
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * outerR, cy + Math.sin(a) * outerR);
    ctx.lineTo(cx + Math.cos(a - 0.18) * sideR, cy + Math.sin(a - 0.18) * sideR);
    ctx.closePath();
    ctx.fillStyle = isMajor ? '#6d5022' : 'rgba(92, 66, 28, 0.65)';
    ctx.fill();
  }

  // Roman numeral XIII subtly etched near north
  ctx.font = '600 22px Georgia, serif';
  ctx.fillStyle = '#e8ca85';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('XIII', cx, 42);
  ctx.fillText('VI', cx, 470);
  ctx.fillText('III', 470, cy);
  ctx.fillText('IX', 42, cy);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.userData.shared = true;
  return tex;
}

let _compassMat: THREE.MeshStandardMaterial | null = null;
function getCompassRoseMat(): THREE.MeshStandardMaterial {
  if (!_compassMat) {
    _compassMat = markSharedMat(
      new THREE.MeshStandardMaterial({
        map: createCompassRoseTexture(),
        transparent: true,
        roughness: 0.35,
        metalness: 0.55,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      })
    );
  }
  return _compassMat;
}

function addContactShadow(
  parent: THREE.Object3D,
  textures: ProceduralTextures,
  radius = 0.85,
  y = 0.024,
  opacity = 0.72
): void {
  const bundle = getTextureMaterialBundle(textures);
  const opKey = opacity.toFixed(2);
  let mat = bundle.contactShadowMats.get(opKey);
  if (!mat) {
    mat = markSharedMat(
      new THREE.MeshBasicMaterial({
        map: textures.contactShadow,
        transparent: true,
        depthWrite: false,
        opacity,
      })
    );
    bundle.contactShadowMats.set(opKey, mat);
  }
  const shadow = new THREE.Mesh(getPlaneGeo(radius * 2, radius * 2), mat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = y;
  parent.add(shadow);
}

function addWarmHaloSprite(
  parent: THREE.Object3D,
  textures: ProceduralTextures,
  size: number,
  x: number,
  y: number,
  z: number,
  color = 0xffc46b,
  opacity = 0.55,
  animated = false
): THREE.Sprite {
  let mat: THREE.SpriteMaterial;
  if (animated) {
    mat = new THREE.SpriteMaterial({
      map: textures.lightGlow,
      color,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
  } else {
    const bundle = getTextureMaterialBundle(textures);
    const key = `${color}:${opacity.toFixed(2)}`;
    const cached = bundle.staticHaloMats.get(key);
    if (cached) {
      mat = cached;
    } else {
      mat = markSharedMat(
        new THREE.SpriteMaterial({
          map: textures.lightGlow,
          color,
          transparent: true,
          opacity,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      bundle.staticHaloMats.set(key, mat);
    }
  }
  const sp = new THREE.Sprite(mat);
  sp.scale.set(size, size, 1);
  sp.position.set(x, y, z);
  parent.add(sp);
  return sp;
}

function makeBrassMat(textures: ProceduralTextures, color = 0xdcb66e): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color,
    map: textures.patinaBrass,
    roughnessMap: textures.patinaBrassRough,
    metalness: 0.9,
    roughness: 0.34,
    clearcoat: 0.25,
    clearcoatRoughness: 0.42,
    anisotropy: 0.45,
  });
}

function makeWalnutMat(textures: ProceduralTextures, color = 0x9c7b62): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    map: textures.furnitureWood,
    normalMap: textures.furnitureWoodNormal,
    normalScale: new THREE.Vector2(0.75, 0.75),
    roughnessMap: textures.furnitureWoodRough,
    metalness: 0.05,
    roughness: 0.7,
  });
}

function makeVelvetMat(color = 0x6b2229): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color,
    metalness: 0.02,
    roughness: 0.92,
    sheen: 0.68,
    sheenRoughness: 0.58,
    sheenColor: new THREE.Color(color).lerp(new THREE.Color(0xf5dfbe), 0.35),
  });
}

function buildCandleStick(
  brassMat: THREE.Material,
  textures: ProceduralTextures,
  animatedProps: BuiltRoomRefs['animatedProps']
): THREE.Group {
  const g = new THREE.Group();
  const holder = new THREE.Mesh(getCandleStemGeo(), brassMat);
  const wax = new THREE.Mesh(getCylGeo(0.032, 0.038, 0.24, 12), _candleWaxMat);
  wax.position.y = 0.48;
  const drip1 = new THREE.Mesh(getCylGeo(0.012, 0.008, 0.09, 6), _candleWaxMat);
  drip1.position.set(0.032, 0.44, 0.012);
  const drip2 = new THREE.Mesh(getSphereGeo(0.016, 6, 6), _candleWaxMat);
  drip2.position.set(-0.028, 0.38, 0.022);

  const flame = new THREE.Mesh(getSphereGeo(0.036, 10, 10), _candleFlameMat);
  flame.scale.set(0.75, 1.55, 0.75);
  flame.position.y = 0.65;
  const halo = addWarmHaloSprite(g, textures, 0.56, 0, 0.67, 0, 0xffbe59, 0.45, true);
  g.add(holder, wax, drip1, drip2, flame);
  animatedProps.push({ mesh: flame, kind: 'candle' });
  animatedProps.push({ mesh: halo, kind: 'halo' });
  return g;
}

function buildCandelabra(
  brassMat: THREE.Material,
  textures: ProceduralTextures,
  animatedProps: BuiltRoomRefs['animatedProps']
): THREE.Group {
  const g = new THREE.Group();
  g.add(buildCandleStick(brassMat, textures, animatedProps));
  const armGeo = getTorusGeo(0.11, 0.012, 8, 16, Math.PI);
  [-0.22, 0.22].forEach((ox) => {
    const arm = new THREE.Mesh(armGeo, brassMat);
    arm.position.set(ox * 0.5, 0.28, 0);
    arm.rotation.z = Math.PI;
    const sub = buildCandleStick(brassMat, textures, animatedProps);
    sub.scale.setScalar(0.75);
    sub.position.set(ox, 0.22, 0);
    g.add(arm, sub);
  });
  return g;
}

function buildLoosePaperStack(x: number, y: number, z: number): THREE.InstancedMesh {
  const specs: BoxInstanceSpec[] = [];
  for (let i = 0; i < 3; i++) {
    specs.push({
      x: x + i * 0.015,
      y: y + i * 0.01,
      z: z - i * 0.01,
      sx: 0.32,
      sy: 0.008,
      sz: 0.42,
      ry: (i - 1) * 0.14,
    });
  }
  return makeBoxBatch(specs, _paperMat);
}

/**
 * Tall Moonlit Gothic Arched Window + Iron Muntins + Swaying Velvet Curtains
 */
function buildGothicWindow(
  wallTrimMat: THREE.Material,
  wallBrassMat: THREE.Material,
  curtainColor: number,
  fadeMats: THREE.Material[],
  animatedProps: BuiltRoomRefs['animatedProps'],
  wallT: number
): THREE.Group {
  const win = new THREE.Group();
  const winW = 1.65;
  const winH = 2.05;
  const baseY = 1.48;

  const moonGlassMat = new THREE.MeshStandardMaterial({
    color: 0x6b8eb8,
    emissive: 0x3f6294,
    emissiveIntensity: 0.85,
    roughness: 0.18,
    metalness: 0.1,
    transparent: false,
    opacity: 1,
  });
  const curtainMat = new THREE.MeshStandardMaterial({
    color: curtainColor,
    roughness: 0.92,
    transparent: false,
    opacity: 1,
  });
  fadeMats.push(moonGlassMat, curtainMat);

  // Recessed moonlit glass pane + gothic arched transom
  const pane = new THREE.Mesh(getPlaneGeo(winW - 0.16, winH - 0.22), moonGlassMat);
  pane.position.set(0, baseY + winH / 2 - 0.05, wallT / 2 + 0.025);
  const archPane = new THREE.Mesh(
    getCircleGeo((winW - 0.16) / 2, 16, 0, Math.PI),
    moonGlassMat
  );
  archPane.position.set(0, baseY + winH - 0.16, wallT / 2 + 0.025);
  win.add(pane, archPane);

  // Carved wood casing, sill & iron mullions (6 boxes batched into 1 InstancedMesh!)
  const trimBatch = makeBoxBatch(
    [
      { x: 0, y: baseY, z: wallT / 2 + 0.08, sx: winW + 0.28, sy: 0.11, sz: 0.22 },
      { x: -winW / 2, y: baseY + winH / 2, z: wallT / 2 + 0.05, sx: 0.12, sy: winH, sz: 0.14 },
      { x: winW / 2, y: baseY + winH / 2, z: wallT / 2 + 0.05, sx: 0.12, sy: winH, sz: 0.14 },
      { x: 0, y: baseY + winH / 2 + 0.22, z: wallT / 2 + 0.05, sx: 0.055, sy: winH + 0.55, sz: 0.05 },
      { x: 0, y: baseY + winH * 0.42, z: wallT / 2 + 0.05, sx: winW - 0.1, sy: 0.05, sz: 0.05 },
      { x: 0, y: baseY + winH * 0.85, z: wallT / 2 + 0.05, sx: winW - 0.1, sy: 0.05, sz: 0.05 },
    ],
    wallTrimMat
  );
  const archFrame = new THREE.Mesh(
    getTorusGeo(winW / 2, 0.065, 8, 20, Math.PI),
    wallTrimMat
  );
  archFrame.position.set(0, baseY + winH - 0.14, wallT / 2 + 0.05);
  win.add(trimBatch, archFrame);

  // Brass curtain rod + gently swaying velvet draperies
  const rod = new THREE.Mesh(getCylGeo(0.025, 0.025, winW + 0.95, 8), wallBrassMat);
  rod.rotation.z = Math.PI / 2;
  rod.position.set(0, baseY + winH + 0.52, wallT / 2 + 0.14);
  win.add(rod);

  const drapeGeo = getCylGeo(0.14, 0.22, 2.75, 10);
  const tieGeo = getTorusGeo(0.13, 0.02, 6, 12);
  [-1, 1].forEach((side) => {
    const drapePivot = new THREE.Group();
    drapePivot.position.set(side * (winW / 2 + 0.16), baseY + winH + 0.5, wallT / 2 + 0.14);
    const drape = new THREE.Mesh(drapeGeo, curtainMat);
    drape.scale.set(1.0, 1.0, 0.45);
    drape.position.set(0, -1.38, 0);
    const tie = new THREE.Mesh(tieGeo, wallBrassMat);
    tie.rotation.x = Math.PI / 2;
    tie.position.set(side * 0.03, -1.52, 0.02);
    drapePivot.add(drape, tie);
    win.add(drapePivot);
    animatedProps.push({ mesh: drapePivot, kind: 'curtain' });
  });

  return win;
}

function buildVictorianChair(
  woodMat: THREE.Material,
  velvetMat: THREE.Material,
  textures: ProceduralTextures
): THREE.Group {
  const chair = new THREE.Group();
  const legGeo = getCylGeo(0.032, 0.022, 0.48, 10);
  const legs = makeGeoBatch(
    legGeo,
    [
      { x: -0.22, y: 0.24, z: -0.2 },
      { x: 0.22, y: 0.24, z: -0.2 },
      { x: -0.22, y: 0.24, z: 0.2 },
      { x: 0.22, y: 0.24, z: 0.2 },
    ],
    woodMat,
    true
  );
  const postGeo = getCylGeo(0.026, 0.03, 0.68, 10);
  const posts = makeGeoBatch(
    postGeo,
    [
      { x: -0.22, y: 0.84, z: -0.21 },
      { x: 0.22, y: 0.84, z: -0.21 },
    ],
    woodMat
  );
  const woodParts = makeBoxBatch(
    [
      { x: 0, y: 0.48, z: 0, sx: 0.5, sy: 0.07, sz: 0.46 },
      { x: 0, y: 1.16, z: -0.21, sx: 0.5, sy: 0.08, sz: 0.06 },
    ],
    woodMat
  );
  const cushion = new THREE.Mesh(getBoxGeo(0.46, 0.075, 0.42), velvetMat);
  cushion.position.y = 0.54;
  const backPad = new THREE.Mesh(getCylGeo(0.18, 0.18, 0.05, 16), velvetMat);
  backPad.rotation.x = Math.PI / 2;
  backPad.scale.set(0.95, 1, 1.3);
  backPad.position.set(0, 0.88, -0.205);
  chair.add(legs, posts, woodParts, cushion, backPad);
  addContactShadow(chair, textures, 0.42, 0.022, 0.58);
  return chair;
}

function buildBookshelf(
  woodMat: THREE.Material,
  brassMat: THREE.Material,
  animatedProps: BuiltRoomRefs['animatedProps'],
  textures: ProceduralTextures,
  withLadder = false
): THREE.Group {
  const g = new THREE.Group();
  // Batch carcass + 4 shelf planks (9 boxes -> 1 InstancedMesh!)
  const woodSpecs: BoxInstanceSpec[] = [
    { x: 0, y: 1.52, z: -0.22, sx: 2.2, sy: 3.05, sz: 0.08 },
    { x: -1.06, y: 1.52, z: 0, sx: 0.12, sy: 3.05, sz: 0.52 },
    { x: 1.06, y: 1.52, z: 0, sx: 0.12, sy: 3.05, sz: 0.52 },
    { x: 0, y: 3.1, z: 0, sx: 2.42, sy: 0.18, sz: 0.64 },
    { x: 0, y: 0.09, z: 0, sx: 2.34, sy: 0.18, sz: 0.58 },
  ];
  for (let shelf = 0; shelf < 4; shelf++) {
    const sy = 0.42 + shelf * 0.65;
    woodSpecs.push({ x: 0, y: sy - 0.03, z: 0, sx: 2.04, sy: 0.06, sz: 0.46 });
  }
  const carcass = makeBoxBatch(woodSpecs, woodMat, true);
  const brassTrim = new THREE.Mesh(getBoxGeo(2.28, 0.032, 0.66), brassMat);
  brassTrim.position.y = 2.98;
  g.add(carcass, brassTrim);

  // Batch 38 static leather-bound books into 1 color-instanced mesh + 1 animated sliding book!
  const bookColors = [0x6e2428, 0x223647, 0x354728, 0x735024, 0x47283c, 0x573a23];
  const staticBookSpecs: BoxInstanceSpec[] = [];
  for (let shelf = 0; shelf < 4; shelf++) {
    const sy = 0.42 + shelf * 0.65;
    for (let b = 0; b < 10; b++) {
      if (shelf === 1 && b === 7) continue;
      const bw = 0.13 + ((b * 5) % 3) * 0.025;
      const bh = 0.35 + ((b + shelf) % 4) * 0.045;
      const col = bookColors[(b + shelf * 2) % bookColors.length];
      const rz = b === 6 && shelf === 1 ? -0.24 : b === 9 && shelf === 3 ? 0.12 : 0;
      if (shelf === 2 && b === 4) {
        const animBook = new THREE.Mesh(
          getBoxGeo(bw, bh, 0.32),
          markSharedMat(new THREE.MeshStandardMaterial({ color: col, roughness: 0.78 }))
        );
        animBook.position.set(-0.88 + b * 0.195, sy + bh / 2, 0.04);
        animBook.rotation.z = rz;
        g.add(animBook);
        animatedProps.push({ mesh: animBook, kind: 'book' });
      } else {
        staticBookSpecs.push({
          x: -0.88 + b * 0.195,
          y: sy + bh / 2,
          z: 0.04,
          sx: bw,
          sy: bh,
          sz: 0.32,
          rz,
          color: col,
        });
      }
    }
  }
  g.add(makeBoxBatch(staticBookSpecs, _bookInstancedMat));

  // Rolling Victorian brass-rail library ladder (10 meshes -> 2 InstancedMeshes!)
  if (withLadder) {
    const ladder = new THREE.Group();
    ladder.position.set(0.55, 0, 0.42);
    ladder.rotation.x = -0.14;
    const rails = makeGeoBatch(
      getCylGeo(0.024, 0.024, 3.05, 8),
      [
        { x: -0.22, y: 1.52, z: 0 },
        { x: 0.22, y: 1.52, z: 0 },
      ],
      woodMat
    );
    const rungSpecs: GeoInstanceSpec[] = [];
    for (let r = 0; r < 8; r++) {
      rungSpecs.push({ x: 0, y: 0.34 + r * 0.34, z: 0, rz: Math.PI / 2 });
    }
    const rungs = makeGeoBatch(getCylGeo(0.016, 0.016, 0.44, 8), rungSpecs, brassMat);
    ladder.add(rails, rungs);
    g.add(ladder);
  }

  addContactShadow(g, textures, 1.35, 0.022, 0.72);
  return g;
}

function buildDiningTable(
  woodMat: THREE.Material,
  velvetMat: THREE.Material,
  brassMat: THREE.Material,
  animatedProps: BuiltRoomRefs['animatedProps'],
  textures: ProceduralTextures
): THREE.Group {
  const g = new THREE.Group();
  const top = new THREE.Mesh(getBoxGeo(3.6, 0.12, 1.58), woodMat);
  top.position.y = 0.94;
  top.castShadow = true;
  top.receiveShadow = true;
  const bevelRim = new THREE.Mesh(getBoxGeo(3.66, 0.04, 1.64), brassMat);
  bevelRim.position.y = 0.91;
  g.add(top, bevelRim);

  const cols = makeGeoBatch(
    getBalusterGeo(),
    [
      { x: -1.12, y: 0, z: 0, sx: 1.9, sy: 0.96, sz: 1.9 },
      { x: 1.12, y: 0, z: 0, sx: 1.9, sy: 0.96, sz: 1.9 },
    ],
    woodMat,
    true
  );
  const baseWood = makeBoxBatch(
    [
      { x: -1.12, y: 0.045, z: 0, sx: 0.24, sy: 0.09, sz: 1.15 },
      { x: 1.12, y: 0.045, z: 0, sx: 0.24, sy: 0.09, sz: 1.15 },
      { x: 0, y: 0.18, z: 0, sx: 2.24, sy: 0.08, sz: 0.1 },
    ],
    woodMat
  );
  g.add(cols, baseWood);

  const runner = new THREE.Mesh(getBoxGeo(3.25, 0.016, 0.46), velvetMat);
  runner.position.y = 1.01;
  g.add(runner);
  const candelabra = buildCandelabra(brassMat, textures, animatedProps);
  candelabra.position.set(0, 1.01, 0);
  g.add(candelabra);

  const settings: [number, number][] = [
    [-0.98, -0.48],
    [0.98, -0.48],
    [-0.98, 0.48],
    [0.98, 0.48],
    [1.48, 0],
  ];
  const plates = makeGeoBatch(
    getCylGeo(0.18, 0.14, 0.025, 18),
    settings.map(([px, pz]) => ({ x: px, y: 1.015, z: pz })),
    _plateMat
  );
  const goblets = makeGeoBatch(
    getCylGeo(0.045, 0.02, 0.14, 10),
    settings.map(([px, pz]) => ({ x: px + 0.18, y: 1.08, z: pz + (pz >= 0 ? -0.1 : 0.1) })),
    _gobletGlassMat
  );
  g.add(plates, goblets);

  const chairPos: [number, number, number][] = [
    [-0.98, -1.04, 0.04],
    [0.98, -1.06, -0.06],
    [-0.98, 1.04, Math.PI - 0.05],
    [0.98, 1.04, Math.PI + 0.03],
    [2.38, 0.12, -Math.PI / 2 + 0.24], // The Extra Place Setting pulled-out chair!
  ];
  chairPos.forEach(([cx, cz, ry]) => {
    const ch = buildVictorianChair(woodMat, velvetMat, textures);
    ch.position.set(cx, 0, cz);
    ch.rotation.y = ry;
    g.add(ch);
  });

  addContactShadow(g, textures, 2.38, 0.022, 0.68);
  return g;
}

function buildGrandPiano(
  brassMat: THREE.Material,
  textures: ProceduralTextures
): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(getPianoBodyGeo(), _pianoLacquerMat);
  body.position.set(0, 0.78, 0);
  body.castShadow = true;
  const lid = new THREE.Mesh(getPianoBodyGeo(), _pianoLacquerMat);
  lid.scale.set(0.96, 0.16, 0.96);
  lid.position.set(-0.24, 1.18, 0);
  lid.rotation.z = 0.32;
  const propStick = new THREE.Mesh(getCylGeo(0.018, 0.018, 0.72, 10), brassMat);
  propStick.position.set(0.46, 1.32, -0.35);
  propStick.rotation.z = -0.18;
  const keys = new THREE.Mesh(getBoxGeo(1.58, 0.08, 0.34), _pianoIvoryMat);
  keys.position.set(0, 0.85, 1.08);
  const pedalLyre = new THREE.Mesh(getBoxGeo(0.28, 0.62, 0.08), _pianoLacquerMat);
  pedalLyre.position.set(0, 0.42, 0.7);
  const pedals = new THREE.Mesh(getBoxGeo(0.22, 0.04, 0.14), brassMat);
  pedals.position.set(0, 0.14, 0.76);

  const legs = makeGeoBatch(
    getBalusterGeo(),
    [
      { x: -0.72, y: 0, z: 0.86, sx: 1.3, sy: 0.84, sz: 1.3 },
      { x: 0.72, y: 0, z: 0.86, sx: 1.3, sy: 0.84, sz: 1.3 },
      { x: -0.25, y: 0, z: -0.82, sx: 1.3, sy: 0.84, sz: 1.3 },
    ],
    _pianoLacquerMat,
    true
  );

  g.add(buildLoosePaperStack(0.0, 1.16, 0.76));
  g.add(body, lid, propStick, keys, pedalLyre, pedals, legs);
  addContactShadow(g, textures, 1.55, 0.022, 0.74);
  return g;
}

function buildGrandfatherClock(
  woodMat: THREE.Material,
  brassMat: THREE.Material,
  textures: ProceduralTextures,
  animatedProps: BuiltRoomRefs['animatedProps']
): THREE.Group {
  const g = new THREE.Group();
  const bundle = getTextureMaterialBundle(textures);
  const bodyBatch = makeBoxBatch(
    [
      { x: 0, y: 0.31, z: 0, sx: 0.92, sy: 0.62, sz: 0.58 },
      { x: 0, y: 1.48, z: 0, sx: 0.74, sy: 1.72, sz: 0.46 },
      { x: 0, y: 2.74, z: 0, sx: 0.98, sy: 0.86, sz: 0.6 },
    ],
    woodMat,
    true
  );
  const finial = new THREE.Mesh(getSphereGeo(0.09, 12, 12), brassMat);
  finial.position.y = 3.28;
  const dial = new THREE.Mesh(getCircleGeo(0.34, 28), bundle.clockDialMat);
  dial.position.set(0, 2.74, 0.31);
  const bezel = new THREE.Mesh(getTorusGeo(0.35, 0.032, 12, 28), brassMat);
  bezel.position.set(0, 2.74, 0.31);

  const pendPivot = new THREE.Group();
  pendPivot.position.set(0, 2.24, 0.25);
  const rod = new THREE.Mesh(getCylGeo(0.014, 0.014, 1.15, 8), brassMat);
  rod.position.y = -0.58;
  const bob = new THREE.Mesh(getCylGeo(0.15, 0.15, 0.04, 20), brassMat);
  bob.rotation.x = Math.PI / 2;
  bob.position.y = -1.16;
  pendPivot.add(rod, bob);
  animatedProps.push({ mesh: pendPivot, kind: 'pendulum' });

  g.add(bodyBatch, finial, dial, bezel, pendPivot);
  addContactShadow(g, textures, 0.78, 0.022, 0.76);
  return g;
}

function buildFireplace(
  woodMat: THREE.Material,
  brassMat: THREE.Material,
  textures: ProceduralTextures,
  animatedProps: BuiltRoomRefs['animatedProps']
): THREE.Group {
  const g = new THREE.Group();
  const bundle = getTextureMaterialBundle(textures);
  const stoneBatch = makeBoxBatch(
    [
      { x: 0, y: 0.075, z: 0, sx: 2.65, sy: 0.15, sz: 1.02 },
      { x: -0.94, y: 0.93, z: -0.08, sx: 0.48, sy: 1.72, sz: 0.64 },
      { x: 0.94, y: 0.93, z: -0.08, sx: 0.48, sy: 1.72, sz: 0.64 },
    ],
    bundle.fireplaceStoneMat,
    true,
    true
  );
  const woodBatch = makeBoxBatch(
    [
      { x: 0, y: 1.84, z: -0.05, sx: 2.85, sy: 0.22, sz: 0.84 },
      { x: 0, y: 2.58, z: -0.28, sx: 2.1, sy: 1.25, sz: 0.16 },
    ],
    woodMat,
    true
  );
  const mirrorGlass = new THREE.Mesh(getPlaneGeo(1.68, 0.94), _fireplaceMirrorMat);
  mirrorGlass.position.set(0, 2.58, -0.19);
  const firebox = new THREE.Mesh(getBoxGeo(1.42, 1.52, 0.45), _fireboxMat);
  firebox.position.set(0, 0.86, -0.18);

  const soot = new THREE.Mesh(getPlaneGeo(1.42, 0.58), bundle.fireplaceSootMat);
  soot.position.set(0, 1.58, 0.24);

  const embers = new THREE.Mesh(getBoxGeo(1.05, 0.18, 0.34), _embersMat);
  embers.position.set(0, 0.22, -0.05);
  const flame = new THREE.Mesh(getConeGeo(0.22, 0.48, 9), _fireFlameMat);
  flame.position.set(0, 0.52, -0.04);
  animatedProps.push({ mesh: flame, kind: 'candle' });
  const fireHalo = addWarmHaloSprite(g, textures, 1.85, 0, 0.62, 0.12, 0xff9b3d, 0.54, true);
  animatedProps.push({ mesh: fireHalo, kind: 'halo' });

  const grate = new THREE.Mesh(getBoxGeo(1.22, 0.06, 0.06), brassMat);
  grate.position.set(0, 0.38, 0.18);

  const mcL = buildCandleStick(brassMat, textures, animatedProps);
  mcL.scale.setScalar(0.68);
  mcL.position.set(-1.02, 1.95, 0.06);
  const mcR = buildCandleStick(brassMat, textures, animatedProps);
  mcR.scale.setScalar(0.68);
  mcR.position.set(1.02, 1.95, 0.06);

  g.add(
    stoneBatch,
    woodBatch,
    mirrorGlass,
    firebox,
    soot,
    embers,
    flame,
    grate,
    mcL,
    mcR
  );
  addContactShadow(g, textures, 1.55, 0.022, 0.65);
  return g;
}

function buildPortraitFrame(
  brassMat: THREE.Material,
  textures: ProceduralTextures,
  portraitEyes: THREE.Group[],
  tiltZ = 0.035
): THREE.Group {
  const g = new THREE.Group();
  const bundle = getTextureMaterialBundle(textures);
  g.rotation.z = tiltZ;
  const frame = new THREE.Mesh(getBoxGeo(1.38, 1.74, 0.11), brassMat);
  frame.castShadow = true;
  const canvas = new THREE.Mesh(getPlaneGeo(1.16, 1.52), bundle.portraitCanvasMat);
  canvas.position.z = 0.06;
  const eyesGroup = new THREE.Group();
  eyesGroup.position.set(0, 0.09, 0.066);
  const pupilGeo = getCircleGeo(0.028, 10);
  const lp = new THREE.Mesh(pupilGeo, _pupilMat);
  lp.position.set(-0.125, 0, 0);
  const rp = new THREE.Mesh(pupilGeo, _pupilMat);
  rp.position.set(0.125, 0, 0);
  eyesGroup.add(lp, rp);
  portraitEyes.push(eyesGroup);
  g.add(frame, canvas, eyesGroup);
  return g;
}

function buildChandelier(
  brassMat: THREE.Material,
  textures: ProceduralTextures,
  animatedProps: BuiltRoomRefs['animatedProps']
): THREE.Group {
  const g = new THREE.Group();
  const chain = new THREE.Mesh(getCylGeo(0.018, 0.018, 0.95, 8), brassMat);
  chain.position.y = 0.45;
  const ring = new THREE.Mesh(getTorusGeo(0.66, 0.032, 10, 28), brassMat);
  ring.rotation.x = Math.PI / 2;
  const innerRing = new THREE.Mesh(getTorusGeo(0.3, 0.02, 8, 20), brassMat);
  innerRing.rotation.x = Math.PI / 2;
  innerRing.position.y = -0.14;

  const armSpecs: BoxInstanceSpec[] = [];
  const staticGlobeSpecs: GeoInstanceSpec[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    armSpecs.push({
      x: Math.cos(a) * 0.48,
      y: -0.05,
      z: Math.sin(a) * 0.48,
      sx: 0.36,
      sy: 0.022,
      sz: 0.022,
      ry: -a,
    });
    if (i === 0) {
      const globe = new THREE.Mesh(getSphereGeo(0.082, 10, 10), _chandelierGlobeMat);
      globe.position.set(Math.cos(a) * 0.66, 0.1, Math.sin(a) * 0.66);
      g.add(globe);
      animatedProps.push({ mesh: globe, kind: 'candle' });
    } else {
      staticGlobeSpecs.push({
        x: Math.cos(a) * 0.66,
        y: 0.1,
        z: Math.sin(a) * 0.66,
      });
    }
  }
  const arms = makeBoxBatch(armSpecs, brassMat);
  const globes = makeGeoBatch(getSphereGeo(0.082, 10, 10), staticGlobeSpecs, _chandelierGlobeMat);
  g.add(chain, ring, innerRing, arms, globes);

  const glow = addWarmHaloSprite(g, textures, 2.75, 0, 0.05, 0, 0xffca74, 0.38, true);
  animatedProps.push({ mesh: glow, kind: 'halo' });
  return g;
}

/**
 * Sculpted Victorian Potted Palm / Fern (batched into 2 InstancedMeshes for fronds instead of 18 meshes!)
 */
function buildPottedPalm(woodMat: THREE.Material, brassMat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const pot = new THREE.Mesh(getCylGeo(0.32, 0.21, 0.48, 14), _palmPotMat);
  pot.position.y = 0.24;
  pot.castShadow = true;
  const rim = new THREE.Mesh(getTorusGeo(0.31, 0.032, 8, 16), brassMat);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.46;
  const soil = new THREE.Mesh(getCircleGeo(0.28, 12), woodMat);
  soil.rotation.x = -Math.PI / 2;
  soil.position.y = 0.465;
  g.add(pot, rim, soil);

  const stemInst = new THREE.InstancedMesh(getCylGeo(0.014, 0.022, 1, 6), _palmLeafMat, 9);
  const bladeInst = new THREE.InstancedMesh(getConeGeo(0.18, 0.85, 5), _palmLeafMat, 9);
  const pivotMat = new THREE.Matrix4();
  const localMat = new THREE.Matrix4();
  const q1 = new THREE.Quaternion();
  const e1 = new THREE.Euler();
  const p1 = new THREE.Vector3();
  const s1 = new THREE.Vector3();

  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + (i % 2) * 0.2;
    const h = i < 4 ? 0.95 : 0.68;
    const tilt = i < 4 ? 0.55 : 0.98;
    e1.set(tilt, a, 0, 'YXZ');
    q1.setFromEuler(e1);
    p1.set(0, 0.48, 0);
    s1.set(1, 1, 1);
    pivotMat.compose(p1, q1, s1);

    // Stem transform
    localMat.compose(
      _batchPos.set(0, h * 0.5, 0),
      _batchQuat.identity(),
      _batchScale.set(1, h, 1)
    );
    _batchMat4.multiplyMatrices(pivotMat, localMat);
    stemInst.setMatrixAt(i, _batchMat4);

    // Blade transform
    _batchEuler.set(0.28, 0, 0);
    _batchQuat.setFromEuler(_batchEuler);
    localMat.compose(
      _batchPos.set(0, h * 0.65, 0.06),
      _batchQuat,
      _batchScale.set(1.0, h, 0.22)
    );
    _batchMat4.multiplyMatrices(pivotMat, localMat);
    bladeInst.setMatrixAt(i, _batchMat4);
  }
  stemInst.instanceMatrix.needsUpdate = true;
  bladeInst.instanceMatrix.needsUpdate = true;
  stemInst.computeBoundingSphere();
  bladeInst.computeBoundingSphere();
  g.add(stemInst, bladeInst);
  return g;
}

function buildCurioChestProp(
  woodMat: THREE.Material,
  brassMat: THREE.Material,
  textures: ProceduralTextures
): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(getBoxGeo(0.68, 0.36, 0.46), woodMat);
  body.position.y = 0.18;
  body.castShadow = true;
  const lid = new THREE.Mesh(getCylGeo(0.23, 0.23, 0.68, 12, 1, false, 0, Math.PI), woodMat);
  lid.rotation.z = Math.PI / 2;
  lid.position.y = 0.36;
  lid.castShadow = true;
  const brassHardware = makeBoxBatch(
    [
      { x: -0.22, y: 0.2, z: 0, sx: 0.05, sy: 0.38, sz: 0.49 },
      { x: 0.22, y: 0.2, z: 0, sx: 0.05, sy: 0.38, sz: 0.49 },
      { x: 0, y: 0.33, z: 0.24, sx: 0.11, sy: 0.14, sz: 0.04 },
    ],
    brassMat
  );
  addWarmHaloSprite(g, textures, 1.05, 0, 0.42, 0.04, 0xf6c66a, 0.48);
  addContactShadow(g, textures, 0.56, 0.022, 0.72);
  g.add(body, lid, brassHardware);
  return g;
}

function buildInspectableMarkerProp(
  brassMat: THREE.Material,
  textures: ProceduralTextures
): THREE.Group {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(getTorusGeo(0.22, 0.026, 8, 22), brassMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.04;
  const handle = new THREE.Mesh(getCylGeo(0.024, 0.032, 0.24, 10), brassMat);
  handle.rotation.z = 0.62;
  handle.position.set(0.16, 0.14, 0);
  const lens = new THREE.Mesh(getCircleGeo(0.19, 18), _inspectLensMat);
  lens.rotation.x = -Math.PI / 2;
  lens.position.y = 0.045;
  addWarmHaloSprite(g, textures, 0.85, 0, 0.24, 0, 0x8ad8c4, 0.42);
  g.add(ring, handle, lens);
  return g;
}

export function buildRoomMesh(
  room: PlacedRoom,
  textures: ProceduralTextures,
  isSoftwareGl: boolean
): BuiltRoomRefs {
  const tpl = getRoomTemplate(room.templateId);
  const bundle = getTextureMaterialBundle(textures);
  const group = new THREE.Group();
  group.name = `room_${room.id}`;
  const worldPos = roomWorldPosition(room);
  group.position.copy(worldPos);

  const woodMat = bundle.woodMat;
  const darkWoodMat = bundle.darkWoodMat;
  const brassMat = bundle.brassMat;
  const velvetMat = getSharedVelvetMat(new THREE.Color(tpl.accentColor).getHex());

  const animatedProps: BuiltRoomRefs['animatedProps'] = [];
  const portraitEyes: THREE.Group[] = [];
  const hitProxies: THREE.Object3D[] = [];
  const doorPivots: Partial<Record<Direction, THREE.Group>> = {};
  const doorBaseAngles: Partial<Record<Direction, number>> = {};
  const unexploredBeacons: Partial<Record<Direction, THREE.Group>> = {};
  const unexploredBeaconCrests: THREE.Object3D[] = [];

  // 1. Thick Handcrafted Wooden Board-Game Room Slab + Engraved Brass Tile Nameplate
  const slabShadow = new THREE.Mesh(
    getPlaneGeo(ROOM_SIZE + 1.8, ROOM_SIZE + 1.8),
    bundle.slabShadowMat
  );
  slabShadow.rotation.x = -Math.PI / 2;
  slabShadow.position.y = -0.365;
  group.add(slabShadow);

  const slabMesh = new THREE.Mesh(getBoxGeo(ROOM_SIZE, 0.4, ROOM_SIZE), darkWoodMat);
  slabMesh.position.y = -0.2;
  slabMesh.receiveShadow = true;
  slabMesh.castShadow = true;
  group.add(slabMesh);

  // Engraved antique brass nameplate inlaid on South & East edges (cached per room name+floor!)
  const plaqueMat = getSharedPlaqueMat(room.name, room.floor);
  const plaqueGeo = getPlaneGeo(3.2, 0.34);
  const plaqueS = new THREE.Mesh(plaqueGeo, plaqueMat);
  plaqueS.position.set(0, -0.19, ROOM_SIZE / 2 + 0.015);
  const plaqueE = new THREE.Mesh(plaqueGeo, plaqueMat);
  plaqueE.rotation.y = Math.PI / 2;
  plaqueE.position.set(ROOM_SIZE / 2 + 0.015, -0.19, 0);
  group.add(plaqueS, plaqueE);

  // Stepped inlaid brass miter trim around tile perimeter
  const rimMesh = new THREE.Mesh(getBoxGeo(ROOM_SIZE + 0.06, 0.055, ROOM_SIZE + 0.06), brassMat);
  rimMesh.position.y = -0.02;
  group.add(rimMesh);

  // Smooth brass hover highlight perimeter frame (1 merged mesh, hidden when opacity == 0!)
  const hoverBorderMat = new THREE.MeshBasicMaterial({
    color: 0xf4c973,
    transparent: true,
    opacity: 0.0,
    depthWrite: false,
  });
  const hoverBorderMesh = new THREE.Mesh(getHoverBorderGeo(), hoverBorderMat);
  hoverBorderMesh.visible = false;
  group.add(hoverBorderMesh);

  // Floor PBR material with Normal + Roughness + Baked Architectural AO (cached per kind+color)
  const floorKind =
    tpl.geometry === 'foyer' ||
    tpl.geometry === 'vestibule' ||
    tpl.geometry === 'ballroom' ||
    tpl.geometry === 'mirror' ||
    tpl.geometry === 'chapel'
      ? 'marble'
      : room.floor === -1 ||
          tpl.geometry === 'cellar' ||
          tpl.geometry === 'boiler' ||
          tpl.geometry === 'flooded' ||
          tpl.geometry === 'vault' ||
          tpl.geometry === 'passage'
        ? 'stone'
        : 'wood';

  const floorKey = `${floorKind}:${tpl.floorColor}`;
  let floorMat = bundle.floorMats.get(floorKey);
  if (!floorMat) {
    const floorTex =
      floorKind === 'marble'
        ? textures.marbleFloor
        : floorKind === 'stone'
          ? textures.stoneFloor
          : textures.woodFloor;
    const floorNormal =
      floorKind === 'marble'
        ? textures.marbleNormal
        : floorKind === 'stone'
          ? textures.stoneNormal
          : textures.woodNormal;
    const floorRough =
      floorKind === 'marble'
        ? textures.marbleRough
        : floorKind === 'stone'
          ? textures.stoneRough
          : textures.woodRough;

    floorMat = markSharedMat(
      floorKind === 'marble'
        ? new THREE.MeshPhysicalMaterial({
            map: floorTex,
            normalMap: floorNormal,
            normalScale: new THREE.Vector2(1.05, 1.05),
            roughnessMap: floorRough,
            aoMap: textures.roomAO,
            aoMapIntensity: 1.25,
            color: new THREE.Color(tpl.floorColor).lerp(new THREE.Color(0xffffff), 0.65),
            roughness: 0.44,
            metalness: 0.06,
            clearcoat: 0.52,
            clearcoatRoughness: 0.26,
          })
        : new THREE.MeshStandardMaterial({
            map: floorTex,
            normalMap: floorNormal,
            normalScale: new THREE.Vector2(1.12, 1.12),
            roughnessMap: floorRough,
            aoMap: textures.roomAO,
            aoMapIntensity: 1.25,
            color: new THREE.Color(tpl.floorColor).lerp(new THREE.Color(0xffffff), 0.65),
            roughness: floorKind === 'stone' ? 0.94 : 0.74,
            metalness: 0.02,
          })
    );
    bundle.floorMats.set(floorKey, floorMat);
  }

  const floorTop = new THREE.Mesh(getRoomFloorGeo(), floorMat);
  floorTop.rotation.x = -Math.PI / 2;
  floorTop.position.y = 0.012;
  floorTop.receiveShadow = true;
  floorTop.userData = {
    kind: 'room_floor',
    roomId: room.id,
    label: room.name,
  };
  group.add(floorTop);
  hitProxies.push(floorTop);

  // Baked architectural corner/wall-base AO multiply plane
  const aoOverlay = new THREE.Mesh(
    getPlaneGeo(ROOM_SIZE - 0.16, ROOM_SIZE - 0.16),
    bundle.aoOverlayMat
  );
  aoOverlay.rotation.x = -Math.PI / 2;
  aoOverlay.position.y = 0.018;
  group.add(aoOverlay);

  // Decorative worn Persian rug in warm interior rooms
  if (
    [
      'foyer',
      'library',
      'parlor',
      'bedroom',
      'nursery',
      'music',
      'dining',
      'gallery',
      'taxidermy',
      'quarters',
    ].includes(tpl.geometry)
  ) {
    const rug = new THREE.Mesh(getPlaneGeo(4.9, 3.7), bundle.rugMat);
    rug.rotation.x = -Math.PI / 2;
    rug.position.y = 0.026;
    rug.receiveShadow = true;
    group.add(rug);
  }

  // 2. Collect room-level darkWood & brass architectural trim (plinth, pilasters, clasps, dado sills)
  //    and batch into just 3 InstancedMeshes instead of 36+ individual draw calls!
  const half = ROOM_SIZE / 2;
  const cornerOffset = ROOM_SIZE / 2 + 0.02;
  const roomDarkWoodSpecs: BoxInstanceSpec[] = [
    // Lower plinth base molding
    { x: 0, y: -0.375, z: 0, sx: ROOM_SIZE + 0.14, sy: 0.075, sz: ROOM_SIZE + 0.14 },
  ];
  const roomBrassBoxSpecs: BoxInstanceSpec[] = [];
  const roomBrassRivetSpecs: GeoInstanceSpec[] = [];

  [
    [-cornerOffset, -cornerOffset],
    [cornerOffset, -cornerOffset],
    [-cornerOffset, cornerOffset],
    [cornerOffset, cornerOffset],
  ].forEach(([cx, cz]) => {
    roomBrassBoxSpecs.push({ x: cx, y: -0.2, z: cz, sx: 0.18, sy: 0.42, sz: 0.18 });
  });

  [
    [-half + 0.16, -half + 0.16],
    [half - 0.16, -half + 0.16],
    [-half + 0.16, half - 0.16],
    [half - 0.16, half - 0.16],
  ].forEach(([cx, cz]) => {
    roomDarkWoodSpecs.push({ x: cx, y: 0.24, z: cz, sx: 0.32, sy: 0.48, sz: 0.32 });
    roomBrassBoxSpecs.push({ x: cx, y: 0.49, z: cz, sx: 0.37, sy: 0.045, sz: 0.37 });
    roomBrassRivetSpecs.push({ x: cx, y: 0.525, z: cz });
  });

  // 3. Four Architectural Cutaway Walls with Raised-Panel Victorian Wainscoting, Windows & Doors
  const wallT = 0.24;
  const dadoH = 0.34;
  const upperH = ROOM_HEIGHT - dadoH;
  const doorW = 2.05;
  const doorH = 2.95;
  const isGlasshouse = tpl.geometry === 'conservatory';
  const isStoneCellar =
    room.floor === -1 ||
    tpl.geometry === 'cellar' ||
    tpl.geometry === 'boiler' ||
    tpl.geometry === 'flooded' ||
    tpl.geometry === 'vault' ||
    tpl.geometry === 'passage';
  const hasFeatureOnNorthWall = [
    'gallery',
    'chapel',
    'mirror',
    'library',
    'archive',
    'clockwork',
    'taxidermy',
    'vault',
  ].includes(tpl.geometry);

  const dirConfigs: {
    dir: Direction;
    pos: [number, number, number];
    rotY: number;
    normal: THREE.Vector3;
  }[] = [
    { dir: 'N', pos: [0, 0, -half + wallT / 2], rotY: 0, normal: new THREE.Vector3(0, 0, -1) },
    { dir: 'S', pos: [0, 0, half - wallT / 2], rotY: Math.PI, normal: new THREE.Vector3(0, 0, 1) },
    { dir: 'E', pos: [half - wallT / 2, 0, 0], rotY: -Math.PI / 2, normal: new THREE.Vector3(1, 0, 0) },
    { dir: 'W', pos: [-half + wallT / 2, 0, 0], rotY: Math.PI / 2, normal: new THREE.Vector3(-1, 0, 0) },
  ];

  const walls = {} as Record<Direction, WallFadeEntry>;
  let placedMoonWindow = false;
  const wallColorTinted = new THREE.Color(tpl.wallColor).lerp(
    new THREE.Color(0xffffff),
    isStoneCellar ? 0.55 : 0.45
  );

  for (const cfg of dirConfigs) {
    const hasDoor = room.doors.includes(cfg.dir);
    const isConnected = Boolean(room.connectedTo[cfg.dir]);
    const isLocked = room.lockedDirections?.includes(cfg.dir) ?? false;

    const wallAnchor = new THREE.Group();
    wallAnchor.position.set(cfg.pos[0], cfg.pos[1], cfg.pos[2]);
    wallAnchor.rotation.y = cfg.rotY;
    group.add(wallAnchor);

    // Helper to project wall-local dado coords into room-local coordinates for batching
    const cosY = Math.cos(cfg.rotY);
    const sinY = Math.sin(cfg.rotY);
    const pushWallDado = (
      target: BoxInstanceSpec[],
      lx: number,
      ly: number,
      lz: number,
      sx: number,
      sy: number,
      sz: number
    ) => {
      target.push({
        x: cfg.pos[0] + lx * cosY + lz * sinY,
        y: cfg.pos[1] + ly,
        z: cfg.pos[2] - lx * sinY + lz * cosY,
        sx,
        sy,
        sz,
        ry: cfg.rotY,
      });
    };

    // Permanent stepped dado sill (batched into room-level darkWood & brass InstancedMeshes!)
    const sillW = hasDoor ? (ROOM_SIZE - doorW) / 2 : ROOM_SIZE;
    if (hasDoor) {
      [-1, 1].forEach((side) => {
        const sx = side * (doorW / 2 + sillW / 2);
        pushWallDado(roomDarkWoodSpecs, sx, dadoH / 2, 0, sillW, dadoH, wallT);
        pushWallDado(roomDarkWoodSpecs, sx, 0.05, 0, sillW, 0.1, wallT + 0.05);
        pushWallDado(roomBrassBoxSpecs, sx, dadoH + 0.02, 0, sillW + 0.02, 0.04, wallT + 0.05);
      });
      pushWallDado(roomBrassBoxSpecs, 0, 0.019, 0, doorW, 0.038, wallT + 0.18);
    } else {
      pushWallDado(roomDarkWoodSpecs, 0, dadoH / 2, 0, ROOM_SIZE, dadoH, wallT);
      pushWallDado(roomDarkWoodSpecs, 0, 0.05, 0, ROOM_SIZE, 0.1, wallT + 0.05);
      pushWallDado(roomBrassBoxSpecs, 0, dadoH + 0.02, 0, ROOM_SIZE, 0.04, wallT + 0.05);
    }

    // Upper disappearing wall assembly — OPAQUE-FIRST PBR materials (switches transparent ONLY while fading!)
    const upperGroup = new THREE.Group();
    wallAnchor.add(upperGroup);

    const wallInteriorMat = new THREE.MeshStandardMaterial({
      map: isStoneCellar ? textures.stoneFloor : textures.wallpaper,
      normalMap: isStoneCellar ? textures.stoneNormal : textures.wallpaperNormal,
      normalScale: new THREE.Vector2(0.95, 0.95),
      roughnessMap: isStoneCellar ? textures.stoneRough : textures.wallpaperRough,
      color: wallColorTinted,
      roughness: isStoneCellar ? 0.92 : 0.85,
      transparent: isGlasshouse,
      opacity: isGlasshouse ? 0.28 : 1,
    });
    const wallTrimMat = new THREE.MeshStandardMaterial({
      map: textures.furnitureWood,
      normalMap: textures.furnitureWoodNormal,
      roughnessMap: textures.furnitureWoodRough,
      color: isGlasshouse ? 0x2a3330 : 0x6f523e,
      roughness: isGlasshouse ? 0.48 : 0.72,
      metalness: isGlasshouse ? 0.65 : 0.05,
      transparent: false,
      opacity: 1,
    });
    const wallBrassMat = new THREE.MeshStandardMaterial({
      map: textures.patinaBrass,
      roughnessMap: textures.patinaBrassRough,
      color: 0xd8b166,
      metalness: 0.86,
      roughness: 0.42,
      transparent: false,
      opacity: 1,
    });
    const fadeMats: THREE.Material[] = [wallInteriorMat, wallTrimMat, wallBrassMat];

    // Collect static upper-wall trim boxes into 1 InstancedMesh per wall!
    const upperTrimSpecs: BoxInstanceSpec[] = [
      // Stepped Victorian crown cornice molding along top of upper wall
      { x: 0, y: ROOM_HEIGHT - 0.14, z: 0, sx: ROOM_SIZE + 0.04, sy: 0.09, sz: wallT + 0.08 },
      { x: 0, y: ROOM_HEIGHT - 0.05, z: 0, sx: ROOM_SIZE + 0.1, sy: 0.11, sz: wallT + 0.15 },
    ];

    if (hasDoor) {
      const segW = (ROOM_SIZE - doorW) / 2;
      const segGeo = getBoxGeo(segW, upperH, wallT);
      [-1, 1].forEach((side) => {
        const sx = side * (doorW / 2 + segW / 2);
        const seg = new THREE.Mesh(segGeo, wallInteriorMat);
        seg.position.set(sx, dadoH + upperH / 2, 0);
        seg.receiveShadow = true;
        seg.castShadow = true;
        upperGroup.add(seg);

        if (!isStoneCellar && !isGlasshouse) {
          upperTrimSpecs.push(
            { x: sx, y: dadoH + 0.46, z: 0, sx: segW - 0.14, sy: 0.92, sz: wallT + 0.06 },
            { x: sx, y: dadoH + 0.94, z: 0, sx: segW, sy: 0.07, sz: wallT + 0.1 }
          );
        }
      });

      const lintelH = ROOM_HEIGHT - doorH;
      const lintel = new THREE.Mesh(getBoxGeo(doorW + 0.24, lintelH, wallT), wallInteriorMat);
      lintel.position.set(0, doorH + lintelH / 2, 0);
      upperGroup.add(lintel);

      // Molded mahogany door jambs + stepped pediment lintel (batched into upperTrimSpecs)
      upperTrimSpecs.push(
        { x: -doorW / 2, y: doorH / 2, z: 0, sx: 0.18, sy: doorH, sz: wallT + 0.12 },
        { x: doorW / 2, y: doorH / 2, z: 0, sx: 0.18, sy: doorH, sz: wallT + 0.12 },
        { x: 0, y: doorH + 0.08, z: 0, sx: doorW + 0.48, sy: 0.22, sz: wallT + 0.18 },
        { x: 0, y: doorH + 0.22, z: 0, sx: doorW + 0.58, sy: 0.08, sz: wallT + 0.25 }
      );
      const headerBrass = new THREE.Mesh(
        getBoxGeo(doorW + 0.48, 0.036, wallT + 0.2),
        wallBrassMat
      );
      headerBrass.position.set(0, doorH + 0.27, 0);
      upperGroup.add(headerBrass);

      // Sculpted 4-Panel Mahogany Door Leaf (5 wood boxes -> 1 batch; hinges & handles batched!)
      const doorPivot = new THREE.Group();
      doorPivot.position.set(-doorW / 2 + 0.1, 0, 0);
      const leafW = doorW - 0.2;
      const leafH = doorH - 0.08;
      const doorWoodBatch = makeBoxBatch(
        [
          { x: leafW / 2, y: leafH / 2, z: 0, sx: leafW, sy: leafH, sz: 0.095 },
          { x: leafW * 0.28, y: leafH * 0.72, z: 0, sx: 0.54, sy: 0.92, sz: 0.135 },
          { x: leafW * 0.72, y: leafH * 0.72, z: 0, sx: 0.54, sy: 0.92, sz: 0.135 },
          { x: leafW * 0.28, y: leafH * 0.28, z: 0, sx: 0.54, sy: 0.88, sz: 0.135 },
          { x: leafW * 0.72, y: leafH * 0.28, z: 0, sx: 0.54, sy: 0.88, sz: 0.135 },
        ],
        wallTrimMat,
        true
      );
      const hingesBatch = makeGeoBatch(
        getCylGeo(0.022, 0.022, 0.14, 8),
        [
          { x: 0.02, y: 0.48, z: 0.055 },
          { x: 0.02, y: 1.48, z: 0.055 },
          { x: 0.02, y: 2.42, z: 0.055 },
        ],
        wallBrassMat
      );
      const plate = new THREE.Mesh(getBoxGeo(0.09, 0.28, 0.12), wallBrassMat);
      plate.position.set(leafW - 0.16, 1.24, 0);
      const handlesBatch = makeGeoBatch(
        getSphereGeo(0.062, 10, 10),
        [
          { x: leafW - 0.16, y: 1.26, z: 0.095 },
          { x: leafW - 0.16, y: 1.26, z: -0.095 },
        ],
        wallBrassMat
      );

      doorPivot.add(doorWoodBatch, hingesBatch, plate, handlesBatch);
      const baseAngle = isConnected ? -1.32 : -0.14;
      doorPivot.rotation.y = baseAngle;
      upperGroup.add(doorPivot);
      doorPivots[cfg.dir] = doorPivot;
      doorBaseAngles[cfg.dir] = baseAngle;

      // Always-visible warm threshold light spill & subtle brass signet arrow on floor
      if (!isConnected && !isLocked) {
        const beacon = new THREE.Group();
        beacon.position.set(0, 0.035, 0.52);

        const spill = new THREE.Mesh(getPlaneGeo(2.2, 1.5), bundle.unexploredSpillMat);
        spill.rotation.x = -Math.PI / 2;
        spill.position.set(0, 0.01, 0.1);

        const crest = new THREE.Group();
        crest.position.set(0, 0.04, 0.08);
        const outerRing = new THREE.Mesh(getTorusGeo(0.32, 0.032, 10, 28), brassMat);
        outerRing.rotation.x = Math.PI / 2;
        const arrow = new THREE.Mesh(getConeGeo(0.14, 0.34, 4), brassMat);
        arrow.rotation.x = -Math.PI / 2;
        arrow.position.set(0, 0.03, -0.04);
        crest.add(outerRing, arrow);

        beacon.add(spill, crest);
        wallAnchor.add(beacon);
        unexploredBeacons[cfg.dir] = beacon;
        unexploredBeaconCrests.push(crest);

        const proxy = new THREE.Mesh(getBoxGeo(doorW + 0.2, 2.35, 1.25), _invisibleRayMat);
        proxy.position.set(0, 1.15, 0.38);
        proxy.userData = {
          kind: 'unexplored_door',
          roomId: room.id,
          direction: cfg.dir,
          label: `Open ${cfg.dir} Door · 1 AP`,
          hoverVisual: crest,
          doorPivot,
          doorBaseAngle: baseAngle,
        };
        wallAnchor.add(proxy);
        hitProxies.push(proxy);
      } else if (isConnected) {
        const proxy = new THREE.Mesh(getBoxGeo(doorW, 2.1, 0.95), _invisibleRayMat);
        proxy.position.set(0, 1.05, 0.25);
        proxy.userData = {
          kind: 'connected_door',
          roomId: room.id,
          direction: cfg.dir,
          targetRoomId: room.connectedTo[cfg.dir],
          label: `Step Through ${cfg.dir} Door · 1 AP`,
        };
        wallAnchor.add(proxy);
        hitProxies.push(proxy);
      }
    } else {
      // Solid wall
      const seg = new THREE.Mesh(getBoxGeo(ROOM_SIZE, upperH, wallT), wallInteriorMat);
      seg.position.set(0, dadoH + upperH / 2, 0);
      seg.receiveShadow = true;
      seg.castShadow = !isGlasshouse;
      upperGroup.add(seg);

      if (isGlasshouse) {
        [-3.0, -1.5, 0, 1.5, 3.0].forEach((mx) => {
          upperTrimSpecs.push({ x: mx, y: dadoH + upperH / 2, z: 0, sx: 0.08, sy: upperH, sz: wallT + 0.04 });
        });
        [1.55, 2.85].forEach((my) => {
          upperTrimSpecs.push({ x: 0, y: my, z: 0, sx: ROOM_SIZE, sy: 0.07, sz: wallT + 0.04 });
        });
      } else if (!isStoneCellar) {
        upperTrimSpecs.push(
          { x: 0, y: dadoH + 0.94, z: 0, sx: ROOM_SIZE, sy: 0.075, sz: wallT + 0.1 },
          { x: 0, y: dadoH + 0.46, z: 0, sx: ROOM_SIZE - 0.1, sy: 0.92, sz: wallT + 0.04 },
          { x: -3.15, y: dadoH + 0.46, z: 0, sx: 1.75, sy: 0.66, sz: wallT + 0.085 },
          { x: -1.05, y: dadoH + 0.46, z: 0, sx: 1.75, sy: 0.66, sz: wallT + 0.085 },
          { x: 1.05, y: dadoH + 0.46, z: 0, sx: 1.75, sy: 0.66, sz: wallT + 0.085 },
          { x: 3.15, y: dadoH + 0.46, z: 0, sx: 1.75, sy: 0.66, sz: wallT + 0.085 }
        );
      }

      const canHaveWindow =
        !isGlasshouse &&
        !isStoneCellar &&
        room.floor >= 0 &&
        !(cfg.dir === 'N' && hasFeatureOnNorthWall) &&
        !(cfg.dir === 'S' && tpl.geometry === 'foyer');

      if (canHaveWindow && !placedMoonWindow) {
        placedMoonWindow = true;
        const win = buildGothicWindow(
          wallTrimMat,
          wallBrassMat,
          new THREE.Color(tpl.accentColor).multiplyScalar(0.55).getHex(),
          fadeMats,
          animatedProps,
          wallT
        );
        upperGroup.add(win);

        const moonPool = new THREE.Mesh(getPlaneGeo(2.35, 3.65), bundle.moonPoolMat);
        moonPool.rotation.x = -Math.PI / 2;
        moonPool.position.set(0, 0.028, 2.05);
        wallAnchor.add(moonPool);

        if (!isSoftwareGl) {
          const beamMat = new THREE.MeshBasicMaterial({
            map: textures.lightGlow,
            color: 0x8eb8f0,
            transparent: true,
            opacity: 0.11,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
            depthWrite: false,
          });
          beamMat.userData.alwaysTransparent = true;
          beamMat.userData.baseOpacity = 0.11;
          const moonShaft = new THREE.Mesh(getPlaneGeo(1.75, 3.65), beamMat);
          moonShaft.position.set(0, 1.55, 1.25);
          moonShaft.rotation.x = -0.62;
          upperGroup.add(moonShaft);
          fadeMats.push(beamMat);
        }
      } else if (!isGlasshouse) {
        // Warm brass wall sconce with glowing glass globe on non-window solid walls
        const sconceBatch = makeBoxBatch(
          [
            { x: 0, y: 2.55, z: wallT / 2 + 0.02, sx: 0.15, sy: 0.34, sz: 0.04 },
            { x: 0, y: 2.58, z: wallT / 2 + 0.08, sx: 0.04, sy: 0.04, sz: 0.12 },
          ],
          wallBrassMat
        );
        const sconceBulbMat = new THREE.MeshStandardMaterial({
          color: 0xffe8b0,
          emissive: 0xffb347,
          emissiveIntensity: 1.5,
          transparent: false,
          opacity: 1,
        });
        const sconceBulb = new THREE.Mesh(getSphereGeo(0.082, 10, 10), sconceBulbMat);
        sconceBulb.position.set(0, 2.67, wallT / 2 + 0.13);
        fadeMats.push(sconceBulbMat);
        upperGroup.add(sconceBatch, sconceBulb);
      }
    }

    // Commit all batched upper wall trim boxes in 1 draw call per wall!
    upperGroup.add(makeBoxBatch(upperTrimSpecs, wallTrimMat));

    // Full-height invisible raycast plane so hovering ANY wall smoothly dissolves it!
    const rayTarget = new THREE.Mesh(getBoxGeo(ROOM_SIZE, ROOM_HEIGHT, wallT + 0.35), _invisibleRayMat);
    rayTarget.position.set(0, ROOM_HEIGHT / 2, 0);
    rayTarget.userData = { wallRoomId: room.id, wallDirection: cfg.dir };
    wallAnchor.add(rayTarget);

    const wallWorldCenter = worldPos.clone().add(new THREE.Vector3(cfg.pos[0], ROOM_HEIGHT * 0.5, cfg.pos[2]));
    walls[cfg.dir] = {
      roomId: room.id,
      direction: cfg.dir,
      wallKey: `${room.id}:${cfg.dir}`,
      upperGroup,
      materials: fadeMats,
      rayTarget,
      outwardNormal: cfg.normal.clone(),
      worldCenter: wallWorldCenter,
      currentOpacity: 1,
      baseOpacity: isGlasshouse ? 0.28 : 1,
      isOpaqueDefault: !isGlasshouse,
      isTransparentActive: isGlasshouse,
      settled: true,
    };
  }

  // Commit batched room-level dado, plinth, pilasters, clasps, and rivets (3 draw calls total!)
  group.add(
    makeBoxBatch(roomDarkWoodSpecs, darkWoodMat, true, true),
    makeBoxBatch(roomBrassBoxSpecs, brassMat),
    makeGeoBatch(getSphereGeo(0.032, 8, 8), roomBrassRivetSpecs, brassMat)
  );

  // 4. Sculpted Room-Archetype Furniture & Architectural Centerpieces (All 25 Archetypes!)
  buildRoomFurnishings(
    tpl.geometry,
    room,
    group,
    woodMat,
    darkWoodMat,
    brassMat,
    velvetMat,
    textures,
    portraitEyes,
    animatedProps,
    hitProxies
  );

  // 5. Physical Brass-Bound Curio Chest for Unsearched Rooms
  if (!room.searched) {
    const chest = buildCurioChestProp(woodMat, brassMat, textures);
    chest.position.set(-2.55, 0.015, 2.35);
    chest.rotation.y = 0.42;
    group.add(chest);

    const searchProxy = new THREE.Mesh(getCylGeo(0.58, 0.58, 1.05, 10), _invisibleRayMat);
    searchProxy.position.set(-2.55, 0.52, 2.35);
    searchProxy.userData = {
      kind: 'search_room',
      roomId: room.id,
      label: `Search ${room.name} · 1 AP`,
      hoverVisual: chest,
    };
    group.add(searchProxy);
    hitProxies.push(searchProxy);
  }

  // 6. Antique Brass Spyglass Signet for Notable Room Interactables
  for (const obj of tpl.interactables) {
    const inspected = room.inspectedIds.includes(obj.id);
    const [ox, oy, oz] = obj.positionOffset;
    let markerVisual: THREE.Object3D | undefined;
    if (!inspected) {
      const marker = buildInspectableMarkerProp(brassMat, textures);
      marker.position.set(ox, Math.max(0.03, oy > 0.3 ? 0.03 : oy), oz);
      group.add(marker);
      markerVisual = marker;
    }

    const hit = new THREE.Mesh(getBoxGeo(1.18, 1.6, 1.18), _invisibleRayMat);
    hit.position.set(ox, 0.8, oz);
    hit.userData = {
      kind: 'interactable',
      roomId: room.id,
      interactableId: obj.id,
      label: inspected ? `${obj.name} (Examined)` : `Inspect ${obj.name} · 1 AP`,
      hoverVisual: markerVisual,
    };
    group.add(hit);
    hitProxies.push(hit);
  }

  // 7. Active Scenario Objective Relic Beacon
  const scenarioObj = getRoomScenarioBeaconInfo(room);
  if (scenarioObj) {
    const sb = new THREE.Group();
    sb.position.set(0, 0.06, 0);
    const ring = new THREE.Mesh(
      getTorusGeo(0.85, 0.045, 10, 32),
      new THREE.MeshStandardMaterial({
        color: scenarioObj.color,
        emissive: scenarioObj.color,
        emissiveIntensity: 1.4,
      })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.14;
    const spire = new THREE.Mesh(
      getOctaGeo(0.24, 0),
      new THREE.MeshStandardMaterial({
        color: scenarioObj.color,
        emissive: scenarioObj.color,
        emissiveIntensity: 1.5,
        roughness: 0.2,
        metalness: 0.7,
      })
    );
    spire.position.y = 1.55;
    addWarmHaloSprite(sb, textures, 1.8, 0, 1.4, 0, scenarioObj.color, 0.55);
    sb.add(ring, spire);
    animatedProps.push({ mesh: spire, kind: 'beacon' });
    group.add(sb);

    const scProxy = new THREE.Mesh(getCylGeo(0.95, 0.95, 2.2, 12), _invisibleRayMat);
    scProxy.position.set(0, 1.1, 0);
    scProxy.userData = {
      kind: 'scenario_objective',
      roomId: room.id,
      subAction: scenarioObj.subAction,
      label: scenarioObj.label,
      hoverVisual: spire,
    };
    group.add(scProxy);
    hitProxies.push(scProxy);
  }

  // 8. Pooled Candlelight Interior Light Spec (assigned dynamically to MansionSceneManager's fixed PointLight pool!)
  const baseLightIntensity = isSoftwareGl ? tpl.lightIntensity * 1.45 : tpl.lightIntensity * 2.1;
  const lightSpec: RoomLightSpec | null = room.darkened
    ? null
    : {
        color: new THREE.Color(tpl.lightColor).getHex(),
        baseIntensity: baseLightIntensity,
      };

  return {
    roomId: room.id,
    floor: room.floor,
    worldPos,
    group,
    walls,
    doorPivots,
    doorBaseAngles,
    unexploredBeacons,
    unexploredBeaconCrests,
    hoverBorderMesh,
    hoverBorderMat,
    roomLight: null,
    lightSpec,
    baseLightIntensity,
    portraitEyes,
    animatedProps,
    hitProxies,
  };
}

function getRoomScenarioBeaconInfo(
  room: PlacedRoom
): { color: number; subAction: string; label: string } | null {
  if (room.hasAnchor && !room.anchorDisabled) {
    return { color: 0xe65a4f, subAction: 'disable_anchor', label: 'Sever House Seal Anchor · 1 AP' };
  }
  if (room.hasClockMechanism && !room.clockAligned) {
    return { color: 0xf2bf5c, subAction: 'align_clock', label: 'Align Clockwork Mechanism · 1 AP' };
  }
  if (room.hasReflectionProof && !room.reflectionGathered) {
    return { color: 0x7fd4c4, subAction: 'gather_proof', label: 'Gather True Reflection · 1 AP' };
  }
  if (room.isHeartChamber) {
    return { color: 0xd9463e, subAction: 'heart_quiet', label: 'Confront the Heart Beneath · 1 AP' };
  }
  return null;
}

function buildRoomFurnishings(
  geometry: string,
  room: PlacedRoom,
  group: THREE.Group,
  woodMat: THREE.Material,
  darkWoodMat: THREE.Material,
  brassMat: THREE.Material,
  velvetMat: THREE.Material,
  textures: ProceduralTextures,
  portraitEyes: THREE.Group[],
  animatedProps: BuiltRoomRefs['animatedProps'],
  hitProxies: THREE.Object3D[]
): void {
  const bundle = getTextureMaterialBundle(textures);

  switch (geometry) {
    case 'foyer': {
      // Center marble pedestal with brass guest ledger & candelabra
      const ped = new THREE.Mesh(getBalusterGeo(), bundle.marblePedMat);
      ped.scale.set(5.2, 1.0, 5.2);
      ped.castShadow = true;
      const top = new THREE.Mesh(getCylGeo(0.72, 0.64, 0.09, 24), brassMat);
      top.position.y = 0.98;
      const cand = buildCandelabra(brassMat, textures, animatedProps);
      cand.position.y = 1.03;
      group.add(ped, top, cand, buildLoosePaperStack(0.32, 1.03, 0.18));
      addContactShadow(group, textures, 1.25, 0.024, 0.72);

      // Guest ledger lectern on west flank
      const lect = new THREE.Mesh(getBoxGeo(0.72, 0.95, 0.52), darkWoodMat);
      lect.position.set(-2.2, 0.475, 1.4);
      const bookOpen = new THREE.Mesh(getBoxGeo(0.56, 0.07, 0.38), _paperMat);
      bookOpen.position.set(-2.2, 0.99, 1.4);
      bookOpen.rotation.x = 0.22;
      group.add(lect, bookOpen);

      // Sealed heavy oak double front doors on south wall with brass knocker & transom fanlight
      const doorF = new THREE.Group();
      doorF.position.set(0, 0, 4.18);
      const oakDouble = new THREE.Mesh(getBoxGeo(2.35, 2.85, 0.14), darkWoodMat);
      oakDouble.position.y = 1.425;
      const centerBar = new THREE.Mesh(getBoxGeo(0.1, 2.85, 0.18), brassMat);
      centerBar.position.y = 1.425;
      const ironBolt = new THREE.Mesh(getBoxGeo(1.5, 0.08, 0.2), brassMat);
      ironBolt.position.y = 1.25;
      const fanlight = new THREE.Mesh(getCircleGeo(1.12, 18, 0, Math.PI), _fanlightMat);
      fanlight.rotation.y = Math.PI;
      fanlight.position.set(0, 2.95, -0.06);
      doorF.add(oakDouble, centerBar, ironBolt, fanlight);
      group.add(doorF);

      const portrait = buildPortraitFrame(brassMat, textures, portraitEyes, -0.04);
      portrait.position.set(-2.5, 2.35, -4.16);
      group.add(portrait);

      const chand = buildChandelier(brassMat, textures, animatedProps);
      chand.position.set(0, 3.45, 0);
      group.add(chand);
      break;
    }

    case 'staircase': {
      // Grand Victorian Staircase with crimson runner, brass stair rods, angled handrails & glowing newel globes
      const stairGroup = new THREE.Group();
      const stepCount = 10;
      const stepSpecs: BoxInstanceSpec[] = [];
      const runnerSpecs: BoxInstanceSpec[] = [];
      const rodSpecs: GeoInstanceSpec[] = [];
      const balSpecs: GeoInstanceSpec[] = [];

      for (let i = 0; i < stepCount; i++) {
        const y = 0.18 + i * 0.32;
        const z = 1.95 - i * 0.4;
        stepSpecs.push({ x: 0, y, z, sx: 2.9, sy: 0.32, sz: 0.42 });
        runnerSpecs.push({ x: 0, y: y + 0.165, z, sx: 1.62, sy: 0.032, sz: 0.44 });
        rodSpecs.push({ x: 0, y: y + 0.015, z: z + 0.21, rz: Math.PI / 2 });

        if (i % 2 === 0) {
          balSpecs.push({ x: -1.36, y: y + 0.16, z });
          balSpecs.push({ x: 1.36, y: y + 0.16, z });
        }
      }

      stairGroup.add(
        makeBoxBatch(stepSpecs, woodMat, true, true),
        makeBoxBatch(runnerSpecs, velvetMat, false, false),
        makeGeoBatch(getCylGeo(0.016, 0.016, 1.7, 8), rodSpecs, brassMat, false, false),
        makeGeoBatch(getBalusterGeo(), balSpecs, woodMat, false, false)
      );

      // Sweeping continuous angled mahogany handrails along both sides
      const railGeo = getBoxGeo(0.11, 0.09, 4.9);
      const postGeo = getBoxGeo(0.22, 1.36, 0.22);
      const capGeo = getCylGeo(0.11, 0.13, 0.08, 12);
      const globeGeo = getSphereGeo(0.13, 12, 12);
      [-1.36, 1.36].forEach((hx) => {
        const rail = new THREE.Mesh(railGeo, darkWoodMat);
        rail.position.set(hx, 2.52, 0.15);
        rail.rotation.x = 0.67;
        stairGroup.add(rail);

        const post = new THREE.Mesh(postGeo, darkWoodMat);
        post.position.set(hx, 0.68, 2.15);
        post.castShadow = true;
        const cap = new THREE.Mesh(capGeo, brassMat);
        cap.position.set(hx, 1.39, 2.15);
        const globe = new THREE.Mesh(globeGeo, _newelGlobeMat);
        globe.position.set(hx, 1.54, 2.15);
        addWarmHaloSprite(stairGroup, textures, 0.9, hx, 1.56, 2.15, 0xffc466, 0.42);
        stairGroup.add(post, cap, globe);
      });

      addContactShadow(stairGroup, textures, 2.2, 0.022, 0.64);
      group.add(stairGroup);

      if (room.stairLinks.length > 0) {
        const stProxy = new THREE.Mesh(getBoxGeo(3.0, 2.9, 3.6), _invisibleRayMat);
        stProxy.position.set(0, 1.45, 0.2);
        stProxy.userData = {
          kind: 'staircase',
          roomId: room.id,
          stairLinks: room.stairLinks,
          label: `Use Grand Staircase · 1 AP`,
          hoverVisual: stairGroup,
        };
        group.add(stProxy);
        hitProxies.push(stProxy);
      }
      break;
    }

    case 'vestibule': {
      // SIGNATURE STARTING FEATURE: The Pendulum Vestibule!
      // Inlaid marble-and-brass compass rose medallion on the floor + giant suspended brass pendulum!
      const compass = new THREE.Mesh(getCircleGeo(2.65, 40), getCompassRoseMat());
      compass.rotation.x = -Math.PI / 2;
      compass.position.y = 0.028;
      group.add(compass);

      // Four slender carved walnut & brass arch piers framing the open pendulum well
      const colSpecs: GeoInstanceSpec[] = [
        { x: -2.35, y: 2.05, z: -2.35 },
        { x: 2.35, y: 2.05, z: -2.35 },
        { x: -2.35, y: 2.05, z: 2.35 },
        { x: 2.35, y: 2.05, z: 2.35 },
      ];
      const ringSpecs: GeoInstanceSpec[] = [
        { x: -2.35, y: 0.2, z: -2.35, rx: Math.PI / 2 },
        { x: 2.35, y: 0.2, z: -2.35, rx: Math.PI / 2 },
        { x: -2.35, y: 0.2, z: 2.35, rx: Math.PI / 2 },
        { x: 2.35, y: 0.2, z: 2.35, rx: Math.PI / 2 },
      ];
      group.add(
        makeGeoBatch(getCylGeo(0.14, 0.17, 4.1, 12), colSpecs, darkWoodMat, true, false),
        makeGeoBatch(getTorusGeo(0.19, 0.035, 8, 16), ringSpecs, brassMat, false, false)
      );

      // Overhead brass gimbal ring suspending the giant three-story pendulum
      const gimbal = new THREE.Mesh(getTorusGeo(1.45, 0.06, 10, 32), brassMat);
      gimbal.rotation.x = Math.PI / 2;
      gimbal.position.y = 4.05;
      group.add(gimbal);

      const giantPendPivot = new THREE.Group();
      giantPendPivot.position.set(0, 4.05, 0);
      const longRod = new THREE.Mesh(getCylGeo(0.028, 0.028, 3.15, 10), brassMat);
      longRod.position.y = -1.58;
      const lensBob = new THREE.Mesh(getSphereGeo(0.46, 22, 16), brassMat);
      lensBob.scale.set(1.0, 1.0, 0.34);
      lensBob.position.y = -3.12;
      lensBob.castShadow = true;
      const bobRim = new THREE.Mesh(getTorusGeo(0.47, 0.035, 10, 28), brassMat);
      bobRim.position.y = -3.12;
      const tipSpike = new THREE.Mesh(getConeGeo(0.06, 0.24, 8), brassMat);
      tipSpike.rotation.x = Math.PI;
      tipSpike.position.y = -3.62;
      giantPendPivot.add(longRod, lensBob, bobRim, tipSpike);
      addWarmHaloSprite(giantPendPivot, textures, 1.45, 0, -3.12, 0.12, 0x9cc8e6, 0.38);
      animatedProps.push({ mesh: giantPendPivot, kind: 'pendulum_giant' });
      group.add(giantPendPivot);
      addContactShadow(group, textures, 1.2, 0.025, 0.55);
      break;
    }

    case 'clockwork': {
      const clock = buildGrandfatherClock(woodMat, brassMat, textures, animatedProps);
      clock.position.set(0, 0, -2.65);
      group.add(clock);

      [
        [-2.0, 1.8, 1.08],
        [2.0, 1.8, 0.85],
        [-1.1, 2.7, 0.62],
        [1.15, 2.65, 0.72],
      ].forEach(([gx, gy, sc]) => {
        const gear = new THREE.Mesh(getGearGeo(), brassMat);
        gear.position.set(gx, gy, -4.05);
        gear.scale.setScalar(sc);
        group.add(gear);
        animatedProps.push({ mesh: gear, kind: 'gear' });
      });

      const bench = new THREE.Mesh(getBoxGeo(2.1, 0.1, 0.95), woodMat);
      bench.position.set(0, 0.84, 0.95);
      const legGeo = getBoxGeo(0.12, 0.84, 0.82);
      const legL = new THREE.Mesh(legGeo, darkWoodMat);
      legL.position.set(-0.9, 0.42, 0.95);
      const legR = new THREE.Mesh(legGeo, darkWoodMat);
      legR.position.set(0.9, 0.42, 0.95);
      group.add(bench, legL, legR, buildLoosePaperStack(0.25, 0.9, 0.95));
      break;
    }

    case 'library':
    case 'archive': {
      const b1 = buildBookshelf(woodMat, brassMat, animatedProps, textures, true);
      b1.position.set(-2.35, 0, -3.55);
      const b2 = buildBookshelf(woodMat, brassMat, animatedProps, textures, false);
      b2.position.set(2.35, 0, -3.55);
      group.add(b1, b2);

      const desk = new THREE.Mesh(getBoxGeo(2.15, 0.1, 1.12), woodMat);
      desk.position.set(0, 0.88, 0.3);
      desk.castShadow = true;
      desk.receiveShadow = true;
      const pedGeo = getBoxGeo(0.42, 0.84, 0.96);
      [-0.85, 0.85].forEach((dx) => {
        const ped = new THREE.Mesh(pedGeo, darkWoodMat);
        ped.position.set(dx, 0.42, 0.3);
        ped.castShadow = true;
        group.add(ped);
      });
      // Green-shaded Victorian banker's lamp on desk
      const lampBase = new THREE.Mesh(getCylGeo(0.11, 0.14, 0.06, 12), brassMat);
      lampBase.position.set(0.65, 0.96, 0.12);
      const lampStem = new THREE.Mesh(getCylGeo(0.02, 0.02, 0.34, 8), brassMat);
      lampStem.position.set(0.65, 1.13, 0.12);
      const lampShade = new THREE.Mesh(
        getCylGeo(0.11, 0.11, 0.32, 12, 1, false, 0, Math.PI),
        _bankerShadeMat
      );
      lampShade.rotation.z = Math.PI / 2;
      lampShade.position.set(0.65, 1.32, 0.12);
      addWarmHaloSprite(group, textures, 0.95, 0.65, 1.28, 0.12, 0x9ce8a8, 0.32);

      // Brass terrestrial globe on side stand
      const globeStand = new THREE.Mesh(getBalusterGeo(), woodMat);
      globeStand.scale.set(1.4, 0.85, 1.4);
      globeStand.position.set(2.45, 0, 1.45);
      const globeSphere = new THREE.Mesh(getSphereGeo(0.32, 18, 16), _globeSphereMat);
      globeSphere.position.set(2.45, 1.12, 1.45);
      const meridian = new THREE.Mesh(getTorusGeo(0.36, 0.022, 8, 24), brassMat);
      meridian.position.set(2.45, 1.12, 1.45);
      meridian.rotation.y = 0.5;

      const chair = buildVictorianChair(woodMat, velvetMat, textures);
      chair.position.set(0.08, 0, 1.22);
      chair.rotation.y = Math.PI - 0.18;
      group.add(
        desk,
        lampBase,
        lampStem,
        lampShade,
        globeStand,
        globeSphere,
        meridian,
        chair,
        buildLoosePaperStack(-0.35, 0.935, 0.35)
      );
      addContactShadow(group, textures, 1.65, 0.022, 0.72);
      break;
    }

    case 'nursery': {
      // Abandoned Nursery: Sculpted self-rocking wooden horse + wrought-iron crib + alphabet blocks!
      const rocker = new THREE.Group();
      rocker.position.set(-0.6, 0, 0.5);
      rocker.rotation.y = 0.45;
      const arcGeo = getTorusGeo(0.95, 0.032, 8, 22, Math.PI * 0.55);
      [-0.24, 0.24].forEach((rz) => {
        const arc = new THREE.Mesh(arcGeo, woodMat);
        arc.rotation.z = Math.PI * 1.22;
        arc.position.set(0, 0.96, rz);
        rocker.add(arc);
      });
      const hBody = new THREE.Mesh(getCylGeo(0.18, 0.18, 0.78, 12), woodMat);
      hBody.rotation.z = Math.PI / 2;
      hBody.position.set(0, 0.62, 0);
      const hNeck = new THREE.Mesh(getBoxGeo(0.18, 0.46, 0.18), woodMat);
      hNeck.position.set(0.34, 0.85, 0);
      hNeck.rotation.z = -0.35;
      const hHead = new THREE.Mesh(getBoxGeo(0.32, 0.18, 0.16), woodMat);
      hHead.position.set(0.5, 1.02, 0);
      hHead.rotation.z = -0.22;
      const saddle = new THREE.Mesh(getBoxGeo(0.28, 0.06, 0.38), velvetMat);
      saddle.position.set(0, 0.8, 0);
      rocker.add(
        makeGeoBatch(
          getCylGeo(0.032, 0.026, 0.52, 8),
          [
            { x: -0.28, y: 0.34, z: -0.18 },
            { x: 0.28, y: 0.34, z: -0.18 },
            { x: -0.28, y: 0.34, z: 0.18 },
            { x: 0.28, y: 0.34, z: 0.18 },
          ],
          woodMat
        )
      );
      rocker.add(hBody, hNeck, hHead, saddle);
      animatedProps.push({ mesh: rocker, kind: 'rocker' });
      group.add(rocker);

      // Victorian iron-spindle baby cradle
      const cribBase = new THREE.Mesh(getBoxGeo(1.55, 0.14, 0.92), _ironMat);
      cribBase.position.set(1.6, 0.45, -1.9);
      const mattress = new THREE.Mesh(getBoxGeo(1.45, 0.16, 0.84), _linenMat);
      mattress.position.set(1.6, 0.58, -1.9);
      const spindleSpecs: GeoInstanceSpec[] = [];
      for (let i = 0; i < 6; i++) {
        const sx = 0.9 + i * 0.28;
        spindleSpecs.push({ x: sx, y: 0.82, z: -2.35 });
        spindleSpecs.push({ x: sx, y: 0.82, z: -1.45 });
      }
      group.add(
        cribBase,
        mattress,
        makeGeoBatch(getCylGeo(0.015, 0.015, 0.95, 6), spindleSpecs, _ironMat)
      );

      // Scattered toy blocks (batched color-instanced mesh)
      group.add(
        makeBoxBatch(
          [
            { x: -1.8, y: 0.11, z: -1.1, sx: 0.2, sy: 0.2, sz: 0.2, ry: -3.6, color: 0x8b3a3a },
            { x: -1.52, y: 0.11, z: -0.92, sx: 0.2, sy: 0.2, sz: 0.2, ry: -3.04, color: 0x3b5978 },
            { x: -1.68, y: 0.31, z: -1.02, sx: 0.2, sy: 0.2, sz: 0.2, ry: -3.36, color: 0xc49c48 },
          ],
          _bookInstancedMat
        )
      );
      addContactShadow(group, textures, 1.5, 0.022, 0.62);
      break;
    }

    case 'dining': {
      const table = buildDiningTable(woodMat, velvetMat, brassMat, animatedProps, textures);
      group.add(table);
      const chand = buildChandelier(brassMat, textures, animatedProps);
      chand.position.set(0, 3.45, 0);
      group.add(chand);
      break;
    }

    case 'music':
    case 'ballroom': {
      const piano = buildGrandPiano(brassMat, textures);
      piano.position.set(-0.4, 0, -0.4);
      piano.rotation.y = 0.35;
      group.add(piano);
      const chand = buildChandelier(brassMat, textures, animatedProps);
      chand.position.set(0, 3.55, 0);
      group.add(chand);
      break;
    }

    case 'gallery': {
      [
        [-2.45, 0.04],
        [0, -0.025],
        [2.45, 0.05],
      ].forEach(([px, tilt]) => {
        const p = buildPortraitFrame(brassMat, textures, portraitEyes, tilt);
        p.position.set(px, 2.25, -4.15);
        group.add(p);
      });
      const bench = new THREE.Mesh(getBoxGeo(2.6, 0.16, 0.78), velvetMat);
      bench.position.set(0, 0.56, 0.4);
      bench.castShadow = true;
      group.add(
        bench,
        makeGeoBatch(
          getCylGeo(0.04, 0.025, 0.52, 10),
          [
            { x: -1.1, y: 0.26, z: 0.12 },
            { x: -1.1, y: 0.26, z: 0.68 },
            { x: 1.1, y: 0.26, z: 0.12 },
            { x: 1.1, y: 0.26, z: 0.68 },
          ],
          woodMat
        )
      );
      addContactShadow(group, textures, 1.55, 0.022, 0.68);
      break;
    }

    case 'chapel': {
      const rose = new THREE.Mesh(getCircleGeo(1.48, 32), bundle.stainedGlassMat);
      rose.position.set(0, 2.6, -4.15);
      const roseFrame = new THREE.Mesh(getTorusGeo(1.52, 0.08, 12, 32), darkWoodMat);
      roseFrame.position.set(0, 2.6, -4.14);

      // Colored stained-glass light pool projected across the chapel aisle!
      const stainPool = new THREE.Mesh(getPlaneGeo(3.2, 3.6), bundle.stainPoolMat);
      stainPool.rotation.x = -Math.PI / 2;
      stainPool.position.set(0, 0.028, -0.35);

      const altar = new THREE.Mesh(getBoxGeo(2.4, 1.05, 0.95), bundle.marblePedMat);
      altar.position.set(0, 0.525, -2.75);
      altar.castShadow = true;
      const cloth = new THREE.Mesh(getBoxGeo(2.46, 0.08, 1.02), velvetMat);
      cloth.position.set(0, 1.05, -2.75);
      const candL = buildCandleStick(brassMat, textures, animatedProps);
      candL.position.set(-0.85, 1.09, -2.75);
      const candR = buildCandleStick(brassMat, textures, animatedProps);
      candR.position.set(0.85, 1.09, -2.75);

      // Carved oak chapel pews flanking the aisle (batched into 2 InstancedMeshes)
      const pewSeatSpecs: BoxInstanceSpec[] = [];
      const pewBackSpecs: BoxInstanceSpec[] = [];
      [-1.75, 1.75].forEach((px) => {
        [0.45, 1.85].forEach((pz) => {
          pewSeatSpecs.push({ x: px, y: 0.48, z: pz, sx: 1.75, sy: 0.09, sz: 0.5 });
          pewBackSpecs.push({ x: px, y: 0.78, z: pz + 0.22, sx: 1.75, sy: 0.62, sz: 0.08 });
        });
      });

      group.add(
        rose,
        roseFrame,
        stainPool,
        altar,
        cloth,
        candL,
        candR,
        makeBoxBatch(pewSeatSpecs, woodMat),
        makeBoxBatch(pewBackSpecs, darkWoodMat)
      );
      addContactShadow(group, textures, 1.55, 0.022, 0.65);
      break;
    }

    case 'cellar': {
      // Wine Cellar: Stacked oak wine barrels on timber cradles + bottle cubby racks!
      const barrelCoords: [number, number, number][] = [
        [-2.35, -2.6, 0],
        [-2.35, -1.1, 0],
        [-2.35, -1.85, 0.92],
        [2.35, -2.6, 0],
        [2.35, -1.1, 0],
      ];
      const bodySpecs: GeoInstanceSpec[] = [];
      const hoopSpecs: GeoInstanceSpec[] = [];
      const tapSpecs: GeoInstanceSpec[] = [];
      barrelCoords.forEach(([bx, bz, by]) => {
        const cy = 0.58 + by;
        bodySpecs.push({ x: bx, y: cy, z: bz, rz: Math.PI / 2 });
        hoopSpecs.push({ x: bx - 0.36, y: cy, z: bz, ry: Math.PI / 2 });
        hoopSpecs.push({ x: bx + 0.36, y: cy, z: bz, ry: Math.PI / 2 });
        tapSpecs.push({ x: bx + (bx < 0 ? 0.62 : -0.62), y: cy - 0.1, z: bz, rz: Math.PI / 2 });
      });

      const rack = new THREE.Mesh(getBoxGeo(2.2, 2.2, 0.62), darkWoodMat);
      rack.position.set(0, 1.1, -3.65);
      const bottleSpecs: GeoInstanceSpec[] = [];
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 5; c++) {
          bottleSpecs.push({
            x: -0.76 + c * 0.38,
            y: 0.55 + r * 0.55,
            z: -3.4,
            rx: Math.PI / 2,
          });
        }
      }

      group.add(
        makeGeoBatch(getCylGeo(0.46, 0.46, 1.15, 16), bodySpecs, woodMat, true, false),
        makeGeoBatch(getTorusGeo(0.47, 0.025, 6, 18), hoopSpecs, _ironMat),
        makeGeoBatch(getCylGeo(0.03, 0.03, 0.18, 8), tapSpecs, brassMat),
        rack,
        makeGeoBatch(getCylGeo(0.06, 0.06, 0.34, 8), bottleSpecs, _bottleMat)
      );
      addContactShadow(group, textures, 1.8, 0.022, 0.68);
      break;
    }

    case 'boiler': {
      // Boiler Room: Riveted cast-iron cylindrical furnace boiler + glowing coal grate + copper steam pipes!
      const furnace = new THREE.Mesh(getCylGeo(1.15, 1.18, 2.85, 20), _ironMat);
      furnace.rotation.z = Math.PI / 2;
      furnace.position.set(0, 1.38, -2.05);
      furnace.castShadow = true;

      const grate = new THREE.Mesh(getBoxGeo(0.92, 0.72, 0.18), _boilerGrateMat);
      grate.position.set(0, 0.92, -0.88);
      const fireHalo = addWarmHaloSprite(
        group,
        textures,
        2.35,
        0,
        0.96,
        -0.65,
        0xff7a29,
        0.62,
        true
      );
      animatedProps.push({ mesh: fireHalo, kind: 'halo' });

      // Overhead copper steam pipes & brass wheel valve
      const pipeGeo = getCylGeo(0.11, 0.11, 2.4, 12);
      [-1.05, 0.95].forEach((px) => {
        const pipe = new THREE.Mesh(pipeGeo, _copperMat);
        pipe.position.set(px, 2.95, -2.05);
        group.add(pipe);
      });
      const mainPipe = new THREE.Mesh(getCylGeo(0.13, 0.13, 6.2, 12), _copperMat);
      mainPipe.rotation.z = Math.PI / 2;
      mainPipe.position.set(0, 3.65, -2.05);
      const valve = new THREE.Mesh(getTorusGeo(0.24, 0.032, 8, 16), brassMat);
      valve.position.set(1.55, 1.4, -1.05);
      animatedProps.push({ mesh: valve, kind: 'gear' });

      group.add(furnace, grate, mainPipe, valve);
      addContactShadow(group, textures, 2.1, 0.022, 0.74);
      break;
    }

    case 'laboratory': {
      // Sealed Laboratory: Slate alchemical workbench + glowing glass retorts & bell jars!
      const bench = new THREE.Mesh(getBoxGeo(3.4, 0.12, 1.35), _slateMat);
      bench.position.set(0, 0.94, -0.35);
      bench.castShadow = true;
      const legGeo = getBoxGeo(0.24, 0.92, 1.1);
      [-1.4, 1.4].forEach((lx) => {
        const leg = new THREE.Mesh(legGeo, darkWoodMat);
        leg.position.set(lx, 0.46, -0.35);
        group.add(leg);
      });
      group.add(bench);

      // Glowing emerald, amber, and spectral-cyan apothecary flasks
      const neckSpecs: GeoInstanceSpec[] = [];
      [
        [-1.0, 0x3bd48a, 0.22],
        [-0.35, 0xf2b346, 0.17],
        [0.45, 0x5ccfe6, 0.25],
        [1.05, 0xb968e6, 0.18],
      ].forEach(([fx, col, rad]) => {
        const flask = new THREE.Mesh(getSphereGeo(rad, 14, 14), getSharedFlaskMat(col));
        flask.position.set(fx, 1.02 + rad, -0.35);
        group.add(flask);
        neckSpecs.push({ x: fx, y: 1.08 + rad * 2, z: -0.35 });
      });
      group.add(makeGeoBatch(getCylGeo(0.04, 0.06, 0.22, 10), neckSpecs, brassMat));
      addWarmHaloSprite(group, textures, 1.6, 0.15, 1.35, -0.35, 0x62e0b4, 0.42);
      addContactShadow(group, textures, 2.0, 0.022, 0.72);
      break;
    }

    case 'parlor': {
      // Funeral Parlor: Polished mahogany velvet-lined casket on trestle biers + 4 tall funeral tapers
      const bierGeo = getBoxGeo(0.22, 0.65, 1.15);
      const bierL = new THREE.Mesh(bierGeo, darkWoodMat);
      bierL.position.set(-0.95, 0.325, -0.35);
      const bierR = new THREE.Mesh(bierGeo, darkWoodMat);
      bierR.position.set(0.95, 0.325, -0.35);
      const casket = new THREE.Mesh(getBoxGeo(2.75, 0.56, 1.05), darkWoodMat);
      casket.position.set(0, 0.92, -0.35);
      casket.castShadow = true;
      const lidTrim = new THREE.Mesh(getBoxGeo(2.82, 0.08, 1.12), brassMat);
      lidTrim.position.set(0, 1.21, -0.35);
      const lining = new THREE.Mesh(getBoxGeo(2.55, 0.06, 0.88), velvetMat);
      lining.position.set(0, 1.25, -0.35);
      group.add(bierL, bierR, casket, lidTrim, lining);

      const standSpecs: GeoInstanceSpec[] = [];
      [
        [-1.8, -1.2],
        [1.8, -1.2],
        [-1.8, 0.5],
        [1.8, 0.5],
      ].forEach(([tx, tz]) => {
        standSpecs.push({ x: tx, y: 0.625, z: tz });
        const c = buildCandleStick(brassMat, textures, animatedProps);
        c.position.set(tx, 1.24, tz);
        group.add(c);
      });
      group.add(makeGeoBatch(getCylGeo(0.035, 0.14, 1.25, 10), standSpecs, brassMat));
      addContactShadow(group, textures, 2.0, 0.022, 0.72);
      break;
    }

    case 'taxidermy': {
      // Taxidermy Room: Sculpted antlered stag trophy shield + glass curiosity display cases
      const shield = new THREE.Mesh(getCylGeo(0.48, 0.32, 0.1, 6), darkWoodMat);
      shield.rotation.x = Math.PI / 2;
      shield.position.set(0, 2.45, -4.16);
      const stagHead = new THREE.Mesh(getConeGeo(0.24, 0.65, 8), woodMat);
      stagHead.rotation.x = Math.PI / 2.2;
      stagHead.position.set(0, 2.42, -3.85);
      const antlerGeo = getCylGeo(0.022, 0.04, 0.92, 6);
      const tineGeo = getCylGeo(0.014, 0.025, 0.42, 6);
      [-1, 1].forEach((side) => {
        const antler = new THREE.Mesh(antlerGeo, brassMat);
        antler.position.set(side * 0.34, 2.86, -3.82);
        antler.rotation.z = -side * 0.55;
        const tine = new THREE.Mesh(tineGeo, brassMat);
        tine.position.set(side * 0.42, 3.05, -3.72);
        tine.rotation.z = -side * 0.18;
        group.add(antler, tine);
      });
      group.add(shield, stagHead);

      // Pair of glass-domed botanical/curiosity cabinets
      const cabGeo = getBoxGeo(0.95, 1.15, 0.95);
      const domeGeo = getCylGeo(0.36, 0.36, 0.72, 16);
      const specGeo = getOctaGeo(0.18, 0);
      [-2.1, 2.1].forEach((cx) => {
        const cab = new THREE.Mesh(cabGeo, darkWoodMat);
        cab.position.set(cx, 0.575, -1.8);
        const dome = new THREE.Mesh(domeGeo, _glassDomeMat);
        dome.position.set(cx, 1.52, -1.8);
        const specimen = new THREE.Mesh(specGeo, brassMat);
        specimen.position.set(cx, 1.42, -1.8);
        group.add(cab, dome, specimen);
      });
      const ch = buildVictorianChair(woodMat, velvetMat, textures);
      ch.position.set(0, 0, 1.15);
      ch.rotation.y = Math.PI + 0.15;
      group.add(ch);
      break;
    }

    case 'vault': {
      // Locked Vault: Massive circular spoked steel vault door + brass wheel + relic plinth
      const doorDisc = new THREE.Mesh(getCylGeo(1.45, 1.45, 0.24, 28), _steelMat);
      doorDisc.rotation.x = Math.PI / 2;
      doorDisc.position.set(0, 1.75, -4.05);
      const wheel = new THREE.Mesh(getTorusGeo(0.58, 0.06, 10, 24), brassMat);
      wheel.position.set(0, 1.75, -3.86);
      animatedProps.push({ mesh: wheel, kind: 'gear' });
      const plinth = new THREE.Mesh(getBoxGeo(1.1, 1.05, 1.1), darkWoodMat);
      plinth.position.set(0, 0.525, 0.2);
      const cushion = new THREE.Mesh(getBoxGeo(0.92, 0.12, 0.92), velvetMat);
      cushion.position.set(0, 1.1, 0.2);
      group.add(doorDisc, wheel, plinth, cushion);
      addContactShadow(group, textures, 1.2, 0.022, 0.72);
      break;
    }

    case 'observatory': {
      const plinth = new THREE.Mesh(getCylGeo(0.62, 0.78, 0.95, 20), darkWoodMat);
      plinth.position.y = 0.475;
      plinth.castShadow = true;
      const astrolabe = new THREE.Group();
      astrolabe.position.y = 1.75;
      const astRingGeo = getTorusGeo(0.68, 0.032, 10, 32);
      [0, Math.PI / 3, (Math.PI * 2) / 3].forEach((rot) => {
        const ring = new THREE.Mesh(astRingGeo, brassMat);
        ring.rotation.set(rot, rot * 0.7, 0);
        astrolabe.add(ring);
      });
      const core = new THREE.Mesh(getSphereGeo(0.16, 16, 16), brassMat);
      astrolabe.add(core);
      animatedProps.push({ mesh: astrolabe, kind: 'astrolabe' });

      // Equatorial brass telescope on tripod
      const scope = new THREE.Mesh(getCylGeo(0.1, 0.16, 2.25, 16), brassMat);
      scope.position.set(2.15, 1.9, -1.6);
      scope.rotation.set(-0.55, 0.35, 0);
      const tripod = new THREE.Mesh(getCylGeo(0.06, 0.45, 1.45, 3), darkWoodMat);
      tripod.position.set(2.15, 0.72, -1.6);

      // Arched brass observatory dome ribs overhead
      const ribGeo = getTorusGeo(4.1, 0.06, 8, 24, Math.PI);
      [-1, 1].forEach((side) => {
        const rib = new THREE.Mesh(ribGeo, brassMat);
        rib.position.set(0, 2.2, side * 1.4);
        group.add(rib);
      });

      group.add(plinth, astrolabe, scope, tripod);
      addContactShadow(group, textures, 1.35, 0.022, 0.72);
      break;
    }

    case 'mirror': {
      const frameGeo = getBoxGeo(1.44, 2.8, 0.12);
      const glassGeo = getPlaneGeo(1.22, 2.55);
      [-2.4, 0, 2.4].forEach((mx) => {
        const frame = new THREE.Mesh(frameGeo, brassMat);
        frame.position.set(mx, 1.68, -4.1);
        const glass = new THREE.Mesh(glassGeo, _mirrorGlassMat);
        glass.position.set(mx, 1.68, -4.02);
        addWarmHaloSprite(group, textures, 1.4, mx, 1.65, -3.9, 0x9cded8, 0.25);
        group.add(frame, glass);
      });
      const cand = buildCandelabra(brassMat, textures, animatedProps);
      cand.position.set(0, 0, 0.2);
      group.add(cand);
      break;
    }

    case 'flooded': {
      const water = new THREE.Mesh(
        getPlaneGeo(ROOM_SIZE - 0.5, ROOM_SIZE - 0.5),
        _floodedWaterMat
      );
      water.rotation.x = -Math.PI / 2;
      water.position.y = 0.18;
      group.add(water);
      animatedProps.push({ mesh: water, kind: 'water' });

      // Weathered wooden catwalk planks crossing the flooded cellar
      const walk = new THREE.Mesh(getBoxGeo(1.65, 0.12, 6.2), woodMat);
      walk.position.set(0, 0.26, 0);
      const crate = new THREE.Mesh(getBoxGeo(0.92, 0.75, 0.92), darkWoodMat);
      crate.position.set(-2.3, 0.34, -1.6);
      crate.rotation.y = 0.32;
      group.add(walk, crate);
      break;
    }

    case 'bedroom': {
      // Master Bedroom: Grand 4-poster canopy bed with overhead tester frame & burgundy velvet bed curtains!
      const frame = new THREE.Mesh(getBoxGeo(2.3, 0.44, 2.8), woodMat);
      frame.position.set(0, 0.42, -1.65);
      frame.castShadow = true;
      const headboard = new THREE.Mesh(getBoxGeo(2.3, 1.75, 0.16), darkWoodMat);
      headboard.position.set(0, 1.28, -3.0);
      const mattress = new THREE.Mesh(getBoxGeo(2.14, 0.28, 2.6), _linenMat);
      mattress.position.set(0, 0.74, -1.65);
      const quilt = new THREE.Mesh(getBoxGeo(2.18, 0.15, 1.95), velvetMat);
      quilt.position.set(0, 0.89, -1.32);
      const tester = new THREE.Mesh(getBoxGeo(2.38, 0.12, 2.86), darkWoodMat);
      tester.position.set(0, 2.75, -1.65);

      const postSpecs: GeoInstanceSpec[] = [];
      const orbSpecs: GeoInstanceSpec[] = [];
      const drapeSpecs: GeoInstanceSpec[] = [];
      [
        [-1.1, -3.0],
        [1.1, -3.0],
        [-1.1, -0.3],
        [1.1, -0.3],
      ].forEach(([px, pz]) => {
        postSpecs.push({ x: px, y: 1.38, z: pz });
        orbSpecs.push({ x: px, y: 2.88, z: pz });
        drapeSpecs.push({ x: px * 0.94, y: 1.65, z: pz });
      });

      group.add(
        frame,
        headboard,
        mattress,
        quilt,
        tester,
        makeGeoBatch(getCylGeo(0.055, 0.068, 2.75, 12), postSpecs, woodMat, true, false),
        makeGeoBatch(getSphereGeo(0.085, 10, 10), orbSpecs, brassMat),
        makeGeoBatch(getCylGeo(0.11, 0.18, 2.15, 10), drapeSpecs, velvetMat)
      );
      addContactShadow(group, textures, 2.0, 0.022, 0.72);
      break;
    }

    case 'quarters': {
      // Servants' Quarters: Iron cot, worn steamer trunk, washstand pitcher
      const cot = new THREE.Mesh(getBoxGeo(1.35, 0.38, 2.25), _ironMat);
      cot.position.set(-1.6, 0.42, -1.7);
      const blanket = new THREE.Mesh(getBoxGeo(1.25, 0.18, 2.1), _blanketMat);
      blanket.position.set(-1.6, 0.68, -1.7);
      const trunk = new THREE.Mesh(getBoxGeo(1.2, 0.65, 0.72), darkWoodMat);
      trunk.position.set(1.65, 0.325, -2.1);
      trunk.rotation.y = -0.18;
      group.add(cot, blanket, trunk);
      addContactShadow(group, textures, 1.4, 0.022, 0.65);
      break;
    }

    case 'conservatory': {
      // Glass Conservatory: Tiered weathered stone fountain + sculpted multi-frond palms + arched iron greenhouse ribs!
      const basin = new THREE.Mesh(
        getCylGeo(1.22, 0.88, 0.68, 22),
        bundle.conservatoryStoneMat
      );
      basin.position.y = 0.34;
      basin.castShadow = true;
      const tier = new THREE.Mesh(
        getCylGeo(0.55, 0.28, 0.92, 16),
        bundle.conservatoryStoneMat
      );
      tier.position.y = 0.92;
      const water = new THREE.Mesh(getCircleGeo(1.08, 22), _conservatoryWaterMat);
      water.rotation.x = -Math.PI / 2;
      water.position.y = 0.69;
      group.add(basin, tier, water);

      // Arched iron greenhouse ceiling ribs
      const archGeo = getTorusGeo(4.2, 0.055, 8, 24, Math.PI);
      [-2.1, 0, 2.1].forEach((gz) => {
        const arch = new THREE.Mesh(archGeo, _ironMat);
        arch.position.set(0, 2.15, gz);
        group.add(arch);
      });

      [
        [-2.75, -2.65],
        [2.75, -2.65],
        [-2.75, 2.2],
        [2.75, 2.2],
      ].forEach(([px, pz]) => {
        const palm = buildPottedPalm(darkWoodMat, brassMat);
        palm.position.set(px, 0, pz);
        palm.rotation.y = px + pz;
        group.add(palm);
      });
      addContactShadow(group, textures, 1.5, 0.022, 0.68);
      break;
    }

    case 'passage': {
      // Hidden Passage: Timber wall beams, crate stacks, iron wall torches
      const beamGeo = getBoxGeo(0.32, 4.1, 0.32);
      [-2.2, 2.2].forEach((bx) => {
        const beam = new THREE.Mesh(beamGeo, darkWoodMat);
        beam.position.set(bx, 2.05, -2.8);
        group.add(beam);
      });
      const crate1 = new THREE.Mesh(getBoxGeo(0.95, 0.85, 0.95), woodMat);
      crate1.position.set(-2.4, 0.425, -1.4);
      crate1.rotation.y = 0.25;
      const crate2 = new THREE.Mesh(getBoxGeo(0.7, 0.65, 0.7), darkWoodMat);
      crate2.position.set(-2.35, 1.18, -1.42);
      crate2.rotation.y = -0.35;
      group.add(crate1, crate2);
      break;
    }

    case 'impossible': {
      // The Room That Should Not Exist: Surreal Escher inverted stairs + gravity-defying desk & spectral arch!
      const invStairs = new THREE.Group();
      invStairs.position.set(-1.6, 3.85, -1.2);
      invStairs.rotation.z = Math.PI;
      const invSpecs: BoxInstanceSpec[] = [];
      for (let i = 0; i < 6; i++) {
        invSpecs.push({ x: 0, y: i * 0.28, z: -i * 0.35, sx: 1.8, sy: 0.24, sz: 0.4 });
      }
      invStairs.add(makeBoxBatch(invSpecs, darkWoodMat));

      const tilted = new THREE.Group();
      tilted.position.set(0.65, 0.55, 0.3);
      tilted.rotation.set(0.16, 0.32, -0.18);
      const desk = new THREE.Mesh(getBoxGeo(2.1, 0.14, 1.2), darkWoodMat);
      desk.position.y = 0.9;
      const cand = buildCandelabra(brassMat, textures, animatedProps);
      cand.position.y = 0.98;
      tilted.add(desk, cand);

      const portalRing = new THREE.Mesh(getTorusGeo(1.35, 0.055, 10, 32), _portalRingMat);
      portalRing.position.set(0, 1.8, -3.4);
      animatedProps.push({ mesh: portalRing, kind: 'beacon' });
      group.add(invStairs, tilted, portalRing);
      break;
    }

    default: {
      const fp = buildFireplace(woodMat, brassMat, textures, animatedProps);
      fp.position.set(0, 0, -3.85);
      group.add(fp);

      const table = new THREE.Mesh(getCylGeo(0.75, 0.72, 0.08, 22), woodMat);
      table.position.set(0, 0.76, 0.35);
      table.castShadow = true;
      const leg = new THREE.Mesh(getBalusterGeo(), woodMat);
      leg.scale.set(2.2, 0.78, 2.2);
      leg.position.set(0, 0, 0.35);
      const cand = buildCandleStick(brassMat, textures, animatedProps);
      cand.position.set(0, 0.8, 0.35);
      const chL = buildVictorianChair(woodMat, velvetMat, textures);
      chL.position.set(-1.38, 0, 0.32);
      chL.rotation.y = Math.PI / 2 + 0.14;
      const chR = buildVictorianChair(woodMat, velvetMat, textures);
      chR.position.set(1.36, 0, 0.44);
      chR.rotation.y = -Math.PI / 2 - 0.18;
      group.add(table, leg, cand, chL, chR, buildLoosePaperStack(-0.28, 0.805, 0.55));
      addContactShadow(group, textures, 1.45, 0.022, 0.68);
      break;
    }
  }
}

// Shared laboratory flask materials by hex color
const _flaskMatCache = new Map<number, THREE.MeshPhysicalMaterial>();
function getSharedFlaskMat(color: number): THREE.MeshPhysicalMaterial {
  let m = _flaskMatCache.get(color);
  if (!m) {
    m = markSharedMat(
      new THREE.MeshPhysicalMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.85,
        roughness: 0.12,
        transparent: true,
        opacity: 0.84,
      })
    );
    _flaskMatCache.set(color, m);
  }
  return m;
}

// Shared static figurine & ghost materials
const _skinMat = markSharedMat(new THREE.MeshStandardMaterial({ color: 0xdec2a2, roughness: 0.54 }));
const _darkLeatherMat = markSharedMat(
  new THREE.MeshStandardMaterial({ color: 0x261a14, roughness: 0.62 })
);
const _feltPadMat = markSharedMat(
  new THREE.MeshStandardMaterial({ color: 0x1a3829, roughness: 0.96 })
);
const _cravatMat = markSharedMat(
  new THREE.MeshStandardMaterial({ color: 0xf0e6d2, roughness: 0.72 })
);
const _turnRingMat = markSharedMat(
  new THREE.MeshBasicMaterial({
    color: 0xf7cf78,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  })
);
const _turnTickMat = markSharedMat(
  new THREE.MeshBasicMaterial({
    color: 0xffdf96,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.78,
    depthWrite: false,
  })
);
const _lanternCoreMat = markSharedMat(
  new THREE.MeshStandardMaterial({
    color: 0xffe8ac,
    emissive: 0xffb84c,
    emissiveIntensity: 2.35,
    roughness: 0.18,
  })
);
const _mediumVeilMat = markSharedMat(
  new THREE.MeshStandardMaterial({ color: 0x241d30, roughness: 0.85 })
);
const _mediumCrystalMat = markSharedMat(
  new THREE.MeshStandardMaterial({
    color: 0x9ce8df,
    emissive: 0x52c4b4,
    emissiveIntensity: 1.9,
  })
);
const _folioMat = markSharedMat(
  new THREE.MeshStandardMaterial({ color: 0x6b2824, roughness: 0.75 })
);
const _scrollMat = markSharedMat(
  new THREE.MeshStandardMaterial({ color: 0xf0e4c8, roughness: 0.8 })
);

const _coatMatCache = new Map<string, THREE.MeshPhysicalMaterial>();
function getSharedCoatMat(coatColor: string): THREE.MeshPhysicalMaterial {
  let m = _coatMatCache.get(coatColor);
  if (!m) {
    m = markSharedMat(
      new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(coatColor),
        roughness: 0.56,
        metalness: 0.04,
        sheen: 0.48,
        sheenRoughness: 0.65,
        clearcoat: 0.18,
      })
    );
    _coatMatCache.set(coatColor, m);
  }
  return m;
}

const _accentMatCache = new Map<string, THREE.MeshStandardMaterial>();
function getSharedAccentMat(accentColor: string): THREE.MeshStandardMaterial {
  let m = _accentMatCache.get(accentColor);
  if (!m) {
    m = markSharedMat(
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(accentColor),
        roughness: 0.38,
        metalness: 0.25,
      })
    );
    _accentMatCache.set(accentColor, m);
  }
  return m;
}

const _figBrassCache = new WeakMap<
  ProceduralTextures,
  { active: THREE.MeshPhysicalMaterial; idle: THREE.MeshPhysicalMaterial; baseWood: THREE.MeshStandardMaterial; auraGlow: THREE.MeshBasicMaterial }
>();
function getFigurineTexMats(textures: ProceduralTextures) {
  let entry = _figBrassCache.get(textures);
  if (!entry) {
    entry = {
      active: markSharedMat(makeBrassMat(textures, 0xf2c872)),
      idle: markSharedMat(makeBrassMat(textures, 0xb38c4c)),
      baseWood: markSharedMat(makeWalnutMat(textures, 0x5c4030)),
      auraGlow: markSharedMat(
        new THREE.MeshBasicMaterial({
          map: textures.lightGlow,
          color: 0xffc86b,
          transparent: true,
          opacity: 0.32,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      ),
    };
    _figBrassCache.set(textures, entry);
  }
  return entry;
}

/**
 * Hand-Painted Sculpted Tabletop Investigator Miniature with Articulated Arms,
 * Character-Specific Off-Hand Prop, Tailored Greatcoat & Color-Coded Brass Base Ring
 */
export function buildExplorerFigurine(
  char: CharacterDef,
  textures: ProceduralTextures,
  isActiveTurn: boolean
): THREE.Group {
  const g = new THREE.Group();
  const texMats = getFigurineTexMats(textures);
  const baseWood = texMats.baseWood;
  const brass = isActiveTurn ? texMats.active : texMats.idle;
  const coatMat = getSharedCoatMat(char.coatColor);
  const accentMat = getSharedAccentMat(char.accentColor);

  // Felt pad + turned walnut plinth + color-coded character ring + brass lip
  const feltPad = new THREE.Mesh(getCylGeo(0.5, 0.5, 0.02, 24), _feltPadMat);
  feltPad.position.y = 0.01;
  const plinth = new THREE.Mesh(getPawnBaseGeo(), baseWood);
  plinth.position.y = 0.015;
  plinth.castShadow = true;

  // Color-coded base ring (matches tabletop board game investigator rings!)
  const charRing = new THREE.Mesh(getTorusGeo(0.465, 0.03, 10, 28), accentMat);
  charRing.rotation.x = Math.PI / 2;
  charRing.position.y = 0.075;
  const brassLip = new THREE.Mesh(getTorusGeo(0.39, 0.018, 8, 24), brass);
  brassLip.rotation.x = Math.PI / 2;
  brassLip.position.y = 0.18;

  if (isActiveTurn) {
    const turnAura = new THREE.Group();
    turnAura.name = 'turnAura';
    turnAura.position.y = 0.03;

    const innerRing = new THREE.Mesh(getRingGeo(0.56, 0.65, 36), _turnRingMat);
    innerRing.rotation.x = -Math.PI / 2;
    turnAura.add(innerRing);

    // 4 ornate compass cardinal ticks around the active explorer's base
    const tickGeo = getPlaneGeo(0.08, 0.2);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const tick = new THREE.Mesh(tickGeo, _turnTickMat);
      tick.rotation.x = -Math.PI / 2;
      tick.rotation.z = -a;
      tick.position.set(Math.sin(a) * 0.74, 0.002, Math.cos(a) * 0.74);
      turnAura.add(tick);
    }

    const auraGlow = new THREE.Mesh(getPlaneGeo(1.75, 1.75), texMats.auraGlow);
    auraGlow.rotation.x = -Math.PI / 2;
    auraGlow.position.y = -0.004;
    turnAura.add(auraGlow);
    g.add(turnAura);
    g.userData.turnAura = turnAura;
  }

  // Articulated upper body group (enables subtle idle breathing & sway while walnut base stays grounded)
  const figBody = new THREE.Group();
  figBody.name = 'figurineBody';

  // Sculpted Victorian greatcoat torso + waist belt + shoulder mantle + cravat
  const body = new THREE.Mesh(getCoatSkirtGeo(), coatMat);
  body.castShadow = true;
  const shoulders = new THREE.Mesh(getSphereGeo(0.24, 14, 10), coatMat);
  shoulders.scale.set(1.22, 0.52, 0.85);
  shoulders.position.y = 1.24;
  const belt = new THREE.Mesh(getTorusGeo(0.195, 0.028, 8, 20), _darkLeatherMat);
  belt.rotation.x = Math.PI / 2;
  belt.position.y = 0.9;
  const buckle = new THREE.Mesh(getBoxGeo(0.07, 0.065, 0.04), brass);
  buckle.position.set(0, 0.9, 0.2);
  const cravat = new THREE.Mesh(getConeGeo(0.085, 0.22, 8), _cravatMat);
  cravat.rotation.x = Math.PI;
  cravat.position.set(0, 1.2, 0.16);
  const collar = new THREE.Mesh(getTorusGeo(0.145, 0.04, 10, 20), accentMat);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 1.33;

  // Sculpted right arm extended holding the caged Victorian brass lantern
  const rArm = new THREE.Mesh(getCylGeo(0.055, 0.048, 0.42, 8), coatMat);
  rArm.position.set(0.26, 1.12, 0.12);
  rArm.rotation.set(0.75, 0, -0.35);
  const handGeo = getSphereGeo(0.048, 8, 8);
  const rHand = new THREE.Mesh(handGeo, _skinMat);
  rHand.position.set(0.32, 1.05, 0.28);

  // Sculpted left arm carrying each character's signature prop!
  const lArm = new THREE.Mesh(getCylGeo(0.055, 0.048, 0.4, 8), coatMat);
  lArm.position.set(-0.26, 1.06, 0.06);
  lArm.rotation.set(0.32, 0, 0.28);
  const lHand = new THREE.Mesh(handGeo, _skinMat);
  lHand.position.set(-0.31, 0.9, 0.14);

  const head = new THREE.Mesh(getSphereGeo(0.175, 18, 16), _skinMat);
  head.scale.set(0.94, 1.08, 0.96);
  head.position.y = 1.56;
  head.castShadow = true;

  // Caged Victorian handheld brass lantern hanging from right hand (pivots from hand for realistic pendulum sway)
  const lanternGroup = new THREE.Group();
  lanternGroup.name = 'explorerLantern';
  lanternGroup.position.set(0.32, 1.02, 0.29);
  const lCap = new THREE.Mesh(getConeGeo(0.085, 0.07, 8), brass);
  lCap.position.y = 0.0;
  const lBase = new THREE.Mesh(getCylGeo(0.07, 0.075, 0.035, 8), brass);
  lBase.position.y = -0.19;
  const lCore = new THREE.Mesh(getCylGeo(0.055, 0.055, 0.15, 10), _lanternCoreMat);
  lCore.position.y = -0.1;
  lanternGroup.add(lCap, lBase, lCore);
  addWarmHaloSprite(lanternGroup, textures, 0.88, 0, -0.1, 0, 0xffc66d, 0.62);

  // Character-distinct Victorian silhouette headgear + signature left-hand prop!
  if (char.silhouetteType === 'magician') {
    const brim = new THREE.Mesh(getCylGeo(0.27, 0.27, 0.03, 20), _darkLeatherMat);
    brim.position.y = 1.72;
    const crown = new THREE.Mesh(getCylGeo(0.17, 0.15, 0.3, 20), _darkLeatherMat);
    crown.position.y = 1.87;
    const band = new THREE.Mesh(getCylGeo(0.16, 0.16, 0.055, 20), accentMat);
    band.position.y = 1.75;
    // Silver-tipped stage cane
    const cane = new THREE.Mesh(getCylGeo(0.018, 0.015, 0.92, 8), _darkLeatherMat);
    cane.position.set(-0.34, 0.56, 0.16);
    const caneKnob = new THREE.Mesh(getSphereGeo(0.04, 10, 10), brass);
    caneKnob.position.set(-0.34, 1.03, 0.16);
    figBody.add(brim, crown, band, cane, caneKnob);
  } else if (char.silhouetteType === 'locksmith') {
    const cap = new THREE.Mesh(getCylGeo(0.21, 0.23, 0.11, 18), _darkLeatherMat);
    cap.position.y = 1.73;
    const visor = new THREE.Mesh(getBoxGeo(0.24, 0.03, 0.14), _darkLeatherMat);
    visor.position.set(0, 1.69, 0.16);
    // Brass keyring & iron prybar
    const keyRing = new THREE.Mesh(getTorusGeo(0.075, 0.015, 6, 14), brass);
    keyRing.position.set(-0.32, 0.82, 0.15);
    figBody.add(cap, visor, keyRing);
  } else if (char.silhouetteType === 'medium') {
    const veil = new THREE.Mesh(getConeGeo(0.27, 0.5, 16), _mediumVeilMat);
    veil.position.set(0, 1.6, -0.05);
    // Glowing cyan crystal pendulum in left hand
    const crystal = new THREE.Mesh(getOctaGeo(0.075, 0), _mediumCrystalMat);
    crystal.position.set(-0.32, 0.74, 0.16);
    figBody.add(veil, crystal);
  } else if (char.silhouetteType === 'physician') {
    const hair = new THREE.Mesh(
      getSphereGeo(0.185, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.56),
      _darkLeatherMat
    );
    hair.position.y = 1.59;
    // Leather Gladstone medical bag
    const bag = new THREE.Mesh(getBoxGeo(0.14, 0.22, 0.28), _darkLeatherMat);
    bag.position.set(-0.34, 0.72, 0.12);
    const bagClasp = new THREE.Mesh(getBoxGeo(0.15, 0.04, 0.14), brass);
    bagClasp.position.set(-0.34, 0.84, 0.12);
    figBody.add(hair, bag, bagClasp);
  } else if (char.silhouetteType === 'archivist') {
    const hair = new THREE.Mesh(
      getSphereGeo(0.185, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.58),
      baseWood
    );
    hair.position.y = 1.59;
    // Round brass spectacles + leather archival ledger
    const specGeo = getTorusGeo(0.04, 0.008, 6, 12);
    [-0.06, 0.06].forEach((gx) => {
      const spec = new THREE.Mesh(specGeo, brass);
      spec.position.set(gx, 1.57, 0.17);
      figBody.add(spec);
    });
    const folio = new THREE.Mesh(getBoxGeo(0.07, 0.28, 0.22), _folioMat);
    folio.position.set(-0.32, 0.9, 0.14);
    figBody.add(hair, folio);
  } else {
    // Estate Heir: sculpted noble hair + brass heirloom crest scroll
    const hair = new THREE.Mesh(
      getSphereGeo(0.19, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.6),
      baseWood
    );
    hair.position.y = 1.59;
    const scroll = new THREE.Mesh(getCylGeo(0.032, 0.032, 0.28, 10), _scrollMat);
    scroll.rotation.x = 0.6;
    scroll.position.set(-0.32, 0.88, 0.16);
    figBody.add(hair, scroll);
  }

  figBody.add(
    body,
    shoulders,
    belt,
    buckle,
    cravat,
    collar,
    rArm,
    rHand,
    lArm,
    lHand,
    head,
    lanternGroup
  );

  // Cache direct child refs on userData for O(1) per-frame animation without getObjectByName()
  g.userData.figurineBody = figBody;
  g.userData.explorerLantern = lanternGroup;

  g.add(feltPad, plinth, charRing, brassLip, figBody);
  addContactShadow(g, textures, 0.64, 0.024, 0.8);
  return g;
}

// Shared Ghost Archetype Materials
const _watcherShadowMat = markSharedMat(
  new THREE.MeshPhysicalMaterial({
    color: 0x16242b,
    emissive: 0x26525c,
    emissiveIntensity: 0.65,
    roughness: 0.35,
    transparent: true,
    opacity: 0.84,
    depthWrite: false,
  })
);
const _watcherEyeMat = markSharedMat(new THREE.MeshBasicMaterial({ color: 0xb6fff6 }));
const _wispIronMat = markSharedMat(
  new THREE.MeshStandardMaterial({ color: 0x1e282e, metalness: 0.82, roughness: 0.38 })
);
const _wispCoreMat = markSharedMat(
  new THREE.MeshStandardMaterial({
    color: 0xbafff5,
    emissive: 0x7ef5e4,
    emissiveIntensity: 2.2,
    roughness: 0.1,
  })
);
const _wispSparkGoldMat = markSharedMat(new THREE.MeshBasicMaterial({ color: 0xf6d482 }));
const _wispSparkCyanMat = markSharedMat(new THREE.MeshBasicMaterial({ color: 0x8ef2e5 }));
const _borrowerAmberMat = markSharedMat(
  new THREE.MeshPhysicalMaterial({
    color: 0xd9b066,
    emissive: 0xa67428,
    emissiveIntensity: 0.9,
    roughness: 0.2,
    clearcoat: 0.6,
    transparent: true,
    opacity: 0.78,
    depthWrite: false,
  })
);
const _borrowerMaskMat = markSharedMat(
  new THREE.MeshStandardMaterial({
    color: 0xf4ecd8,
    emissive: 0xd8b26a,
    emissiveIntensity: 0.45,
    roughness: 0.18,
  })
);
const _borrowerShardMat = markSharedMat(
  new THREE.MeshPhysicalMaterial({
    color: 0xe6f2f5,
    emissive: 0x92cfc8,
    emissiveIntensity: 0.95,
    metalness: 0.92,
    roughness: 0.08,
    side: THREE.DoubleSide,
  })
);
const _choirMat = markSharedMat(
  new THREE.MeshPhysicalMaterial({
    color: 0x9b74bf,
    emissive: 0x6c429c,
    emissiveIntensity: 1.05,
    roughness: 0.26,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
  })
);
const _choirRippleMat = markSharedMat(
  new THREE.MeshBasicMaterial({ color: 0xc59bf0, transparent: true, opacity: 0.52 })
);
const _mournerMat = markSharedMat(
  new THREE.MeshPhysicalMaterial({
    color: 0x94b8e8,
    emissive: 0x5280c4,
    emissiveIntensity: 1.05,
    roughness: 0.2,
    sheen: 0.65,
    sheenColor: new THREE.Color(0xcce2ff),
    transparent: true,
    opacity: 0.74,
    depthWrite: false,
  })
);
const _mournerHaloMat = markSharedMat(
  new THREE.MeshBasicMaterial({ color: 0xa6c8f5, transparent: true, opacity: 0.55 })
);

const _ghostMistMatCache = new WeakMap<ProceduralTextures, Map<string, THREE.MeshBasicMaterial>>();
function getGhostMistMat(
  textures: ProceduralTextures,
  color: number,
  opacity: number
): THREE.MeshBasicMaterial {
  let map = _ghostMistMatCache.get(textures);
  if (!map) {
    map = new Map();
    _ghostMistMatCache.set(textures, map);
  }
  const key = `${color}:${opacity.toFixed(2)}`;
  let mat = map.get(key);
  if (!mat) {
    mat = markSharedMat(
      new THREE.MeshBasicMaterial({
        map: textures.lightGlow,
        color,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    map.set(key, mat);
  }
  return mat;
}

/**
 * 5 Completely Distinct Ghost Archetypes (matching Section 12 of the Source Material!)
 * - watcher: tall, gaunt shadowed figure in wide-brimmed hat with piercing pale-cyan eyes
 * - mourner: floating veiled Edwardian figure with layered translucent tattered gown ribbons
 * - borrower: uncanny tilted porcelain-mask explorer double with orbiting mirror shards
 * - lantern_wisp: floating antique wrought-iron spectral lantern with swirling soul sparks
 * - wall_choir: eerie semicircular chorus of 3 shadowy spectral silhouettes rising from mist ripples
 */
export function buildGhostMesh(ghost: GhostInstance, textures?: ProceduralTextures): THREE.Group {
  const g = new THREE.Group();
  g.userData.ghostArchetype = ghost.archetype;

  if (ghost.archetype === 'watcher') {
    const gauntBody = new THREE.Mesh(getCylGeo(0.14, 0.34, 1.95, 14), _watcherShadowMat);
    gauntBody.position.y = 1.05;
    const highCollar = new THREE.Mesh(
      getCylGeo(0.24, 0.16, 0.28, 12, 1, true),
      _watcherShadowMat
    );
    highCollar.position.y = 2.02;
    const head = new THREE.Mesh(getSphereGeo(0.16, 14, 14), _watcherShadowMat);
    head.position.y = 2.15;
    const hatBrim = new THREE.Mesh(getCylGeo(0.38, 0.4, 0.03, 18), _watcherShadowMat);
    hatBrim.position.y = 2.28;
    const hatCrown = new THREE.Mesh(getCylGeo(0.17, 0.19, 0.24, 16), _watcherShadowMat);
    hatCrown.position.y = 2.41;

    // Two piercing pale-cyan pinprick eyes staring silently
    const eyeGeo = getSphereGeo(0.024, 8, 8);
    [-0.055, 0.055].forEach((ex) => {
      const eye = new THREE.Mesh(eyeGeo, _watcherEyeMat);
      eye.position.set(ex, 2.15, 0.14);
      g.add(eye);
    });
    if (textures) addWarmHaloSprite(g, textures, 1.65, 0, 1.95, 0.05, 0x7ad6cc, 0.38);
    g.add(gauntBody, highCollar, head, hatBrim, hatCrown);
    return g;
  }

  if (ghost.archetype === 'lantern_wisp') {
    const lantern = new THREE.Group();
    lantern.position.y = 1.38;
    const cap = new THREE.Mesh(getConeGeo(0.2, 0.18, 6), _wispIronMat);
    cap.position.y = 0.22;
    const base = new THREE.Mesh(getCylGeo(0.16, 0.18, 0.08, 6), _wispIronMat);
    base.position.y = -0.2;
    const flameCore = new THREE.Mesh(getOctaGeo(0.14, 1), _wispCoreMat);
    lantern.add(cap, base, flameCore);

    // Trailing orbital soul-sparks around the floating ghost lantern
    const orbitGroup = new THREE.Group();
    orbitGroup.name = 'ghostOrbit';
    const sparkGeo = getSphereGeo(0.042, 8, 8);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const spark = new THREE.Mesh(
        sparkGeo,
        i % 2 === 0 ? _wispSparkGoldMat : _wispSparkCyanMat
      );
      spark.position.set(Math.cos(a) * 0.44, 1.15 + i * 0.11, Math.sin(a) * 0.44);
      orbitGroup.add(spark);
    }
    if (textures) {
      addWarmHaloSprite(g, textures, 2.2, 0, 1.38, 0, 0x96f0dc, 0.6);
      const mist = new THREE.Mesh(
        getPlaneGeo(1.75, 1.75),
        getGhostMistMat(textures, 0x7be0d0, 0.28)
      );
      mist.rotation.x = -Math.PI / 2;
      mist.position.y = 0.032;
      g.add(mist);
    }
    g.userData.ghostOrbit = orbitGroup;
    g.add(lantern, orbitGroup);
    return g;
  }

  if (ghost.archetype === 'borrower') {
    const body = new THREE.Mesh(getCoatSkirtGeo(), _borrowerAmberMat);
    body.position.y = 0.22;
    const mask = new THREE.Mesh(getSphereGeo(0.18, 16, 14), _borrowerMaskMat);
    mask.scale.set(0.88, 1.15, 0.75);
    mask.position.set(0, 1.75, 0);
    mask.rotation.z = 0.16; // uncanny tilted head!

    // Orbiting fractured reflection shards
    const orbitGroup = new THREE.Group();
    orbitGroup.name = 'ghostOrbit';
    const shardGeo = getConeGeo(0.11, 0.34, 3);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const shard = new THREE.Mesh(shardGeo, _borrowerShardMat);
      shard.position.set(Math.cos(a) * 0.54, 1.15 + (i % 2) * 0.35, Math.sin(a) * 0.54);
      shard.rotation.set(0.4, a, 0.5);
      orbitGroup.add(shard);
    }
    if (textures) {
      addWarmHaloSprite(g, textures, 1.75, 0, 1.35, 0, 0xe8bc6b, 0.48);
      const mist = new THREE.Mesh(
        getPlaneGeo(1.75, 1.75),
        getGhostMistMat(textures, 0xe2b15e, 0.25)
      );
      mist.rotation.x = -Math.PI / 2;
      mist.position.y = 0.032;
      g.add(mist);
    }
    g.userData.ghostOrbit = orbitGroup;
    g.add(body, mask, orbitGroup);
    return g;
  }

  if (ghost.archetype === 'wall_choir') {
    // Chorus of 3 overlapping shadowy spectral silhouettes rising from mist ripples
    [
      [-0.36, 0.85, -0.14],
      [0, 1.05, 0.08],
      [0.36, 0.88, -0.14],
    ].forEach(([cx, sc, cz]) => {
      const fig = new THREE.Mesh(getConeGeo(0.24 * sc, 1.55 * sc, 12), _choirMat);
      fig.position.set(cx, 0.95 * sc, cz);
      const hd = new THREE.Mesh(getSphereGeo(0.13 * sc, 12, 12), _choirMat);
      hd.position.set(cx, 1.8 * sc, cz);
      g.add(fig, hd);
    });
    const orbitGroup = new THREE.Group();
    orbitGroup.name = 'ghostOrbit';
    [0.52, 0.82].forEach((r) => {
      const ripple = new THREE.Mesh(getTorusGeo(r, 0.022, 8, 28), _choirRippleMat);
      ripple.rotation.x = Math.PI / 2;
      ripple.position.y = 0.16;
      orbitGroup.add(ripple);
    });
    g.userData.ghostOrbit = orbitGroup;
    g.add(orbitGroup);
    if (textures) addWarmHaloSprite(g, textures, 2.0, 0, 1.15, 0, 0xb382db, 0.5);
    return g;
  }

  // Default: THE MOURNER — Floating veiled Edwardian apparition with layered translucent ribbons
  const gown = new THREE.Mesh(getMournerGownGeo(), _mournerMat);
  const veil = new THREE.Mesh(getConeGeo(0.24, 0.58, 14, true), _mournerMat);
  veil.position.set(0, 1.65, -0.04);
  const head = new THREE.Mesh(getSphereGeo(0.15, 14, 14), _mournerMat);
  head.position.set(0, 1.72, 0.04);
  const orbitGroup = new THREE.Group();
  orbitGroup.name = 'ghostOrbit';
  const halo = new THREE.Mesh(getTorusGeo(0.44, 0.02, 8, 28), _mournerHaloMat);
  halo.rotation.x = Math.PI / 2;
  halo.position.y = 0.28;
  orbitGroup.add(halo);
  if (textures) {
    addWarmHaloSprite(g, textures, 1.8, 0, 1.25, 0, 0x8bb2e6, 0.5);
    const mist = new THREE.Mesh(
      getPlaneGeo(1.75, 1.75),
      getGhostMistMat(textures, 0x7ca6dc, 0.26)
    );
    mist.rotation.x = -Math.PI / 2;
    mist.position.y = 0.032;
    g.add(mist);
  }
  g.userData.ghostOrbit = orbitGroup;
  g.add(gown, veil, head, orbitGroup);
  return g;
}

/**
 * Read-only diagnostics for module-level shared resources. Never dispose these
 * from a single room: multiple scenes/rooms can reference the same object.
 * WeakMap-backed per-texture bundles are not enumerable and are not counted.
 */
export function getSharedRoomCacheStats() {
  const geometryByKind: Record<string, number> = {};
  for (const key of _geoCache.keys()) {
    const kind = key.split(':', 1)[0];
    geometryByKind[kind] = (geometryByKind[kind] ?? 0) + 1;
  }
  return {
    geometryEntries: _geoCache.size,
    geometryByKind,
    floorGeometryReady: _roomFloorGeo !== null,
    hoverBorderGeometryReady: _hoverBorderGeo !== null,
    plaqueMaterials: _plaqueMatCache.size,
    plaqueTextures: _plaqueMatCache.size,
    velvetMaterials: _velvetCache.size,
    flaskMaterials: _flaskMatCache.size,
    coatMaterials: _coatMatCache.size,
    accentMaterials: _accentMatCache.size,
    perTextureWeakMapBundles: 'not-enumerable',
  };
}

/**
 * Safely disposes room/figurine-owned GPU geometries, materials, InstancedMesh buffers,
 * and unique CanvasTextures without ever freeing module-cached shared geometries/materials
 * or ProceduralTextures.
 */
export function disposeObjectTree(root: THREE.Object3D): void {
  const disposedMats = new Set<THREE.Material>();

  root.traverse((obj) => {
    const inst = obj as THREE.InstancedMesh;
    if (inst.isInstancedMesh) {
      // Frees GPU instanceMatrix & instanceColor attributes without touching shared geometry
      inst.dispose();
    }
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh && mesh.geometry && !mesh.geometry.userData?.shared) {
      mesh.geometry.dispose();
    }
    const matOrArr = (obj as THREE.Mesh | THREE.Sprite).material;
    if (!matOrArr) return;
    const mats = Array.isArray(matOrArr) ? matOrArr : [matOrArr];
    for (const m of mats) {
      if (!m || m.userData?.shared || disposedMats.has(m)) continue;
      disposedMats.add(m);
      const anyMat = m as THREE.MeshStandardMaterial;
      if (anyMat.map && anyMat.map.userData?.ownedTexture && !anyMat.map.userData?.shared) {
        anyMat.map.dispose();
      }
      m.dispose();
    }
  });
}

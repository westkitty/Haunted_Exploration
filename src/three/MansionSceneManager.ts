import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import type { CameraMode, Direction, FloorId, GameState } from '../engine/types';
import { getCharacterById } from '../engine/characters';
import { createProceduralTextures, type ProceduralTextures } from './textures';
import {
  buildExplorerFigurine,
  buildGhostMesh,
  buildRoomMesh,
  disposeObjectTree,
  FLOOR_SPACING,
  ROOM_SIZE,
  roomWorldPosition,
  type BuiltRoomRefs,
  type WallFadeEntry,
} from './roomBuilder';

const VictorianGradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uVignette: { value: 0.34 },
    uDread: { value: 0.0 },
    uChroma: { value: 0.0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uVignette;
    uniform float uDread;
    uniform float uChroma;
    varying vec2 vUv;

    void main() {
      vec2 centered = vUv - 0.5;
      float dist = length(centered);

      vec3 col;
      if (uChroma > 0.0002) {
        vec2 offset = centered * uChroma * dist;
        col.r = texture2D(tDiffuse, vUv + offset).r;
        col.g = texture2D(tDiffuse, vUv).g;
        col.b = texture2D(tDiffuse, vUv - offset).b;
      } else {
        col = texture2D(tDiffuse, vUv).rgb;
      }

      // Subtle warm-amber highlight / cool-moonlit-shadow Victorian split toning
      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      vec3 coolShadow = vec3(0.95, 0.98, 1.05);
      vec3 warmHigh = vec3(1.04, 1.01, 0.95);
      col *= mix(coolShadow, warmHigh, smoothstep(0.08, 0.75, luma));

      // Gentle Dread tension edge tint & tasteful tabletop vignette
      float vig = smoothstep(0.38, 0.92, dist);
      vec3 vigTint = mix(vec3(0.04, 0.03, 0.04), vec3(0.14, 0.03, 0.03), uDread);
      col = mix(col, vigTint, vig * (uVignette + uDread * 0.14));

      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export interface SceneInteractionHit {
  kind:
    | 'unexplored_door'
    | 'connected_door'
    | 'interactable'
    | 'ghost'
    | 'room_floor'
    | 'search_room'
    | 'staircase'
    | 'scenario_objective';
  roomId: string;
  direction?: Direction;
  targetRoomId?: string;
  interactableId?: string;
  ghostId?: string;
  stairLinks?: string[];
  subAction?: string;
  label?: string;
  hoverVisual?: THREE.Object3D;
  doorPivot?: THREE.Group;
  doorBaseAngle?: number;
}

export interface HoverCursorState {
  label: string;
  x: number;
  y: number;
  kind: SceneInteractionHit['kind'];
}

export interface MansionSceneCallbacks {
  onSelectHit: (hit: SceneInteractionHit, screenPos: { x: number; y: number }) => void;
  onHoverHint: (hover: HoverCursorState | null) => void;
  onHoverTick?: () => void;
  onPawnLanded?: () => void;
}

interface RippleSlot {
  ring: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  active: boolean;
  age: number;
  duration: number;
  maxScale: number;
}

interface BurstMoteSlot {
  mesh: THREE.Sprite;
  mat: THREE.SpriteMaterial;
  vel: THREE.Vector3;
  active: boolean;
  age: number;
  duration: number;
}

interface PawnMoveAnim {
  start: THREE.Vector3;
  end: THREE.Vector3;
  age: number;
  duration: number;
  landed: boolean;
  settleAge: number;
  baseYaw: number;
}

// Reusable module-scope scratch vectors (Zero GC in render loop)
const _vecA = new THREE.Vector3();
const _vecB = new THREE.Vector3();
const _vecC = new THREE.Vector3();
const _vecD = new THREE.Vector3();
const _mouse = new THREE.Vector2();

function detectSoftwareGl(): boolean {
  try {
    const probeCanvas = document.createElement('canvas');
    const gl = probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export class MansionSceneManager {
  private container: HTMLElement;
  private callbacks: MansionSceneCallbacks;
  private isSoftwareGl: boolean;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private textures: ProceduralTextures;
  private clock = new THREE.Clock();
  private raycaster = new THREE.Raycaster();

  private keyLight: THREE.DirectionalLight;
  private rimLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;
  private explorerLanternLight: THREE.PointLight;
  private roomLightPool: THREE.PointLight[] = [];
  private lightCandidates: { ref: BuiltRoomRefs; score: number }[] = [];
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private gradePass: ShaderPass | null = null;

  private tabletopGroup: THREE.Group;
  private studyCandleFlames: THREE.Mesh[] = [];
  private studyCandleGlows: THREE.Sprite[] = [];
  private compassNeedle: THREE.Mesh | null = null;
  private hoverRing: THREE.Mesh;
  private dustPoints: THREE.Points;
  private mistPoints: THREE.Points;

  // Curved brass movement trajectory preview beads
  private moveArcGroup: THREE.Group;
  private moveArcBeads: THREE.Mesh[] = [];
  private moveArcFrom = new THREE.Vector3();
  private moveArcTo = new THREE.Vector3();
  private moveArcHeight = 1.6;

  // Fixed pre-allocated VFX pools (zero runtime material/sprite allocation or disposal!)
  private sharedRippleGeo = new THREE.RingGeometry(0.26, 0.38, 28);
  private ripplePool: RippleSlot[] = [];
  private motePool: BurstMoteSlot[] = [];
  private pawnMoves = new Map<string, PawnMoveAnim>();
  private hopTrailAccum = 0;
  private hoveredVisualTarget: THREE.Object3D | null = null;
  private hoveredVisualBaseY = 0;
  private hoveredVisualBaseScale = new THREE.Vector3(1, 1, 1);
  private hoveredDoorTarget: { pivot: THREE.Group; baseAngle: number } | null = null;
  private hoveredRoomHighlightId: string | null = null;
  private lastHoverKey: string | null = null;

  private roomMeshes = new Map<string, BuiltRoomRefs>();
  private playerMeshes = new Map<string, THREE.Group>();
  private ghostMeshes = new Map<string, THREE.Group>();
  private ghostHitProxies: { roomId: string; obj: THREE.Object3D }[] = [];
  private endingPathGroup: THREE.Group | null = null;
  private visibleHitProxies: THREE.Object3D[] = [];
  private visibleWallRayTargets: THREE.Object3D[] = [];
  private hoveredWallKeys = new Set<string>();
  private canvasRect: DOMRect | null = null;

  private currentState: GameState | null = null;
  private localPlayerId: string | null = null;
  private cameraMode: CameraMode = 'dollhouse';
  private floorFilter: FloorId | 'all' = 'all';
  private reducedMotion = false;
  private menuOrbitMode = true;

  private desiredCamPos = new THREE.Vector3(16, 17, 18);
  private desiredCamTarget = new THREE.Vector3(0, 1.2, 0);
  private transitionActive = false;

  // Smooth phase-reactive atmospheric color targets
  private targetBgColor = new THREE.Color(0x0f0c0f);
  private targetHemiColor = new THREE.Color(0x8eaad4);
  private targetKeyColor = new THREE.Color(0xffdca6);
  private targetDreadGrade = 0;
  private currentDreadGrade = 0;

  // Subtle camera trauma shake (tabletop thud / revelation tremor)
  private cameraTrauma = 0;
  private appliedShakeOffset = new THREE.Vector3();

  // Immersive free-roam inside current room
  private explorerLocalOffset = new THREE.Vector3(0, 0, 1.2);
  private explorerFacingYaw = 0;
  private immersiveCamYaw = 0;
  private immersiveCamPitch = 0.42;
  private keysPressed = new Set<string>();

  // Pointer & drag tracking
  private isPointerDown = false;
  private pointerDownPos = { x: 0, y: 0 };
  private lastHoverCheck = 0;

  // Discovery spring animation & revelation flash
  private discoveryAnim: { roomId: string; progress: number } | null = null;
  private revelationFlash = 0;
  private shadersCompiled = false;

  private frameId = 0;
  private isPageHidden = false;
  private tickLoopFn: (() => void) | null = null;
  private disposed = false;

  // P006: Opt-in benchmark samples from the EXISTING render loop only.
  // Disabled in normal use; no extra requestAnimationFrame or scene ownership.
  private performanceCaptureActive = false;
  private performancePreviousFrameAt = 0;
  private performanceFrameSamples: Array<{
    intervalMs: number;
    simulationMs: number;
    renderSubmissionMs: number;
  }> = [];

  public beginPerformanceCapture(): void {
    this.performanceFrameSamples = [];
    this.performancePreviousFrameAt = 0;
    this.performanceCaptureActive = true;
  }

  public stopPerformanceCapture(): void {
    this.performanceCaptureActive = false;
  }

  public readPerformanceCapture() {
    const info = this.renderer.info;
    return {
      softwareGL: this.isSoftwareGl,
      pixelRatio: this.renderer.getPixelRatio(),
      cameraMode: this.cameraMode,
      floorFilter: this.floorFilter,
      postprocessing: Boolean(this.composer && !this.isSoftwareGl),
      canvas: { width: this.renderer.domElement.width, height: this.renderer.domElement.height },
      scene: {
        phase: this.currentState?.phase ?? null,
        roomCount: this.roomMeshes.size,
        ghostCount: this.ghostMeshes.size,
        playerCount: this.playerMeshes.size,
      },
      renderer: {
        geometries: info.memory.geometries,
        textures: info.memory.textures,
        programs: info.programs?.length ?? null,
        calls: info.render.calls,
        triangles: info.render.triangles,
      },
      samples: this.performanceFrameSamples.slice(),
    };
  }

  constructor(container: HTMLElement, callbacks: MansionSceneCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.isSoftwareGl = detectSoftwareGl();

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0f0c0f);
    this.scene.fog = new THREE.FogExp2(0x0f0c0f, 0.0085);

    // Mandatory studio environment map via PMREMGenerator + RoomEnvironment for warm metallic brass & reflections
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    this.camera = new THREE.PerspectiveCamera(44, w / Math.max(1, h), 0.1, 220);
    this.camera.position.set(17, 17, 19);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = !this.isSoftwareGl;
    this.controls.dampingFactor = 0.075;
    this.controls.maxPolarAngle = Math.PI * 0.46;
    this.controls.minPolarAngle = 0.24;
    this.controls.minDistance = 8;
    this.controls.maxDistance = 54;
    this.controls.addEventListener('start', () => {
      this.transitionActive = false;
    });

    // Studio warm-key + cool-moonlight-rim lighting rig
    this.hemiLight = new THREE.HemisphereLight(0x8eaad4, 0x3b2618, 0.92);
    this.scene.add(this.hemiLight);

    this.keyLight = new THREE.DirectionalLight(0xffdca6, 1.55);
    this.keyLight.position.set(18, 29, 16);
    this.keyLight.castShadow = !this.isSoftwareGl;
    this.keyLight.shadow.mapSize.width = 2048;
    this.keyLight.shadow.mapSize.height = 2048;
    this.keyLight.shadow.camera.near = 2;
    this.keyLight.shadow.camera.far = 96;
    const d = 28;
    this.keyLight.shadow.camera.left = -d;
    this.keyLight.shadow.camera.right = d;
    this.keyLight.shadow.camera.top = d;
    this.keyLight.shadow.camera.bottom = -d;
    this.keyLight.shadow.bias = -0.0004;
    this.keyLight.shadow.normalBias = 0.025;
    this.keyLight.shadow.radius = 3.5;
    this.scene.add(this.keyLight);
    this.scene.add(this.keyLight.target);

    this.rimLight = new THREE.DirectionalLight(0x6e94cc, 0.78);
    this.rimLight.position.set(-22, 16, -18);
    this.scene.add(this.rimLight);

    // Dynamic warm explorer handheld lantern light that glides with the active figurine
    this.explorerLanternLight = new THREE.PointLight(0xffbe64, 2.35, 9.2, 1.75);
    this.explorerLanternLight.position.set(0.3, 1.4, 0.3);
    this.scene.add(this.explorerLanternLight);

    // Fixed pool of 6 room PointLights (constant GLSL NUM_POINT_LIGHTS -> zero shader recompilation as mansion grows!)
    if (!this.isSoftwareGl) {
      for (let i = 0; i < 6; i++) {
        const pl = new THREE.PointLight(0xffb866, 0, 13.5, 1.55);
        pl.position.set(0, 2.75, 0);
        this.scene.add(pl);
        this.roomLightPool.push(pl);
      }
    }

    this.textures = createProceduralTextures(this.renderer.capabilities.getMaxAnisotropy());

    // Pre-allocate pooled click ripples (8) & dust/burst motes (36) to eliminate gameplay GC/GPU churn
    for (let i = 0; i < 8; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xf6ca6f,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const ring = new THREE.Mesh(this.sharedRippleGeo, mat);
      ring.rotation.x = -Math.PI / 2;
      ring.visible = false;
      this.scene.add(ring);
      this.ripplePool.push({ ring, mat, active: false, age: 0, duration: 0.46, maxScale: 2.4 });
    }
    for (let i = 0; i < 36; i++) {
      const mat = new THREE.SpriteMaterial({
        map: this.textures.softParticle,
        color: 0xf6ca6f,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const sp = new THREE.Sprite(mat);
      sp.visible = false;
      this.scene.add(sp);
      this.motePool.push({
        mesh: sp,
        mat,
        vel: new THREE.Vector3(),
        active: false,
        age: 0,
        duration: 0.5,
      });
    }

    // Vignetted Atmospheric Study Backdrop Dome (eliminates flat void!)
    this.scene.add(this.createStudyBackdropDome());

    // Physical Victorian Study Tabletop + Scattered Tactile Desk Props (Compass, Candles, Ledger, Blueprint)
    this.tabletopGroup = this.createVictorianStudyTabletop();
    this.scene.add(this.tabletopGroup);

    // Crisp brass hover ring
    this.hoverRing = new THREE.Mesh(
      new THREE.RingGeometry(0.42, 0.54, 32),
      new THREE.MeshBasicMaterial({
        color: 0xf6ca6f,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      })
    );
    this.hoverRing.rotation.x = -Math.PI / 2;
    this.hoverRing.visible = false;
    this.scene.add(this.hoverRing);

    // Curved dotted brass movement preview trajectory arc
    this.moveArcGroup = new THREE.Group();
    this.moveArcGroup.visible = false;
    const beadGeo = new THREE.SphereGeometry(0.11, 10, 10);
    const beadMat = new THREE.MeshBasicMaterial({
      color: 0xf7cf78,
      transparent: true,
      opacity: 0.88,
    });
    for (let i = 0; i < 12; i++) {
      const b = new THREE.Mesh(beadGeo, beadMat);
      this.moveArcBeads.push(b);
      this.moveArcGroup.add(b);
    }
    this.scene.add(this.moveArcGroup);

    // Soft circular bokeh candlelit dust motes + low tabletop atmospheric mist layer
    this.dustPoints = this.createDustMotes();
    this.scene.add(this.dustPoints);
    this.mistPoints = this.createFloorMist();
    this.scene.add(this.mistPoints);

    // GPU-only lightweight post-processing (half-res selective HDR bloom + Victorian split-tone grade)
    if (!this.isSoftwareGl) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));

      this.bloomPass = new UnrealBloomPass(
        new THREE.Vector2(Math.max(1, Math.floor(w / 2)), Math.max(1, Math.floor(h / 2))),
        0.32, // tasteful restrained glow on candle flames, lanterns & spectral cores
        0.48,
        0.88 // high threshold preserves crisp wood grain & shadows
      );
      this.composer.addPass(this.bloomPass);

      this.gradePass = new ShaderPass(VictorianGradeShader);
      this.composer.addPass(this.gradePass);
      this.composer.addPass(new OutputPass());
    }

    this.canvasRect = this.renderer.domElement.getBoundingClientRect();
    this.isPageHidden = typeof document !== 'undefined' && document.hidden;
    this.bindEvents();
    this.startLoop();
  }

  private createStudyBackdropDome(): THREE.Mesh {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const ctx = c.getContext('2d')!;
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#0a0c14');
    grad.addColorStop(0.48, '#141118');
    grad.addColorStop(0.75, '#1d1410');
    grad.addColorStop(1, '#0c0806');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(95, 24, 16),
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false })
    );
    return dome;
  }

  private createVictorianStudyTabletop(): THREE.Group {
    const g = new THREE.Group();

    // Dark tooled green-baize leather & mahogany study table inset
    const surface = new THREE.Mesh(
      new THREE.CylinderGeometry(42, 43, 0.52, 56),
      new THREE.MeshStandardMaterial({
        map: this.textures.tabletop,
        roughnessMap: this.textures.tabletopRough,
        roughness: 0.82,
        metalness: 0.05,
      })
    );
    surface.position.y = -0.63;
    surface.receiveShadow = true;

    // Carved outer mahogany rim molding + inlaid tarnished brass trim ring
    const outerWoodRim = new THREE.Mesh(
      new THREE.TorusGeometry(42.2, 0.55, 14, 64),
      new THREE.MeshStandardMaterial({
        map: this.textures.furnitureWood,
        roughnessMap: this.textures.furnitureWoodRough,
        color: 0x5c3c28,
        roughness: 0.55,
      })
    );
    outerWoodRim.rotation.x = Math.PI / 2;
    outerWoodRim.position.y = -0.4;

    const brassRim = new THREE.Mesh(
      new THREE.TorusGeometry(41.6, 0.14, 10, 64),
      new THREE.MeshStandardMaterial({
        map: this.textures.patinaBrass,
        roughnessMap: this.textures.patinaBrassRough,
        metalness: 0.88,
        roughness: 0.35,
      })
    );
    brassRim.rotation.x = Math.PI / 2;
    brassRim.position.y = -0.36;

    g.add(surface, outerWoodRim, brassRim);

    // Physical tabletop storytelling props resting around the perimeter of the study desk!
    const brassMat = new THREE.MeshStandardMaterial({
      map: this.textures.patinaBrass,
      roughnessMap: this.textures.patinaBrassRough,
      metalness: 0.88,
      roughness: 0.35,
    });
    const waxMat = new THREE.MeshStandardMaterial({ color: 0xeee0c2, roughness: 0.5 });

    // 1. Melted study pillar candles on the far north-west edge of the table
    [
      [-23, -19, 1.4],
      [-21.2, -20.5, 0.95],
    ].forEach(([cx, cz, ch]) => {
      const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.52, ch, 16), waxMat);
      candle.position.set(cx, -0.36 + ch / 2, cz);
      const saucer = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.65, 0.1, 20), brassMat);
      saucer.position.set(cx, -0.32, cz);
      const flame = new THREE.Mesh(
        new THREE.ConeGeometry(0.11, 0.34, 8),
        new THREE.MeshStandardMaterial({
          color: 0xffe49c,
          emissive: 0xffb84c,
          emissiveIntensity: 2.4,
        })
      );
      flame.position.set(cx, -0.36 + ch + 0.17, cz);
      const glow = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.textures.lightGlow,
          color: 0xffba5c,
          transparent: true,
          opacity: 0.55,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      glow.scale.set(3.4, 3.4, 1);
      glow.position.set(cx, -0.36 + ch + 0.25, cz);
      this.studyCandleFlames.push(flame);
      this.studyCandleGlows.push(glow);
      g.add(saucer, candle, flame, glow);
    });

    // 2. Antique brass pocket compass resting on the south-west baize (with live magnetic needle!)
    const compass = new THREE.Group();
    compass.position.set(-22, -0.33, 18);
    const cCase = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.2, 0.22, 24), brassMat);
    const cDial = new THREE.Mesh(
      new THREE.CircleGeometry(0.95, 24),
      new THREE.MeshStandardMaterial({ map: this.textures.clockFace, roughness: 0.35 })
    );
    cDial.rotation.x = -Math.PI / 2;
    cDial.position.y = 0.12;
    const needle = new THREE.Mesh(
      new THREE.ConeGeometry(0.08, 1.15, 4),
      new THREE.MeshStandardMaterial({ color: 0xa8342a, metalness: 0.5, roughness: 0.3 })
    );
    needle.rotation.x = -Math.PI / 2;
    needle.position.y = 0.16;
    this.compassNeedle = needle;
    compass.add(cCase, cDial, needle);
    g.add(compass);

    // 3. Leather-bound estate ledger & rolled architectural blueprint on east flank
    const ledger = new THREE.Mesh(
      new THREE.BoxGeometry(3.4, 0.42, 4.6),
      new THREE.MeshStandardMaterial({ color: 0x3b1c1c, roughness: 0.78 })
    );
    ledger.position.set(24, -0.16, 15);
    ledger.rotation.y = -0.38;
    const blueprint = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.32, 5.2, 16),
      new THREE.MeshStandardMaterial({ color: 0xdfd0ae, roughness: 0.86 })
    );
    blueprint.rotation.z = Math.PI / 2;
    blueprint.rotation.y = 0.44;
    blueprint.position.set(22, -0.06, -18);
    g.add(ledger, blueprint);

    return g;
  }

  private createDustMotes(): THREE.Points {
    const count = 190;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 38;
      pos[i * 3 + 1] = Math.random() * 11 - 0.4;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 38;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xf6de9e,
      map: this.textures.softParticle,
      size: 0.25,
      transparent: true,
      opacity: 0.44,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    return new THREE.Points(geo, mat);
  }

  private createFloorMist(): THREE.Points {
    const count = 48;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const r = 11 + Math.random() * 24;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = -0.15 + Math.random() * 0.9;
      pos[i * 3 + 2] = Math.sin(a) * r;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0x6f8db8,
      map: this.textures.lightGlow,
      size: 6.2,
      transparent: true,
      opacity: 0.085,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    return new THREE.Points(geo, mat);
  }

  public addCameraShake(amount: number): void {
    if (this.reducedMotion) return;
    this.cameraTrauma = Math.min(1.0, this.cameraTrauma + amount);
  }

  public setMenuBackdropMode(active: boolean): void {
    this.menuOrbitMode = active;
  }

  public setReducedMotion(v: boolean): void {
    this.reducedMotion = v;
  }

  public setCameraMode(mode: CameraMode): void {
    this.cameraMode = mode;
    this.controls.enabled = mode === 'dollhouse';
    this.transitionActive = true;
    this.updateFloorVisibility();
    this.updateCameraTargets();
  }

  public setFloorFilter(floor: FloorId | 'all'): void {
    this.floorFilter = floor;
    this.updateFloorVisibility();
    this.updateTabletopHeight();
    this.updateCameraTargets();
  }

  /**
   * Smoothly recenters the tabletop camera on the active explorer miniature (`Space` shortcut).
   */
  public focusActiveExplorer(): void {
    if (!this.currentState) return;
    const roomId = this.getFocusedPlayerRoomId();
    const room = roomId ? this.currentState.rooms[roomId] : null;
    if (!room) return;
    const wp = roomWorldPosition(room);
    this.desiredCamTarget.set(wp.x, wp.y + 0.8, wp.z);
    if (this.cameraMode === 'dollhouse') {
      this.desiredCamPos.set(wp.x + 12.5, wp.y + 13.5, wp.z + 13.5);
    }
    this.transitionActive = true;
  }

  /**
   * Projects a 3D room's world center into 2D viewport pixel coordinates for diegetic floating popups!
   */
  public projectRoomToScreen(roomId: string): { x: number; y: number } | null {
    const ref = this.roomMeshes.get(roomId);
    const wp = ref?.worldPos ?? (this.currentState?.rooms[roomId] ? roomWorldPosition(this.currentState.rooms[roomId]) : null);
    if (!wp) return null;
    _vecD.set(wp.x, wp.y + 2.2, wp.z).project(this.camera);
    if (_vecD.z > 1) return null;
    const rect = this.canvasRect ?? (this.canvasRect = this.renderer.domElement.getBoundingClientRect());
    return {
      x: rect.left + (_vecD.x * 0.5 + 0.5) * rect.width,
      y: rect.top + (-_vecD.y * 0.5 + 0.5) * rect.height,
    };
  }

  private acquireMoteSlot(): BurstMoteSlot {
    let oldest = this.motePool[0];
    for (let i = 0; i < this.motePool.length; i++) {
      const slot = this.motePool[i];
      if (!slot.active) return slot;
      if (slot.age > oldest.age) oldest = slot;
    }
    return oldest;
  }

  private spawnBurstMote(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    color: number,
    size: number,
    opacity: number,
    duration: number
  ): void {
    if (this.motePool.length === 0) return;
    const slot = this.acquireMoteSlot();
    slot.active = true;
    slot.age = 0;
    slot.duration = duration;
    slot.mat.color.setHex(color);
    slot.mat.opacity = opacity;
    slot.mesh.scale.set(size, size, 1);
    slot.mesh.position.set(x, y, z);
    slot.mesh.visible = true;
    slot.vel.set(vx, vy, vz);
  }

  public spawnClickRipple(
    worldPos: THREE.Vector3,
    color = 0xf6ca6f,
    maxScale = 2.4,
    moteCount = 9
  ): void {
    if (this.reducedMotion) return;
    if (this.ripplePool.length > 0) {
      let slot = this.ripplePool[0];
      for (let i = 0; i < this.ripplePool.length; i++) {
        if (!this.ripplePool[i].active) {
          slot = this.ripplePool[i];
          break;
        }
        if (this.ripplePool[i].age > slot.age) slot = this.ripplePool[i];
      }
      slot.active = true;
      slot.age = 0;
      slot.duration = 0.46;
      slot.maxScale = maxScale;
      slot.mat.color.setHex(color);
      slot.mat.opacity = 0.9;
      slot.ring.position.set(worldPos.x, worldPos.y + 0.07, worldPos.z);
      slot.ring.scale.set(0.6, 0.6, 1);
      slot.ring.visible = true;
    }

    // Soft warm dust sparks bursting outward on click/landing/discovery (zero allocations!)
    const clampedMotes = Math.min(moteCount, this.motePool.length);
    for (let i = 0; i < clampedMotes; i++) {
      const a = (i / Math.max(1, clampedMotes)) * Math.PI * 2 + Math.random() * 0.35;
      const spd = 1.3 + Math.random() * 1.85;
      const sz = 0.24 + Math.random() * 0.16;
      this.spawnBurstMote(
        worldPos.x,
        worldPos.y + 0.24,
        worldPos.z,
        Math.cos(a) * spd,
        1.35 + Math.random() * 1.25,
        Math.sin(a) * spd,
        color,
        sz,
        0.85,
        0.48 + Math.random() * 0.26
      );
    }
  }

  public skipTransitions(): void {
    if (this.discoveryAnim) {
      const ref = this.roomMeshes.get(this.discoveryAnim.roomId);
      if (ref) ref.group.scale.set(1, 1, 1);
      this.discoveryAnim = null;
    }
    this.revelationFlash = 0;
    this.cameraTrauma = 0;
  }

  public triggerDiscoveryAnimation(roomId: string): void {
    const ref = this.roomMeshes.get(roomId);
    if (!ref) return;
    const wp = ref.group.position.clone();
    this.spawnClickRipple(wp, 0xf6c96a, 5.4, 16);
    this.addCameraShake(0.24);
    if (this.reducedMotion) return;
    this.discoveryAnim = { roomId, progress: 0 };
    ref.group.scale.set(0.15, 0.15, 0.15);
  }

  public triggerRevelationVisual(): void {
    this.revelationFlash = this.reducedMotion ? 0 : 1.0;
    this.addCameraShake(0.65);
    this.setCameraMode('dollhouse');
  }

  public moveTouchPad(dx: number, dz: number): void {
    if (this.cameraMode !== 'immersive') return;
    const bound = ROOM_SIZE / 2 - 1.25;
    this.explorerLocalOffset.x = THREE.MathUtils.clamp(
      this.explorerLocalOffset.x + dx * 0.45,
      -bound,
      bound
    );
    this.explorerLocalOffset.z = THREE.MathUtils.clamp(
      this.explorerLocalOffset.z + dz * 0.45,
      -bound,
      bound
    );
    if (Math.abs(dx) + Math.abs(dz) > 0.01) {
      this.explorerFacingYaw = Math.atan2(dx, dz);
    }
  }

  public syncGameState(state: GameState, localPlayerId?: string): void {
    const prevRoomId = this.getFocusedPlayerRoomId();
    this.currentState = state;
    this.localPlayerId = localPlayerId ?? state.players[state.currentPlayerIndex]?.id ?? null;

    const validRoomIds = new Set(state.roomOrder);
    for (const [id, ref] of this.roomMeshes.entries()) {
      if (!validRoomIds.has(id)) {
        this.scene.remove(ref.group);
        disposeObjectTree(ref.group);
        this.roomMeshes.delete(id);
      }
    }

    this.ghostHitProxies = [];
    // Clear hover references if rooms rebuilt
    this.clearHoverVisuals();

    for (const roomId of state.roomOrder) {
      const room = state.rooms[roomId];
      const sig = `${room.id}:${Object.keys(room.connectedTo).sort().join(',')}:${room.searched ? 's' : 'u'}:${room.inspectedIds.join(',')}:${room.hasAnchor ? (room.anchorDisabled ? 'ad' : 'a') : ''}:${room.hasClockMechanism ? (room.clockAligned ? 'ca' : 'c') : ''}:${room.hasReflectionProof ? (room.reflectionGathered ? 'rg' : 'r') : ''}:${room.isHeartChamber ? 'h' : ''}:${room.darkened ? 'd' : ''}:${(room.lockedDirections ?? []).join(',')}`;
      const existing = this.roomMeshes.get(roomId);

      if (!existing || existing.group.userData.sig !== sig) {
        if (existing) {
          this.scene.remove(existing.group);
          disposeObjectTree(existing.group);
        }
        const built = buildRoomMesh(room, this.textures, this.isSoftwareGl);
        built.group.userData.sig = sig;
        this.scene.add(built.group);
        this.roomMeshes.set(roomId, built);
      }
    }

    // Player miniatures — animate weighted parabolic hop whenever a figurine changes rooms!
    const activeP = state.players[state.currentPlayerIndex];
    const validPlayerIds = new Set(state.players.map((p) => p.id));
    for (const [pid, mesh] of this.playerMeshes.entries()) {
      if (!validPlayerIds.has(pid)) {
        this.scene.remove(mesh);
        disposeObjectTree(mesh);
        this.playerMeshes.delete(pid);
        this.pawnMoves.delete(pid);
      }
    }

    state.players.forEach((p, idx) => {
      const isTurn = activeP?.id === p.id;
      const sig = `${p.characterId}:${isTurn}:${p.alive}`;
      let fig = this.playerMeshes.get(p.id);
      const prevPos = fig ? fig.position.clone() : null;
      const prevFigRoomId = fig?.userData.roomId as string | undefined;

      if (!fig || fig.userData.sig !== sig) {
        if (fig) {
          this.scene.remove(fig);
          disposeObjectTree(fig);
        }
        fig = buildExplorerFigurine(getCharacterById(p.characterId), this.textures, isTurn);
        fig.userData.sig = sig;
        if (prevPos) fig.position.copy(prevPos);
        this.scene.add(fig);
        this.playerMeshes.set(p.id, fig);
      }
      fig.visible = p.alive;
      fig.userData.roomId = p.roomId;

      const room = state.rooms[p.roomId];
      if (room) {
        const base = roomWorldPosition(room);
        const isFocused = p.id === (this.localPlayerId ?? activeP?.id);
        let targetPos: THREE.Vector3;
        if (isFocused && this.cameraMode === 'immersive') {
          targetPos = new THREE.Vector3(
            base.x + this.explorerLocalOffset.x,
            base.y,
            base.z + this.explorerLocalOffset.z
          );
        } else {
          const angle = (idx / Math.max(1, state.players.length)) * Math.PI * 2;
          const r = state.players.length > 1 ? 1.15 : 0;
          targetPos = new THREE.Vector3(base.x + Math.cos(angle) * r, base.y, base.z + Math.sin(angle) * r);
        }

        if (prevPos && prevFigRoomId && prevFigRoomId !== p.roomId && !this.reducedMotion) {
          // Weighted tabletop hop from previous room to destination!
          const yaw = Math.atan2(targetPos.x - prevPos.x, targetPos.z - prevPos.z);
          this.pawnMoves.set(p.id, {
            start: prevPos.clone(),
            end: targetPos.clone(),
            age: 0,
            duration: 0.42,
            landed: false,
            settleAge: 0,
            baseYaw: yaw,
          });
        } else if (!this.pawnMoves.has(p.id)) {
          fig.position.copy(targetPos);
        }
      }
    });

    // Ghosts
    const activeGhosts = state.ghosts.filter((g) => !g.soothed && g.state !== 'vanishing');
    const validGhostIds = new Set(activeGhosts.map((g) => g.id));
    for (const [gid, mesh] of this.ghostMeshes.entries()) {
      if (!validGhostIds.has(gid)) {
        this.scene.remove(mesh);
        disposeObjectTree(mesh);
        this.ghostMeshes.delete(gid);
      }
    }
    activeGhosts.forEach((g, idx) => {
      let gm = this.ghostMeshes.get(g.id);
      if (!gm) {
        gm = buildGhostMesh(g, this.textures);
        this.scene.add(gm);
        this.ghostMeshes.set(g.id, gm);
      }
      const room = state.rooms[g.roomId];
      if (room) {
        const base = roomWorldPosition(room);
        gm.position.set(base.x + (idx % 2 === 0 ? 1.85 : -1.85), base.y, base.z - 1.55);
      }
      gm.userData.roomId = g.roomId;
      gm.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          child.userData = {
            kind: 'ghost',
            ghostId: g.id,
            roomId: g.roomId,
            label: `Interact with ${g.name} · 1 AP`,
            hoverVisual: gm,
          };
          this.ghostHitProxies.push({ roomId: g.roomId, obj: child });
        }
      });
    });

    // Smooth phase & dread-sensitive atmospheric lighting targets (lerped per frame!)
    if (state.phase === 'revelation') {
      this.targetBgColor.setHex(0x180d11);
      this.targetHemiColor.setHex(0xc97b84);
      this.targetKeyColor.setHex(0xffb58a);
      this.targetDreadGrade = 0.88;
    } else if (state.phase === 'ended' && state.ending?.victory) {
      this.targetBgColor.setHex(0x162030);
      this.targetHemiColor.setHex(0xa8ceee);
      this.targetKeyColor.setHex(0xffe7b5);
      this.targetDreadGrade = 0.0;
    } else {
      const dreadFrac = Math.min(1, state.pressure / Math.max(1, state.revelationThreshold));
      this.targetBgColor.setHex(0x0f0c0f).lerp(new THREE.Color(0x150c0e), dreadFrac * 0.5);
      this.targetHemiColor.setHex(0x8eaad4).lerp(new THREE.Color(0xa6808a), dreadFrac * 0.45);
      this.targetKeyColor.setHex(0xffdca6).lerp(new THREE.Color(0xffc090), dreadFrac * 0.35);
      this.targetDreadGrade = dreadFrac * 0.45;
    }

    this.rebuildEndingPath(state);

    // Pre-warm GPU shader programs once on first state population
    if (!this.shadersCompiled && !this.isSoftwareGl) {
      this.shadersCompiled = true;
      this.renderer.compile(this.scene, this.camera);
    }

    const newRoomId = this.getFocusedPlayerRoomId();
    if (prevRoomId !== newRoomId) {
      this.explorerLocalOffset.set(0, 0, 1.2);
      this.transitionActive = true;
    }

    this.updateFloorVisibility();
    this.updateTabletopHeight();
    this.updateCameraTargets();
  }

  private clearHoverVisuals(): void {
    if (this.hoveredVisualTarget) {
      this.hoveredVisualTarget.scale.copy(this.hoveredVisualBaseScale);
      this.hoveredVisualTarget.position.y = this.hoveredVisualBaseY;
      this.hoveredVisualTarget = null;
    }
    if (this.hoveredDoorTarget) {
      this.hoveredDoorTarget.pivot.rotation.y = this.hoveredDoorTarget.baseAngle;
      this.hoveredDoorTarget = null;
    }
    this.hoveredRoomHighlightId = null;
    this.moveArcGroup.visible = false;
  }

  private updateTabletopHeight(): void {
    if (!this.currentState) return;
    let minFloor = 0;
    for (const id of this.currentState.roomOrder) {
      const r = this.currentState.rooms[id];
      const ref = this.roomMeshes.get(id);
      if (r && ref?.group.visible && r.floor < minFloor) {
        minFloor = r.floor;
      }
    }
    this.tabletopGroup.position.y = minFloor * FLOOR_SPACING;
  }

  private rebuildEndingPath(state: GameState): void {
    if (this.endingPathGroup) {
      this.scene.remove(this.endingPathGroup);
      disposeObjectTree(this.endingPathGroup);
      this.endingPathGroup = null;
    }
    if (state.phase !== 'ended') return;

    const group = new THREE.Group();
    const colors = [0xf2c56b, 0x80ded7, 0xe0756e, 0xc49ae3];
    state.players.forEach((p, idx) => {
      const pts: THREE.Vector3[] = [];
      for (const rid of p.pathHistory) {
        const r = state.rooms[rid];
        if (r) {
          const wp = roomWorldPosition(r);
          pts.push(new THREE.Vector3(wp.x + idx * 0.25, wp.y + 1.25, wp.z + idx * 0.25));
        }
      }
      if (pts.length >= 2) {
        const curve = new THREE.CatmullRomCurve3(pts);
        const tube = new THREE.Mesh(
          new THREE.TubeGeometry(curve, Math.min(120, pts.length * 10), 0.14, 10, false),
          new THREE.MeshBasicMaterial({ color: colors[idx % colors.length] })
        );
        group.add(tube);
      }
    });
    this.endingPathGroup = group;
    this.scene.add(group);
  }

  private getFocusedPlayerRoomId(): string | null {
    if (!this.currentState) return null;
    const p =
      this.currentState.players.find((pl) => pl.id === this.localPlayerId) ??
      this.currentState.players[this.currentState.currentPlayerIndex];
    return p?.roomId ?? null;
  }

  private isRoomDirectlyAdjacent(fromRoomId: string, toRoomId: string): boolean {
    if (!this.currentState) return false;
    const from = this.currentState.rooms[fromRoomId];
    if (!from) return false;
    return (
      Object.values(from.connectedTo).includes(toRoomId) || from.stairLinks.includes(toRoomId)
    );
  }

  private updateFloorVisibility(): void {
    if (!this.currentState) return;
    const focusedRoomId = this.getFocusedPlayerRoomId();
    const focusedFloor = focusedRoomId ? this.currentState.rooms[focusedRoomId]?.floor ?? 0 : 0;

    for (const [roomId, ref] of this.roomMeshes.entries()) {
      const room = this.currentState.rooms[roomId];
      if (!room) continue;
      if (this.cameraMode === 'immersive') {
        ref.group.visible = room.floor === focusedFloor;
      } else {
        ref.group.visible = this.floorFilter === 'all' || room.floor === this.floorFilter;
      }
    }
    this.rebuildVisibleRayTargets();
    this.updateTabletopHeight();
  }

  private rebuildVisibleRayTargets(): void {
    this.visibleHitProxies.length = 0;
    this.visibleWallRayTargets.length = 0;

    for (const ref of this.roomMeshes.values()) {
      if (!ref.group.visible) continue;
      for (let i = 0; i < ref.hitProxies.length; i++) {
        this.visibleHitProxies.push(ref.hitProxies[i]);
      }
      this.visibleWallRayTargets.push(
        ref.walls.N.rayTarget,
        ref.walls.E.rayTarget,
        ref.walls.S.rayTarget,
        ref.walls.W.rayTarget
      );
    }

    for (let i = 0; i < this.ghostHitProxies.length; i++) {
      const gp = this.ghostHitProxies[i];
      const roomRef = this.roomMeshes.get(gp.roomId);
      if (!roomRef || roomRef.group.visible) {
        this.visibleHitProxies.push(gp.obj);
      }
    }
  }

  /**
   * Smooth mouse-hover + 360° camera-facing wall disappearance (zero Y-squashing!)
   * Opaque-first at rest for hardware early-Z; settles cleanly when stationary.
   */
  private updateDynamicWallFading(dt: number): void {
    const fadeSpeed = this.reducedMotion ? 40 : 15;
    const frontDotThreshold = this.cameraMode === 'dollhouse' ? 0.16 : 0.28;
    const dirs: Direction[] = ['N', 'E', 'S', 'W'];

    for (const ref of this.roomMeshes.values()) {
      if (!ref.group.visible) continue;
      for (let d = 0; d < 4; d++) {
        const wall: WallFadeEntry = ref.walls[dirs[d]];

        _vecA.subVectors(this.camera.position, wall.worldCenter).normalize();
        const facingDot = _vecA.dot(wall.outwardNormal);

        const shouldHide = this.hoveredWallKeys.has(wall.wallKey) || facingDot > frontDotThreshold;
        const targetOpacity = shouldHide ? 0.0 : wall.baseOpacity;

        if (wall.settled && Math.abs(wall.currentOpacity - targetOpacity) < 0.002) {
          continue;
        }

        wall.currentOpacity = THREE.MathUtils.damp(
          wall.currentOpacity,
          targetOpacity,
          fadeSpeed,
          dt
        );
        if (Math.abs(wall.currentOpacity - targetOpacity) < 0.004) {
          wall.currentOpacity = targetOpacity;
          wall.settled = true;
        } else {
          wall.settled = false;
        }

        const visible = wall.currentOpacity > 0.035;
        wall.upperGroup.visible = visible;
        if (visible) {
          const wantTransparent = !wall.isOpaqueDefault || wall.currentOpacity < 0.992;
          const toggleTransparency = wantTransparent !== wall.isTransparentActive;
          const normScale = wall.baseOpacity > 0 ? wall.currentOpacity / wall.baseOpacity : 0;

          for (let m = 0; m < wall.materials.length; m++) {
            const mat = wall.materials[m];
            const alwaysTrans = Boolean(mat.userData?.alwaysTransparent);
            const matBaseOp = (mat.userData?.baseOpacity as number | undefined) ?? 1.0;
            mat.opacity = matBaseOp * normScale;

            if (!alwaysTrans) {
              if (toggleTransparency) {
                mat.transparent = wantTransparent;
                mat.needsUpdate = true;
              }
              mat.depthWrite = !wantTransparent;
            }
          }
          wall.isTransparentActive = wantTransparent;
        }
      }
    }
  }

  private updateCameraTargets(): void {
    if (!this.currentState) return;
    const roomId = this.getFocusedPlayerRoomId();
    const room = roomId ? this.currentState.rooms[roomId] : this.currentState.rooms.room_entrance;
    if (!room) return;

    const base = roomWorldPosition(room);
    if (this.cameraMode === 'immersive') {
      const px = base.x + this.explorerLocalOffset.x;
      const py = base.y + 1.3;
      const pz = base.z + this.explorerLocalOffset.z;
      const dist = 7.4;
      this.desiredCamTarget.set(px, py, pz);
      this.desiredCamPos.set(
        px + Math.sin(this.immersiveCamYaw) * dist * Math.cos(this.immersiveCamPitch),
        py + Math.sin(this.immersiveCamPitch) * dist + 1.8,
        pz + Math.cos(this.immersiveCamYaw) * dist * Math.cos(this.immersiveCamPitch)
      );
    } else {
      let sumX = 0;
      let sumY = 0;
      let sumZ = 0;
      let count = 0;
      for (const id of this.currentState.roomOrder) {
        const r = this.currentState.rooms[id];
        if (this.floorFilter === 'all' || r.floor === this.floorFilter) {
          const p = roomWorldPosition(r);
          sumX += p.x;
          sumY += p.y;
          sumZ += p.z;
          count++;
        }
      }
      const cx = count > 0 ? sumX / count : base.x;
      const cy = count > 0 ? sumY / count : base.y;
      const cz = count > 0 ? sumZ / count : base.z;
      const spread = Math.max(14.5, Math.min(34, 12.2 + this.currentState.roomOrder.length * 1.0));

      this.desiredCamTarget.set(cx, cy + 0.6, cz);
      this.desiredCamPos.set(cx + spread * 0.72, cy + spread * 0.78, cz + spread * 0.82);

      // Keep directional keyLight shadow frustum dynamically centered on the active mansion footprint
      this.keyLight.target.position.set(cx, cy, cz);
      this.keyLight.position.set(cx + 18, cy + 29, cz + 16);
      this.keyLight.target.updateMatrixWorld();
    }
  }

  private bindEvents(): void {
    window.addEventListener('resize', this.onResize);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    document.addEventListener('visibilitychange', this.onVisibilityChange);

    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', this.onPointerDown);
    el.addEventListener('pointermove', this.onPointerMove);
    el.addEventListener('pointerup', this.onPointerUp);
    el.addEventListener('pointerleave', this.onPointerLeave);
    el.addEventListener('webglcontextlost', this.onContextLost);
  }

  private onVisibilityChange = (): void => {
    if (this.disposed) return;
    const hidden = document.hidden;
    if (hidden === this.isPageHidden) return;
    this.isPageHidden = hidden;
    if (hidden) {
      cancelAnimationFrame(this.frameId);
      clearTimeout(this.frameId);
      this.frameId = 0;
    } else if (this.tickLoopFn) {
      // Discard accumulated delta while backgrounded so animations never jump
      this.clock.getDelta();
      this.frameId = requestAnimationFrame(this.tickLoopFn);
    }
  };

  private onContextLost = (e: Event): void => {
    e.preventDefault();
  };

  private onResize = (): void => {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    if (this.composer) {
      this.composer.setSize(w, h);
    }
    if (this.bloomPass) {
      this.bloomPass.resolution.set(Math.max(1, Math.floor(w / 2)), Math.max(1, Math.floor(h / 2)));
    }
    this.canvasRect = this.renderer.domElement.getBoundingClientRect();
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    this.keysPressed.add(e.key.toLowerCase());
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keysPressed.delete(e.key.toLowerCase());
  };

  private onPointerDown = (e: PointerEvent): void => {
    this.isPointerDown = true;
    this.pointerDownPos = { x: e.clientX, y: e.clientY };
  };

  private onPointerLeave = (): void => {
    this.hoveredWallKeys.clear();
    this.hoverRing.visible = false;
    this.clearHoverVisuals();
    this.lastHoverKey = null;
    this.callbacks.onHoverHint(null);
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (this.isPointerDown && this.cameraMode === 'immersive') {
      const dx = e.clientX - this.pointerDownPos.x;
      const dy = e.clientY - this.pointerDownPos.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) {
        this.immersiveCamYaw -= dx * 0.0065;
        this.immersiveCamPitch = THREE.MathUtils.clamp(
          this.immersiveCamPitch + dy * 0.0045,
          0.18,
          1.12
        );
        this.pointerDownPos = { x: e.clientX, y: e.clientY };
        this.updateCameraTargets();
        return;
      }
    }

    const now = performance.now();
    if (now - this.lastHoverCheck < 28) return;
    this.lastHoverCheck = now;

    this.updatePointerRay(e);

    // 1. Raycast pre-cached visible walls under pointer -> smoothly make them vanish!
    this.hoveredWallKeys.clear();
    const wallHits = this.raycaster.intersectObjects(this.visibleWallRayTargets, false);
    for (let i = 0; i < Math.min(3, wallHits.length); i++) {
      const ud = wallHits[i].object.userData as { wallRoomId?: string; wallDirection?: Direction };
      if (ud.wallRoomId && ud.wallDirection) {
        this.hoveredWallKeys.add(`${ud.wallRoomId}:${ud.wallDirection}`);
      }
    }

    if (this.menuOrbitMode) {
      this.hoverRing.visible = false;
      this.moveArcGroup.visible = false;
      this.callbacks.onHoverHint(null);
      return;
    }

    // 2. Raycast interactive board elements -> provide immediate tactile visual & audio feedback!
    const picked = this.pickInteractiveHit();
    const myRoomId = this.getFocusedPlayerRoomId();

    // Suppress useless hover hint on your own empty room floor
    const isOwnEmptyFloor =
      picked && picked.hit.kind === 'room_floor' && picked.hit.roomId === myRoomId;

    if (picked && !isOwnEmptyFloor) {
      const h = picked.hit;
      const hoverKey = `${h.kind}:${h.roomId}:${h.direction ?? ''}:${h.interactableId ?? ''}:${h.ghostId ?? ''}`;
      if (hoverKey !== this.lastHoverKey) {
        this.lastHoverKey = hoverKey;
        this.callbacks.onHoverTick?.();
      }

      // Compute clean contextual hover label
      let displayLabel = h.label ?? '';
      if (h.kind === 'room_floor' && myRoomId) {
        const adj = this.isRoomDirectlyAdjacent(myRoomId, h.roomId);
        displayLabel = adj ? `Move to ${h.label} · 1 AP` : `Walk to ${h.label}`;
      }

      this.renderer.domElement.style.cursor = 'pointer';
      this.callbacks.onHoverHint({
        label: displayLabel,
        x: e.clientX,
        y: e.clientY,
        kind: h.kind,
      });

      // Floor hover ring snaps crisply to room floor elevation (never buried inside a box!)
      const hitRoom = this.currentState?.rooms[h.roomId];
      const floorY = hitRoom ? roomWorldPosition(hitRoom).y + 0.045 : picked.point.y + 0.05;
      this.hoverRing.visible = h.kind !== 'room_floor';
      this.hoverRing.position.set(picked.point.x, floorY, picked.point.z);

      // Update tactile hover visual lift target (curio chest, doorway crest, spyglass, ghost)
      if (this.hoveredVisualTarget !== (h.hoverVisual ?? null)) {
        if (this.hoveredVisualTarget) {
          this.hoveredVisualTarget.scale.copy(this.hoveredVisualBaseScale);
          this.hoveredVisualTarget.position.y = this.hoveredVisualBaseY;
        }
        this.hoveredVisualTarget = h.hoverVisual ?? null;
        if (this.hoveredVisualTarget) {
          this.hoveredVisualBaseY = this.hoveredVisualTarget.position.y;
          this.hoveredVisualBaseScale.copy(this.hoveredVisualTarget.scale);
        }
      }

      // Crack hovered unexplored door leaf ajar!
      if (h.doorPivot && h.doorBaseAngle !== undefined) {
        if (this.hoveredDoorTarget && this.hoveredDoorTarget.pivot !== h.doorPivot) {
          this.hoveredDoorTarget.pivot.rotation.y = this.hoveredDoorTarget.baseAngle;
        }
        this.hoveredDoorTarget = { pivot: h.doorPivot, baseAngle: h.doorBaseAngle };
      } else if (this.hoveredDoorTarget) {
        this.hoveredDoorTarget.pivot.rotation.y = this.hoveredDoorTarget.baseAngle;
        this.hoveredDoorTarget = null;
      }

      // Highlight destination room border + curved brass movement preview arc!
      const destRoomId =
        h.kind === 'room_floor'
          ? h.roomId
          : h.kind === 'connected_door' && h.targetRoomId
            ? h.targetRoomId
            : null;
      this.hoveredRoomHighlightId = destRoomId;

      if (destRoomId && myRoomId && destRoomId !== myRoomId && this.currentState) {
        const fromRoom = this.currentState.rooms[myRoomId];
        const toRoom = this.currentState.rooms[destRoomId];
        if (fromRoom && toRoom) {
          this.moveArcFrom.copy(roomWorldPosition(fromRoom)).add(_vecD.set(0, 0.35, 0));
          this.moveArcTo.copy(roomWorldPosition(toRoom)).add(_vecD.set(0, 0.35, 0));
          const dist = this.moveArcFrom.distanceTo(this.moveArcTo);
          this.moveArcHeight = Math.min(3.8, Math.max(1.2, dist * 0.24));
          for (let i = 0; i < this.moveArcBeads.length; i++) {
            const t = (i + 1) / (this.moveArcBeads.length + 1);
            const bx = THREE.MathUtils.lerp(this.moveArcFrom.x, this.moveArcTo.x, t);
            const bz = THREE.MathUtils.lerp(this.moveArcFrom.z, this.moveArcTo.z, t);
            const by =
              THREE.MathUtils.lerp(this.moveArcFrom.y, this.moveArcTo.y, t) +
              Math.sin(t * Math.PI) * this.moveArcHeight;
            this.moveArcBeads[i].position.set(bx, by, bz);
          }
          this.moveArcGroup.visible = true;
        } else {
          this.moveArcGroup.visible = false;
        }
      } else {
        this.moveArcGroup.visible = false;
      }
    } else {
      this.renderer.domElement.style.cursor = this.cameraMode === 'dollhouse' ? 'grab' : 'default';
      this.callbacks.onHoverHint(null);
      this.hoverRing.visible = false;
      this.clearHoverVisuals();
      this.lastHoverKey = null;
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    const movedDist = Math.hypot(
      e.clientX - this.pointerDownPos.x,
      e.clientY - this.pointerDownPos.y
    );
    this.isPointerDown = false;
    if (movedDist > 7 || this.menuOrbitMode) return;

    this.updatePointerRay(e);
    const picked = this.pickInteractiveHit();
    if (picked) {
      const hitRoom = this.currentState?.rooms[picked.hit.roomId];
      const floorY = hitRoom ? roomWorldPosition(hitRoom).y : picked.point.y;
      const ripplePos = new THREE.Vector3(picked.point.x, floorY, picked.point.z);
      const color =
        picked.hit.kind === 'unexplored_door'
          ? 0xf7cf74
          : picked.hit.kind === 'interactable'
            ? 0x8cdbc7
            : picked.hit.kind === 'scenario_objective'
              ? 0xe86c60
              : 0xe6bc6b;
      this.spawnClickRipple(ripplePos, color, 2.3);
      this.callbacks.onSelectHit(picked.hit, { x: e.clientX, y: e.clientY });
    }
  };

  private updatePointerRay(e: PointerEvent): void {
    const rect = this.canvasRect ?? (this.canvasRect = this.renderer.domElement.getBoundingClientRect());
    _mouse.x = ((e.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    _mouse.y = -((e.clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;
    this.raycaster.setFromCamera(_mouse, this.camera);
  }

  private pickInteractiveHit(): { hit: SceneInteractionHit; point: THREE.Vector3 } | null {
    const hits = this.raycaster.intersectObjects(this.visibleHitProxies, false);
    if (hits.length === 0) return null;

    const priority = (kind: string): number => {
      switch (kind) {
        case 'scenario_objective':
          return 0;
        case 'unexplored_door':
          return 1;
        case 'search_room':
          return 2;
        case 'interactable':
          return 3;
        case 'ghost':
          return 4;
        case 'staircase':
          return 5;
        case 'connected_door':
          return 6;
        default:
          return 10;
      }
    };

    let best = hits[0];
    let bestPrio = priority(String(best.object.userData?.kind));
    for (let i = 1; i < hits.length; i++) {
      const p = priority(String(hits[i].object.userData?.kind));
      if (p < bestPrio) {
        bestPrio = p;
        best = hits[i];
      }
    }
    const ud = best.object.userData as SceneInteractionHit | undefined;
    if (!ud || !ud.kind) return null;
    return { hit: ud, point: best.point };
  }

  private startLoop(): void {
    const afterDraw = (cb: () => void) => {
      const gl = this.renderer.getContext() as WebGL2RenderingContext;
      if (gl && typeof gl.fenceSync === 'function') {
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        const poll = () => {
          if (this.disposed || this.isPageHidden) return;
          const st = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
          if (st === gl.UNSIGNALED) {
            this.frameId = window.setTimeout(poll, 6);
          } else {
            if (sync) gl.deleteSync(sync);
            this.frameId = window.setTimeout(cb, 80);
          }
        };
        this.frameId = window.setTimeout(poll, 6);
      } else {
        this.frameId = window.setTimeout(cb, 80);
      }
    };

    const tick = () => {
      if (this.disposed || this.isPageHidden) return;
      const tracking = this.performanceCaptureActive;
      const start = tracking ? performance.now() : 0;
      const intervalMs = tracking && this.performancePreviousFrameAt > 0
        ? start - this.performancePreviousFrameAt : 0;
      if (tracking) this.performancePreviousFrameAt = start;
      const dt = Math.min(0.05, this.clock.getDelta());
      const elapsed = this.clock.elapsedTime;

      this.updateSimulation(dt, elapsed);
      const afterSimulation = tracking ? performance.now() : 0;

      if (this.composer && !this.isSoftwareGl) {
        this.composer.render();
      } else {
        this.renderer.render(this.scene, this.camera);
      }

      if (tracking && intervalMs > 0) {
        this.performanceFrameSamples.push({
          intervalMs,
          simulationMs: afterSimulation - start,
          renderSubmissionMs: performance.now() - afterSimulation,
        });
        if (this.performanceFrameSamples.length > 1200) this.performanceFrameSamples.shift();
      }

      if (this.isSoftwareGl) {
        afterDraw(tick);
      } else {
        this.frameId = requestAnimationFrame(tick);
      }
    };

    this.tickLoopFn = tick;
    if (!this.isPageHidden) {
      this.frameId = requestAnimationFrame(tick);
    }
  }

  private updateSimulation(dt: number, elapsed: number): void {
    // Undo previous frame's camera trauma offset before OrbitControls/camera transitions update
    if (this.appliedShakeOffset.lengthSq() > 0) {
      this.camera.position.sub(this.appliedShakeOffset);
      this.appliedShakeOffset.set(0, 0, 0);
    }

    // 1. Weighted parabolic pawn hop + golden lantern dust trail + landing squash & micro-thud!
    for (const [pid, anim] of this.pawnMoves.entries()) {
      const fig = this.playerMeshes.get(pid);
      if (!fig) {
        this.pawnMoves.delete(pid);
        continue;
      }
      if (!anim.landed) {
        anim.age += dt;
        const u = Math.min(1, anim.age / anim.duration);
        const eased = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
        const arcY = Math.sin(u * Math.PI) * 1.65;
        fig.position.set(
          THREE.MathUtils.lerp(anim.start.x, anim.end.x, eased),
          THREE.MathUtils.lerp(anim.start.y, anim.end.y, eased) + arcY,
          THREE.MathUtils.lerp(anim.start.z, anim.end.z, eased)
        );
        fig.rotation.y = THREE.MathUtils.damp(fig.rotation.y, anim.baseYaw, 14, dt);
        fig.rotation.x = Math.sin(u * Math.PI) * 0.17; // lean forward mid-hop!

        // Delicate warm dust trail motes following the moving miniature (pooled, zero GC!)
        this.hopTrailAccum += dt;
        if (!this.reducedMotion && this.hopTrailAccum >= 0.045) {
          this.hopTrailAccum = 0;
          this.spawnBurstMote(
            fig.position.x + (Math.random() - 0.5) * 0.2,
            fig.position.y + 0.55,
            fig.position.z + (Math.random() - 0.5) * 0.2,
            (Math.random() - 0.5) * 0.35,
            0.45,
            (Math.random() - 0.5) * 0.35,
            0xf7cf78,
            0.28,
            0.72,
            0.36
          );
        }

        if (u >= 1) {
          anim.landed = true;
          fig.position.copy(anim.end);
          fig.rotation.x = 0;
          this.spawnClickRipple(anim.end, 0xf2c56b, 1.95, 10);
          this.addCameraShake(0.08);
          this.callbacks.onPawnLanded?.();
        }
      } else {
        // Tactile landing squash-settle
        anim.settleAge += dt;
        const su = Math.min(1, anim.settleAge / 0.18);
        const squash = Math.sin(su * Math.PI) * 0.13;
        fig.scale.set(1 + squash * 0.72, 1 - squash, 1 + squash * 0.72);
        if (su >= 1) {
          fig.scale.set(1, 1, 1);
          this.pawnMoves.delete(pid);
        }
      }
    }

    // 2. Immersive WASD room walk
    if (this.cameraMode === 'immersive' && this.currentState && !this.menuOrbitMode) {
      let mx = 0;
      let mz = 0;
      if (this.keysPressed.has('w') || this.keysPressed.has('arrowup')) mz -= 1;
      if (this.keysPressed.has('s') || this.keysPressed.has('arrowdown')) mz += 1;
      if (this.keysPressed.has('a') || this.keysPressed.has('arrowleft')) mx -= 1;
      if (this.keysPressed.has('d') || this.keysPressed.has('arrowright')) mx += 1;

      if (mx !== 0 || mz !== 0) {
        const len = Math.hypot(mx, mz);
        const nx = mx / len;
        const nz = mz / len;
        const sinY = Math.sin(this.immersiveCamYaw);
        const cosY = Math.cos(this.immersiveCamYaw);
        const wx = nx * cosY + nz * sinY;
        const wz = -nx * sinY + nz * cosY;

        const speed = 3.8 * dt;
        const bound = ROOM_SIZE / 2 - 1.25;
        this.explorerLocalOffset.x = THREE.MathUtils.clamp(
          this.explorerLocalOffset.x + wx * speed,
          -bound,
          bound
        );
        this.explorerLocalOffset.z = THREE.MathUtils.clamp(
          this.explorerLocalOffset.z + wz * speed,
          -bound,
          bound
        );
        this.explorerFacingYaw = Math.atan2(wx, wz);
      }

      const activeId =
        this.localPlayerId ?? this.currentState.players[this.currentState.currentPlayerIndex]?.id;
      const focusedRoomId = this.getFocusedPlayerRoomId();
      const fig = activeId ? this.playerMeshes.get(activeId) : null;
      const room = focusedRoomId ? this.currentState.rooms[focusedRoomId] : null;
      if (fig && room && !this.pawnMoves.has(activeId!)) {
        const base = roomWorldPosition(room);
        fig.position.set(
          base.x + this.explorerLocalOffset.x,
          base.y,
          base.z + this.explorerLocalOffset.z
        );
        fig.rotation.y = THREE.MathUtils.damp(fig.rotation.y, this.explorerFacingYaw, 10, dt);
      }
      this.updateCameraTargets();
    }

    // 3. Camera framing & gentle main-menu showcase orbit with organic elevation undulation
    const dampRate = this.reducedMotion ? 20 : 5.5;
    if (this.menuOrbitMode && !this.reducedMotion) {
      const angle = elapsed * 0.11 + 0.52;
      const radius = 20.2 + Math.sin(elapsed * 0.28) * 0.9;
      const camY = 13.6 + Math.sin(elapsed * 0.35) * 0.75;
      this.camera.position.set(Math.cos(angle) * radius, camY, Math.sin(angle) * radius);
      this.controls.target.set(-1.5, 0.95, -2.0); // frames mansion cleanly to the right of menu typography!
      this.camera.lookAt(this.controls.target);
    } else if (this.cameraMode === 'immersive') {
      const alpha = 1 - Math.exp(-dampRate * dt);
      this.camera.position.lerp(this.desiredCamPos, alpha);
      this.controls.target.lerp(this.desiredCamTarget, alpha);
      this.camera.lookAt(this.controls.target);
    } else {
      if (this.transitionActive) {
        const alpha = 1 - Math.exp(-dampRate * dt);
        this.camera.position.lerp(this.desiredCamPos, alpha);
        this.controls.target.lerp(this.desiredCamTarget, alpha);
        if (this.camera.position.distanceTo(this.desiredCamPos) < 0.08) {
          this.transitionActive = false;
        }
      }
      this.controls.update();
    }

    // Apply subtle decaying camera micro-shake on top of resolved camera pose
    if (this.cameraTrauma > 0.002 && !this.reducedMotion) {
      const shake = this.cameraTrauma * this.cameraTrauma * 0.42;
      this.appliedShakeOffset.set(
        Math.sin(elapsed * 47.0) * shake,
        Math.cos(elapsed * 53.0) * shake * 0.75,
        Math.sin(elapsed * 41.0 + 1.2) * shake
      );
      this.camera.position.add(this.appliedShakeOffset);
      this.cameraTrauma = Math.max(0, this.cameraTrauma - dt * 2.1);
    } else {
      this.cameraTrauma = 0;
    }

    // 4. Smooth mouse-hover + 360° camera-facing wall disappearance
    this.updateDynamicWallFading(dt);

    // 5. Tactile hover juice: lift hovered prop, crack hovered door ajar, glow destination room border
    if (this.hoveredVisualTarget && !this.reducedMotion) {
      const targetS = 1.13;
      this.hoveredVisualTarget.scale.x = THREE.MathUtils.damp(
        this.hoveredVisualTarget.scale.x,
        this.hoveredVisualBaseScale.x * targetS,
        14,
        dt
      );
      this.hoveredVisualTarget.scale.y = THREE.MathUtils.damp(
        this.hoveredVisualTarget.scale.y,
        this.hoveredVisualBaseScale.y * targetS,
        14,
        dt
      );
      this.hoveredVisualTarget.scale.z = THREE.MathUtils.damp(
        this.hoveredVisualTarget.scale.z,
        this.hoveredVisualBaseScale.z * targetS,
        14,
        dt
      );
      this.hoveredVisualTarget.position.y = THREE.MathUtils.damp(
        this.hoveredVisualTarget.position.y,
        this.hoveredVisualBaseY + 0.14,
        14,
        dt
      );
    }
    if (this.hoveredDoorTarget) {
      this.hoveredDoorTarget.pivot.rotation.y = THREE.MathUtils.damp(
        this.hoveredDoorTarget.pivot.rotation.y,
        this.hoveredDoorTarget.baseAngle - 0.42,
        12,
        dt
      );
    }

    for (const [roomId, ref] of this.roomMeshes.entries()) {
      const targetOp = roomId === this.hoveredRoomHighlightId ? 0.72 : 0.0;
      const curOp = ref.hoverBorderMat.opacity;
      if (Math.abs(curOp - targetOp) < 0.004) {
        if (curOp !== targetOp) ref.hoverBorderMat.opacity = targetOp;
        ref.hoverBorderMesh.visible = targetOp > 0.005;
      } else {
        const nextOp = THREE.MathUtils.damp(curOp, targetOp, 14, dt);
        ref.hoverBorderMat.opacity = nextOp;
        ref.hoverBorderMesh.visible = nextOp > 0.005;
      }
    }

    // 6. Elastic tabletop placement animation for newly discovered rooms!
    if (this.discoveryAnim) {
      this.discoveryAnim.progress = Math.min(1, this.discoveryAnim.progress + dt * 2.1);
      const ref = this.roomMeshes.get(this.discoveryAnim.roomId);
      if (ref) {
        const p = this.discoveryAnim.progress;
        // Back-out spring overshoot (feels like setting a physical wood tile down onto the board!)
        const c1 = 1.4;
        const c3 = c1 + 1;
        const s = 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
        ref.group.scale.set(s, s, s);
      }
      if (this.discoveryAnim.progress >= 1) {
        if (ref) ref.group.scale.set(1, 1, 1);
        this.discoveryAnim = null;
      }
    }

    // 7. Pooled click ripples & bokeh dust bursts (zero allocation/disposal per frame!)
    for (let i = 0; i < this.ripplePool.length; i++) {
      const r = this.ripplePool[i];
      if (!r.active) continue;
      r.age += dt;
      const u = Math.min(1, r.age / r.duration);
      const ease = 1 - Math.pow(1 - u, 3);
      const sc = 0.6 + ease * r.maxScale;
      r.ring.scale.set(sc, sc, 1);
      r.mat.opacity = (1 - u) * 0.82;
      if (u >= 1) {
        r.active = false;
        r.ring.visible = false;
      }
    }

    for (let i = 0; i < this.motePool.length; i++) {
      const m = this.motePool[i];
      if (!m.active) continue;
      m.age += dt;
      const u = Math.min(1, m.age / m.duration);
      m.mesh.position.addScaledVector(m.vel, dt);
      m.vel.y -= 3.2 * dt; // gentle tabletop gravity
      m.mat.opacity = (1 - u) * 0.85;
      if (u >= 1) {
        m.active = false;
        m.mesh.visible = false;
      }
    }

    // 8. Smooth phase lighting transitions + dynamic explorer lantern + organic scene life
    const colorAlpha = 1 - Math.exp(-3.2 * dt);
    if (this.scene.background instanceof THREE.Color) {
      this.scene.background.lerp(this.targetBgColor, colorAlpha);
    }
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.lerp(this.targetBgColor, colorAlpha);
    }
    this.hemiLight.color.lerp(this.targetHemiColor, colorAlpha);
    this.keyLight.color.lerp(this.targetKeyColor, colorAlpha);
    this.currentDreadGrade = THREE.MathUtils.damp(this.currentDreadGrade, this.targetDreadGrade, 3.0, dt);

    if (this.gradePass) {
      this.gradePass.uniforms.uDread.value = this.currentDreadGrade;
      this.gradePass.uniforms.uChroma.value = this.revelationFlash * 0.0085;
    }

    const activeId =
      this.localPlayerId ?? this.currentState?.players[this.currentState.currentPlayerIndex]?.id;
    const playerFig = activeId ? this.playerMeshes.get(activeId) : null;
    if (playerFig) {
      playerFig.getWorldPosition(_vecC);
      // Smoothly glide warm explorer lantern PointLight with the active explorer's lantern hand!
      const lx = _vecC.x + Math.sin(playerFig.rotation.y + 0.45) * 0.42;
      const ly = _vecC.y + 1.38;
      const lz = _vecC.z + Math.cos(playerFig.rotation.y + 0.45) * 0.42;
      this.explorerLanternLight.position.x = THREE.MathUtils.damp(this.explorerLanternLight.position.x, lx, 14, dt);
      this.explorerLanternLight.position.y = THREE.MathUtils.damp(this.explorerLanternLight.position.y, ly, 14, dt);
      this.explorerLanternLight.position.z = THREE.MathUtils.damp(this.explorerLanternLight.position.z, lz, 14, dt);
      const lanternFlicker = this.reducedMotion
        ? 1
        : 1 + Math.sin(elapsed * 8.3) * 0.06 + Math.sin(elapsed * 15.1) * 0.03;
      this.explorerLanternLight.intensity = 2.35 * lanternFlicker;
    }

    // Update fixed 6-light room PointLight pool (nearest visible lit rooms to camera focus + active room priority)
    if (this.roomLightPool.length > 0) {
      const focusRoomId = this.getFocusedPlayerRoomId();
      const tx = this.controls.target.x;
      const ty = this.controls.target.y;
      const tz = this.controls.target.z;
      let candCount = 0;

      for (const ref of this.roomMeshes.values()) {
        if (!ref.group.visible || !ref.lightSpec) continue;
        const dx = ref.worldPos.x - tx;
        const dy = ref.worldPos.y - ty;
        const dz = ref.worldPos.z - tz;
        const distSq = dx * dx + dy * dy + dz * dz;
        const score = ref.roomId === focusRoomId ? distSq - 10000 : distSq;
        if (candCount < this.lightCandidates.length) {
          this.lightCandidates[candCount].ref = ref;
          this.lightCandidates[candCount].score = score;
        } else {
          this.lightCandidates.push({ ref, score });
        }
        candCount++;
      }

      const poolCount = this.roomLightPool.length;
      const activeLights = Math.min(poolCount, candCount);
      // Partial selection sort for top 6 nearest rooms (zero array allocations)
      for (let i = 0; i < activeLights; i++) {
        let minIdx = i;
        for (let j = i + 1; j < candCount; j++) {
          if (this.lightCandidates[j].score < this.lightCandidates[minIdx].score) {
            minIdx = j;
          }
        }
        if (minIdx !== i) {
          const tmpRef = this.lightCandidates[i].ref;
          const tmpScore = this.lightCandidates[i].score;
          this.lightCandidates[i].ref = this.lightCandidates[minIdx].ref;
          this.lightCandidates[i].score = this.lightCandidates[minIdx].score;
          this.lightCandidates[minIdx].ref = tmpRef;
          this.lightCandidates[minIdx].score = tmpScore;
        }

        const ref = this.lightCandidates[i].ref;
        const spec = ref.lightSpec!;
        const pl = this.roomLightPool[i];
        pl.position.set(ref.worldPos.x, ref.worldPos.y + 2.75, ref.worldPos.z);
        pl.color.setHex(spec.color);
        const flicker = this.reducedMotion
          ? 1
          : 1 +
            Math.sin(elapsed * 7.2 + ref.group.id) * 0.048 +
            Math.sin(elapsed * 13.7 + ref.group.id * 2) * 0.026;
        pl.intensity = spec.baseIntensity * flicker;
      }
      for (let i = activeLights; i < poolCount; i++) {
        this.roomLightPool[i].intensity = 0;
      }
    }

    if (!this.reducedMotion) {
      if (this.hoverRing.visible) {
        const pulse = 1 + Math.sin(elapsed * 6.5) * 0.08;
        this.hoverRing.scale.set(pulse, pulse, 1);
      }

      // Gently animate marching brass trajectory preview beads while hovering a destination room
      if (this.moveArcGroup.visible) {
        const phase = (elapsed * 1.15) % 1;
        const count = this.moveArcBeads.length;
        for (let i = 0; i < count; i++) {
          const t = ((i + phase) / count) * 0.88 + 0.06;
          const bx = THREE.MathUtils.lerp(this.moveArcFrom.x, this.moveArcTo.x, t);
          const bz = THREE.MathUtils.lerp(this.moveArcFrom.z, this.moveArcTo.z, t);
          const by =
            THREE.MathUtils.lerp(this.moveArcFrom.y, this.moveArcTo.y, t) +
            Math.sin(t * Math.PI) * this.moveArcHeight;
          const b = this.moveArcBeads[i];
          b.position.set(bx, by, bz);
          const s = 0.75 + Math.sin(t * Math.PI) * 0.45;
          b.scale.setScalar(s);
        }
      }

      // Active explorer breathing, gentle lantern pendulum sway & rotating brass compass ring (O(1) cached refs)
      for (const [pid, fig] of this.playerMeshes.entries()) {
        if (!fig.visible) continue;
        const body = fig.userData.figurineBody as THREE.Object3D | undefined;
        if (body) {
          body.scale.y = 1 + Math.sin(elapsed * 2.4 + fig.id) * 0.016;
        }
        const lantern = fig.userData.explorerLantern as THREE.Object3D | undefined;
        if (lantern) {
          const isMoving = this.pawnMoves.has(pid);
          const amp = isMoving ? 0.24 : 0.055;
          lantern.rotation.z = Math.sin(elapsed * (isMoving ? 10 : 2.9) + fig.id) * amp;
          lantern.rotation.x = Math.cos(elapsed * 2.2 + fig.id) * (amp * 0.6);
        }
        const aura = fig.userData.turnAura as THREE.Object3D | undefined;
        if (aura) {
          aura.rotation.y = elapsed * 0.42;
        }
      }

      // Flicker study tabletop pillar candles & gently align pocket compass needle toward explorer
      for (let i = 0; i < this.studyCandleFlames.length; i++) {
        const fl = this.studyCandleFlames[i];
        const gl = this.studyCandleGlows[i];
        const f = 0.88 + Math.sin(elapsed * 9.5 + i * 2.4) * 0.14 + Math.sin(elapsed * 16.2 + i) * 0.06;
        fl.scale.set(1, f, 1);
        if (gl) {
          (gl.material as THREE.SpriteMaterial).opacity = 0.48 + (f - 0.88) * 0.45;
        }
      }
      if (this.compassNeedle && playerFig) {
        const targetYaw = Math.atan2(_vecC.x - -22, _vecC.z - 18) + Math.sin(elapsed * 0.7) * 0.08;
        this.compassNeedle.rotation.z = THREE.MathUtils.damp(this.compassNeedle.rotation.z, -targetYaw, 2.5, dt);
      }

      for (const ref of this.roomMeshes.values()) {
        if (!ref.group.visible) continue;

        // Gentle breathing bob on unexplored doorway signet beacons (zero Object.values allocation!)
        const crests = ref.unexploredBeaconCrests;
        for (let i = 0; i < crests.length; i++) {
          const crest = crests[i];
          crest.position.y = 0.045 + Math.sin(elapsed * 2.6 + crest.id) * 0.032;
        }

        const props = ref.animatedProps;
        for (let i = 0; i < props.length; i++) {
          const prop = props[i];
          if (prop.kind === 'pendulum') {
            const amp = this.currentState ? 0.08 + (this.currentState.pressure / 100) * 0.25 : 0.14;
            prop.mesh.rotation.z = Math.sin(elapsed * 1.5) * amp;
          } else if (prop.kind === 'pendulum_giant') {
            const pressureFrac = this.currentState ? this.currentState.pressure / 100 : 0.25;
            const amp = 0.05 + pressureFrac * 0.34;
            prop.mesh.rotation.z = Math.sin(elapsed * 1.15) * amp;
          } else if (prop.kind === 'curtain') {
            prop.mesh.rotation.x = Math.sin(elapsed * 1.35 + prop.mesh.id) * 0.065;
            prop.mesh.rotation.z = Math.cos(elapsed * 0.95 + prop.mesh.id) * 0.035;
          } else if (prop.kind === 'rocker') {
            prop.mesh.rotation.z = Math.sin(elapsed * 1.9) * 0.13;
          } else if (prop.kind === 'candle') {
            const s = 0.9 + Math.sin(elapsed * 10.5 + prop.mesh.id) * 0.12;
            prop.mesh.scale.set(1, s, 1);
          } else if (prop.kind === 'halo') {
            const sp = prop.mesh as THREE.Sprite;
            (sp.material as THREE.SpriteMaterial).opacity =
              0.38 + Math.sin(elapsed * 8.4 + sp.id) * 0.09;
          } else if (prop.kind === 'book') {
            prop.mesh.position.z = 0.08 + Math.sin(elapsed * 0.9) * 0.06;
          } else if (prop.kind === 'astrolabe') {
            prop.mesh.rotation.y += dt * 0.65;
            prop.mesh.rotation.x = Math.sin(elapsed * 0.7) * 0.22;
          } else if (prop.kind === 'gear') {
            prop.mesh.rotation.z += dt * (prop.mesh.id % 2 === 0 ? 0.42 : -0.52);
          } else if (prop.kind === 'water') {
            prop.mesh.position.y = 0.18 + Math.sin(elapsed * 1.2) * 0.015;
          } else if (prop.kind === 'beacon') {
            prop.mesh.rotation.y += dt * 1.1;
          }
        }

        if (playerFig && ref.portraitEyes.length > 0) {
          for (let i = 0; i < ref.portraitEyes.length; i++) {
            const eyes = ref.portraitEyes[i];
            eyes.getWorldPosition(_vecB);
            const dx = THREE.MathUtils.clamp((_vecC.x - _vecB.x) * 0.008, -0.025, 0.025);
            const dy = THREE.MathUtils.clamp((_vecC.y + 1.2 - _vecB.y) * 0.006, -0.015, 0.015);
            eyes.position.x = dx;
            eyes.position.y = 0.09 + dy;
          }
        }
      }

      for (const gm of this.ghostMeshes.values()) {
        const arch = gm.userData.ghostArchetype as string | undefined;
        const baseFloorY = Math.floor(gm.position.y / FLOOR_SPACING + 0.5) * FLOOR_SPACING;
        const orbit = gm.userData.ghostOrbit as THREE.Object3D | undefined;
        if (orbit) {
          orbit.rotation.y -= dt * 1.45;
        }
        if (arch === 'watcher') {
          // The Watcher stands unnervingly still and silently turns to face the explorer
          gm.position.y = baseFloorY;
          if (playerFig) {
            gm.getWorldPosition(_vecB);
            const yaw = Math.atan2(_vecC.x - _vecB.x, _vecC.z - _vecB.z);
            gm.rotation.y = THREE.MathUtils.damp(gm.rotation.y, yaw, 2.5, dt);
          }
        } else if (arch === 'lantern_wisp') {
          gm.position.y = baseFloorY + Math.sin(elapsed * 2.6 + gm.id) * 0.22;
          gm.rotation.y += dt * 0.95;
        } else if (arch === 'wall_choir') {
          gm.position.y = baseFloorY + Math.sin(elapsed * 1.1 + gm.id) * 0.06;
          const breathe = 1 + Math.sin(elapsed * 2.1 + gm.id) * 0.04;
          gm.scale.set(breathe, 1, breathe);
        } else {
          gm.position.y = baseFloorY + Math.sin(elapsed * 1.7 + gm.id) * 0.14;
          gm.rotation.y += dt * 0.32;
        }
      }

      this.dustPoints.rotation.y = elapsed * 0.014;
      this.dustPoints.position.y = Math.sin(elapsed * 0.45) * 0.22;
      this.mistPoints.rotation.y = -elapsed * 0.018;
      (this.mistPoints.material as THREE.PointsMaterial).opacity =
        0.075 + this.currentDreadGrade * 0.085;

      if (this.revelationFlash > 0) {
        this.revelationFlash = Math.max(0, this.revelationFlash - dt * 0.45);
        this.keyLight.intensity = 1.55 + this.revelationFlash * 1.15;
      } else {
        this.keyLight.intensity = 1.55;
      }
    }
  }

  public dispose(): void {
    this.disposed = true;
    this.performanceCaptureActive = false;
    this.performanceFrameSamples = [];
    this.tickLoopFn = null;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);

    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);

    const el = this.renderer.domElement;
    el.removeEventListener('pointerdown', this.onPointerDown);
    el.removeEventListener('pointermove', this.onPointerMove);
    el.removeEventListener('pointerup', this.onPointerUp);
    el.removeEventListener('pointerleave', this.onPointerLeave);
    el.removeEventListener('webglcontextlost', this.onContextLost);

    this.controls.dispose();
    this.composer?.dispose();
    this.sharedRippleGeo.dispose();
    this.textures.dispose();
    disposeObjectTree(this.scene);
    this.renderer.dispose();
  }
}

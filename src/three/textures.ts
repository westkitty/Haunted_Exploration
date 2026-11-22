import * as THREE from 'three';

export interface ProceduralTextures {
  woodFloor: THREE.CanvasTexture;
  woodNormal: THREE.CanvasTexture;
  woodRough: THREE.CanvasTexture;
  marbleFloor: THREE.CanvasTexture;
  marbleNormal: THREE.CanvasTexture;
  marbleRough: THREE.CanvasTexture;
  stoneFloor: THREE.CanvasTexture;
  stoneNormal: THREE.CanvasTexture;
  stoneRough: THREE.CanvasTexture;
  wallpaper: THREE.CanvasTexture;
  wallpaperNormal: THREE.CanvasTexture;
  wallpaperRough: THREE.CanvasTexture;
  furnitureWood: THREE.CanvasTexture;
  furnitureWoodNormal: THREE.CanvasTexture;
  furnitureWoodRough: THREE.CanvasTexture;
  patinaBrass: THREE.CanvasTexture;
  patinaBrassRough: THREE.CanvasTexture;
  exteriorWood: THREE.CanvasTexture;
  rug: THREE.CanvasTexture;
  portrait: THREE.CanvasTexture;
  stainedGlass: THREE.CanvasTexture;
  clockFace: THREE.CanvasTexture;
  tabletop: THREE.CanvasTexture;
  tabletopRough: THREE.CanvasTexture;
  roomAO: THREE.CanvasTexture;
  contactShadow: THREE.CanvasTexture;
  slabShadow: THREE.CanvasTexture;
  lightGlow: THREE.CanvasTexture;
  softParticle: THREE.CanvasTexture;
  dispose: () => void;
}

function finalizeTexture(
  canvas: HTMLCanvasElement,
  maxAnisotropy: number,
  repeatX = 1,
  repeatY = 1,
  isColor = true
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = Math.min(16, maxAnisotropy);
  tex.needsUpdate = true;
  return tex;
}

function makeCanvas(
  size = 512,
  willReadFrequently = false
): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = (
    willReadFrequently
      ? c.getContext('2d', { willReadFrequently: true })
      : c.getContext('2d')
  )!;
  return [c, ctx];
}

function seeded(i: number): number {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
}

/**
 * Computes a real tangent-space RGB normal map from a grayscale heightfield canvas via Sobel filter.
 * Optimized with flat typed-array row pointers, power-of-2 bitmask wrapping, and zero per-pixel closures.
 */
function heightToNormalTexture(
  heightCanvas: HTMLCanvasElement,
  strength: number,
  maxAnisotropy: number,
  repeatX = 1,
  repeatY = 1
): THREE.CanvasTexture {
  const w = heightCanvas.width;
  const h = heightCanvas.height;
  const srcCtx = heightCanvas.getContext('2d')!;
  const src = srcCtx.getImageData(0, 0, w, h).data;

  const [outC, outCtx] = makeCanvas(w);
  outC.height = h;
  const outImg = outCtx.createImageData(w, h);
  const dst = outImg.data;

  const scale = strength * (1 / 255);
  const isPow2W = (w & (w - 1)) === 0;
  const isPow2H = (h & (h - 1)) === 0;
  const wMask = w - 1;
  const hMask = h - 1;

  for (let y = 0; y < h; y++) {
    const ym1 = isPow2H ? (y - 1) & hMask : (y - 1 + h) % h;
    const yp1 = isPow2H ? (y + 1) & hMask : (y + 1) % h;
    const rowPrev = ym1 * w;
    const rowCurr = y * w;
    const rowNext = yp1 * w;

    for (let x = 0; x < w; x++) {
      const xm1 = isPow2W ? (x - 1) & wMask : (x - 1 + w) % w;
      const xp1 = isPow2W ? (x + 1) & wMask : (x + 1) % w;

      const tl = src[(rowPrev + xm1) << 2];
      const t = src[(rowPrev + x) << 2];
      const tr = src[(rowPrev + xp1) << 2];
      const l = src[(rowCurr + xm1) << 2];
      const r = src[(rowCurr + xp1) << 2];
      const bl = src[(rowNext + xm1) << 2];
      const b = src[(rowNext + x) << 2];
      const br = src[(rowNext + xp1) << 2];

      const dx = (tr + (r << 1) + br - (tl + (l << 1) + bl)) * scale;
      const dy = (bl + (b << 1) + br - (tl + (t << 1) + tr)) * scale;
      const invLen = 127.5 / Math.sqrt(dx * dx + dy * dy + 1.0);

      const idx = (rowCurr + x) << 2;
      dst[idx] = (-dx * invLen + 128) | 0;
      dst[idx + 1] = (-dy * invLen + 128) | 0;
      dst[idx + 2] = (invLen + 128) | 0;
      dst[idx + 3] = 255;
    }
  }
  outCtx.putImageData(outImg, 0, 0);
  return finalizeTexture(outC, maxAnisotropy, repeatX, repeatY, false);
}

/**
 * Adds organic micro-grain & age speckles to a canvas for tactile realism.
 * Batched into 2 fillStyle passes instead of re-parsing CSS rgba strings per speckle.
 */
function addMicroWeathering(
  ctx: CanvasRenderingContext2D,
  size: number,
  seedOffset: number,
  count: number,
  darkAlpha = 0.08,
  lightAlpha = 0.04
): void {
  ctx.fillStyle = `rgba(245, 232, 206, ${lightAlpha})`;
  for (let i = 0; i < count; i += 3) {
    const x = seeded(seedOffset + i * 3.1) * size;
    const y = seeded(seedOffset + i * 7.3 + 11) * size;
    const w = 1 + seeded(seedOffset + i * 5.7) * 3.5;
    const h = 1 + seeded(seedOffset + i * 2.9) * 2.5;
    ctx.fillRect(x, y, w, h);
  }
  ctx.fillStyle = `rgba(14, 9, 6, ${darkAlpha})`;
  for (let i = 0; i < count; i++) {
    if (i % 3 === 0) continue;
    const x = seeded(seedOffset + i * 3.1) * size;
    const y = seeded(seedOffset + i * 7.3 + 11) * size;
    const w = 1 + seeded(seedOffset + i * 5.7) * 3.5;
    const h = 1 + seeded(seedOffset + i * 2.9) * 2.5;
    ctx.fillRect(x, y, w, h);
  }
}

export function createProceduralTextures(maxAnisotropy = 8): ProceduralTextures {
  // -------------------------------------------------------------------------
  // 1. HAND-SCRAPED & SCUFFED VICTORIAN WALNUT PARQUET (Albedo + Normal + Rough)
  // -------------------------------------------------------------------------
  const [woodC, wCtx] = makeCanvas(512);
  const [woodH, whCtx] = makeCanvas(512, true);
  const [woodR, wrCtx] = makeCanvas(512);

  wCtx.fillStyle = '#1b1009';
  wCtx.fillRect(0, 0, 512, 512);
  whCtx.fillStyle = '#141414';
  whCtx.fillRect(0, 0, 512, 512);
  wrCtx.fillStyle = '#e8e8e8'; // dusty matte seams
  wrCtx.fillRect(0, 0, 512, 512);

  const plankRows = 8;
  const plankH = 512 / plankRows;
  for (let row = 0; row < plankRows; row++) {
    const offset = (row % 2) * 144 + Math.floor(seeded(row * 17) * 76);
    for (let seg = -1; seg < 3; seg++) {
      const px = seg * 256 + offset;
      const py = row * plankH;
      const n = seeded(row * 31 + seg * 13);
      const r = Math.floor(78 + n * 34);
      const g = Math.floor(50 + n * 22);
      const b = Math.floor(31 + n * 14);

      // Subtle bevelled plank shading
      const grad = wCtx.createLinearGradient(px, py, px, py + plankH);
      grad.addColorStop(0, `rgb(${r + 12}, ${g + 8}, ${b + 5})`);
      grad.addColorStop(0.12, `rgb(${r + 2}, ${g + 1}, ${b})`);
      grad.addColorStop(0.86, `rgb(${r - 6}, ${g - 4}, ${b - 3})`);
      grad.addColorStop(1, `rgb(${r - 18}, ${g - 13}, ${b - 9})`);
      wCtx.fillStyle = grad;
      wCtx.fillRect(px + 2, py + 2, 252, plankH - 4);

      // Plank height bevel (bright center, dark edges for crisp Sobel groove)
      const hGrad = whCtx.createLinearGradient(px, py, px, py + plankH);
      hGrad.addColorStop(0, '#5a5a5a');
      hGrad.addColorStop(0.08, '#d2d2d2');
      hGrad.addColorStop(0.92, '#c8c8c8');
      hGrad.addColorStop(1, '#4c4c4c');
      whCtx.fillStyle = hGrad;
      whCtx.fillRect(px + 2, py + 2, 252, plankH - 4);

      // Per-plank satin varnish variation in roughness map
      const roughVal = Math.floor(92 + n * 58);
      wrCtx.fillStyle = `rgb(${roughVal},${roughVal},${roughVal})`;
      wrCtx.fillRect(px + 2, py + 2, 252, plankH - 4);

      // Fine organic wood grain fibers + knot swirls
      for (let f = 0; f < 14; f++) {
        const fy = py + 4 + (f / 14) * (plankH - 8);
        const wave = (seeded(row * 97 + seg * 41 + f) - 0.5) * 7;
        wCtx.strokeStyle =
          f % 3 === 0 ? 'rgba(20, 11, 5, 0.34)' : 'rgba(176, 126, 78, 0.14)';
        wCtx.lineWidth = 1.0 + (f % 2) * 0.6;
        wCtx.beginPath();
        wCtx.moveTo(px + 2, fy);
        wCtx.bezierCurveTo(px + 85, fy + wave, px + 170, fy - wave, px + 254, fy);
        wCtx.stroke();

        whCtx.strokeStyle = 'rgba(72, 72, 72, 0.35)';
        whCtx.lineWidth = 1;
        whCtx.beginPath();
        whCtx.moveTo(px + 2, fy);
        whCtx.bezierCurveTo(px + 85, fy + wave, px + 170, fy - wave, px + 254, fy);
        whCtx.stroke();
      }

      // Occasional dark knot ring
      if (seeded(row * 53 + seg * 29) > 0.68) {
        const kx = px + 60 + seeded(row * 19 + seg) * 140;
        const ky = py + 16 + seeded(row * 23 + seg) * (plankH - 32);
        wCtx.strokeStyle = 'rgba(24, 13, 7, 0.45)';
        wCtx.lineWidth = 1.6;
        wCtx.beginPath();
        wCtx.ellipse(kx, ky, 14, 5, 0.08, 0, Math.PI * 2);
        wCtx.stroke();
        wCtx.beginPath();
        wCtx.ellipse(kx, ky, 7, 2.5, 0.08, 0, Math.PI * 2);
        wCtx.stroke();
      }

      // Iron nail / wooden dowel pegs near plank ends
      wCtx.fillStyle = '#180e08';
      whCtx.fillStyle = '#383838';
      [14, plankH - 14].forEach((dy) => {
        wCtx.beginPath();
        wCtx.arc(px + 12, py + dy, 2.4, 0, Math.PI * 2);
        wCtx.fill();
        whCtx.beginPath();
        whCtx.arc(px + 12, py + dy, 2.4, 0, Math.PI * 2);
        whCtx.fill();
      });
    }
  }

  // Lived-in scuffs, furniture drag arcs, heel scratches & dull worn varnish marks!
  for (let s = 0; s < 36; s++) {
    const sx = seeded(400 + s * 7) * 512;
    const sy = seeded(500 + s * 11) * 512;
    const len = 16 + seeded(600 + s * 13) * 46;
    const ang = (seeded(700 + s * 5) - 0.5) * 1.4;
    const ex = sx + Math.cos(ang) * len;
    const ey = sy + Math.sin(ang) * len;

    // Pale varnish scratch + darker edge
    wCtx.strokeStyle = s % 3 === 0 ? 'rgba(182, 142, 98, 0.16)' : 'rgba(18, 10, 5, 0.24)';
    wCtx.lineWidth = 0.9 + seeded(s * 9) * 1.4;
    wCtx.beginPath();
    wCtx.moveTo(sx, sy);
    wCtx.lineTo(ex, ey);
    wCtx.stroke();

    // Scratches indent the normal map & roughen the varnish!
    whCtx.strokeStyle = 'rgba(40, 40, 40, 0.55)';
    whCtx.lineWidth = 1.2;
    whCtx.beginPath();
    whCtx.moveTo(sx, sy);
    whCtx.lineTo(ex, ey);
    whCtx.stroke();

    wrCtx.strokeStyle = 'rgba(235, 235, 235, 0.65)';
    wrCtx.lineWidth = 2.4;
    wrCtx.beginPath();
    wrCtx.moveTo(sx, sy);
    wrCtx.lineTo(ex, ey);
    wrCtx.stroke();
  }

  // Subtle boot-scuff smudges & dusty patches
  for (let p = 0; p < 12; p++) {
    const px = seeded(800 + p * 17) * 512;
    const py = seeded(850 + p * 23) * 512;
    const rad = 22 + seeded(900 + p * 11) * 44;
    const g = wCtx.createRadialGradient(px, py, 2, px, py, rad);
    g.addColorStop(0, 'rgba(16, 10, 6, 0.22)');
    g.addColorStop(1, 'rgba(16, 10, 6, 0)');
    wCtx.fillStyle = g;
    wCtx.fillRect(px - rad, py - rad, rad * 2, rad * 2);

    const rg = wrCtx.createRadialGradient(px, py, 2, px, py, rad);
    rg.addColorStop(0, 'rgba(220, 220, 220, 0.45)');
    rg.addColorStop(1, 'rgba(220, 220, 220, 0)');
    wrCtx.fillStyle = rg;
    wrCtx.fillRect(px - rad, py - rad, rad * 2, rad * 2);
  }
  addMicroWeathering(wCtx, 512, 1200, 900, 0.08, 0.04);

  const woodFloor = finalizeTexture(woodC, maxAnisotropy, 2, 2, true);
  const woodNormal = heightToNormalTexture(woodH, 2.2, maxAnisotropy, 2, 2);
  const woodRough = finalizeTexture(woodR, maxAnisotropy, 2, 2, false);

  // -------------------------------------------------------------------------
  // 2. AGED VEINED MARBLE TILES WITH CHIPS, SCUFFS & GROUT (Albedo + Normal + Rough)
  // -------------------------------------------------------------------------
  const [marbleC, mCtx] = makeCanvas(512);
  const [marbleH, mhCtx] = makeCanvas(512, true);
  const [marbleR, mrCtx] = makeCanvas(512);

  mCtx.fillStyle = '#151417';
  mCtx.fillRect(0, 0, 512, 512);
  mhCtx.fillStyle = '#202020';
  mhCtx.fillRect(0, 0, 512, 512);
  mrCtx.fillStyle = '#e5e5e5';
  mrCtx.fillRect(0, 0, 512, 512);

  const mTile = 128;
  for (let ty = 0; ty < 4; ty++) {
    for (let tx = 0; tx < 4; tx++) {
      const isCream = (tx + ty) % 2 === 0;
      const x0 = tx * mTile;
      const y0 = ty * mTile;
      const tint = seeded(tx * 19 + ty * 37) * 14 - 7;
      const grad = mCtx.createLinearGradient(x0, y0, x0 + mTile, y0 + mTile);
      if (isCream) {
        grad.addColorStop(0, `rgb(${208 + tint},${197 + tint},${177 + tint})`);
        grad.addColorStop(0.5, `rgb(${190 + tint},${178 + tint},${156 + tint})`);
        grad.addColorStop(1, `rgb(${168 + tint},${154 + tint},${132 + tint})`);
      } else {
        grad.addColorStop(0, `rgb(${44 + tint},${45 + tint},${52 + tint})`);
        grad.addColorStop(0.5, `rgb(${33 + tint},${34 + tint},${40 + tint})`);
        grad.addColorStop(1, `rgb(${24 + tint},${25 + tint},${30 + tint})`);
      }
      mCtx.fillStyle = grad;
      mCtx.fillRect(x0 + 3, y0 + 3, mTile - 6, mTile - 6);

      mhCtx.fillStyle = '#d8d8d8';
      mhCtx.fillRect(x0 + 3, y0 + 3, mTile - 6, mTile - 6);

      // Polished stone center with slightly scuffed edges
      const baseRough = isCream ? 74 : 62;
      mrCtx.fillStyle = `rgb(${baseRough},${baseRough},${baseRough})`;
      mrCtx.fillRect(x0 + 3, y0 + 3, mTile - 6, mTile - 6);

      // Multi-branch mineral marble veining
      for (let v = 0; v < 5; v++) {
        const s = seeded(tx * 29 + ty * 53 + v * 11);
        mCtx.strokeStyle = isCream
          ? `rgba(92, 79, 64, ${0.15 + s * 0.16})`
          : `rgba(198, 188, 170, ${0.1 + s * 0.12})`;
        mCtx.lineWidth = 0.8 + s * 1.8;
        mCtx.beginPath();
        mCtx.moveTo(x0 + 4, y0 + 12 + v * 24);
        mCtx.bezierCurveTo(
          x0 + 42,
          y0 + s * 96,
          x0 + 88,
          y0 + (1 - s) * 112,
          x0 + mTile - 4,
          y0 + 18 + ((v * 37) % 92)
        );
        mCtx.stroke();
      }

      // Occasional hairline marble crack & edge chip!
      if (seeded(tx * 71 + ty * 13) > 0.65) {
        mCtx.strokeStyle = 'rgba(18, 14, 12, 0.36)';
        mCtx.lineWidth = 1.1;
        mCtx.beginPath();
        mCtx.moveTo(x0 + 10, y0 + 18);
        mCtx.lineTo(x0 + 46, y0 + 44);
        mCtx.lineTo(x0 + 68, y0 + 86);
        mCtx.stroke();

        mhCtx.strokeStyle = '#303030';
        mhCtx.lineWidth = 1.6;
        mhCtx.beginPath();
        mhCtx.moveTo(x0 + 10, y0 + 18);
        mhCtx.lineTo(x0 + 46, y0 + 44);
        mhCtx.lineTo(x0 + 68, y0 + 86);
        mhCtx.stroke();
      }

      // Scuff cloud in roughness map
      const rg = mrCtx.createRadialGradient(
        x0 + 64,
        y0 + 64,
        10,
        x0 + 64,
        y0 + 64,
        58
      );
      rg.addColorStop(0, 'rgba(155,155,155,0.45)');
      rg.addColorStop(1, 'rgba(155,155,155,0)');
      mrCtx.fillStyle = rg;
      mrCtx.fillRect(x0 + 3, y0 + 3, mTile - 6, mTile - 6);
    }
  }
  addMicroWeathering(mCtx, 512, 2200, 700, 0.06, 0.03);

  const marbleFloor = finalizeTexture(marbleC, maxAnisotropy, 2, 2, true);
  const marbleNormal = heightToNormalTexture(marbleH, 2.0, maxAnisotropy, 2, 2);
  const marbleRough = finalizeTexture(marbleR, maxAnisotropy, 2, 2, false);

  // -------------------------------------------------------------------------
  // 3. HAND-DRESSED DAMP CELLAR FLAGSTONE (Albedo + Normal + Wet Puddle Rough)
  // -------------------------------------------------------------------------
  const [stoneC, sCtx] = makeCanvas(512);
  const [stoneH, shCtx] = makeCanvas(512, true);
  const [stoneR, srCtx] = makeCanvas(512);

  sCtx.fillStyle = '#111316';
  sCtx.fillRect(0, 0, 512, 512);
  shCtx.fillStyle = '#0e0e0e';
  shCtx.fillRect(0, 0, 512, 512);
  srCtx.fillStyle = '#f0f0f0';
  srCtx.fillRect(0, 0, 512, 512);

  for (let row = 0; row < 4; row++) {
    const shift = (row % 2) * 64;
    for (let col = -1; col < 5; col++) {
      const sx = col * 128 + shift;
      const sy = row * 128;
      const n = seeded(row * 43 + col * 19);
      const base = Math.floor(48 + n * 28);
      const grad = sCtx.createRadialGradient(sx + 64, sy + 64, 8, sx + 64, sy + 64, 78);
      grad.addColorStop(0, `rgb(${base + 14}, ${base + 15}, ${base + 18})`);
      grad.addColorStop(0.75, `rgb(${base}, ${base + 2}, ${base + 5})`);
      grad.addColorStop(1, `rgb(${base - 14}, ${base - 12}, ${base - 8})`);
      sCtx.fillStyle = grad;
      sCtx.fillRect(sx + 5, sy + 5, 118, 118);

      const hVal = Math.floor(175 + n * 50);
      shCtx.fillStyle = `rgb(${hVal},${hVal},${hVal})`;
      shCtx.fillRect(sx + 5, sy + 5, 118, 118);

      // Dry rough stone base
      srCtx.fillStyle = '#cfcfcf';
      srCtx.fillRect(sx + 5, sy + 5, 118, 118);

      // Chisel pitting, mineral flecks & moss tint along mortar edge
      for (let d = 0; d < 32; d++) {
        const dx = sx + 8 + seeded(row * 101 + col * 37 + d) * 112;
        const dy = sy + 8 + seeded(row * 71 + col * 59 + d * 3) * 112;
        sCtx.fillStyle = d % 3 === 0 ? 'rgba(215,218,220,0.09)' : 'rgba(0,0,0,0.28)';
        sCtx.fillRect(dx, dy, 4, 3);
        shCtx.fillStyle = d % 2 === 0 ? 'rgba(60,60,60,0.5)' : 'rgba(240,240,240,0.25)';
        shCtx.fillRect(dx, dy, 3, 3);
      }

      // Subtle damp green-umber moss tint along edge
      sCtx.strokeStyle = 'rgba(44, 58, 40, 0.25)';
      sCtx.lineWidth = 4;
      sCtx.strokeRect(sx + 7, sy + 7, 114, 114);
    }
  }

  // Glossy damp seepage puddles on the cellar floor (dark in albedo + dark/glossy in roughness!)
  for (let w = 0; w < 5; w++) {
    const wx = seeded(3100 + w * 13) * 512;
    const wy = seeded(3200 + w * 17) * 512;
    const wr = 38 + seeded(3300 + w * 23) * 48;
    const wg = sCtx.createRadialGradient(wx, wy, 4, wx, wy, wr);
    wg.addColorStop(0, 'rgba(10, 14, 18, 0.36)');
    wg.addColorStop(1, 'rgba(10, 14, 18, 0)');
    sCtx.fillStyle = wg;
    sCtx.fillRect(wx - wr, wy - wr, wr * 2, wr * 2);

    const rwg = srCtx.createRadialGradient(wx, wy, 4, wx, wy, wr);
    rwg.addColorStop(0, 'rgba(28, 28, 28, 0.92)');
    rwg.addColorStop(1, 'rgba(28, 28, 28, 0)');
    srCtx.fillStyle = rwg;
    srCtx.fillRect(wx - wr, wy - wr, wr * 2, wr * 2);
  }

  const stoneFloor = finalizeTexture(stoneC, maxAnisotropy, 2, 2, true);
  const stoneNormal = heightToNormalTexture(stoneH, 2.8, maxAnisotropy, 2, 2);
  const stoneRough = finalizeTexture(stoneR, maxAnisotropy, 2, 2, false);

  // -------------------------------------------------------------------------
  // 4. WEATHERED DAMASK WALLPAPER + WATER STAINS + WAINSCOTING (Albedo + Normal + Rough)
  // -------------------------------------------------------------------------
  const [wallC, waCtx] = makeCanvas(512);
  const [wallH, wahCtx] = makeCanvas(512, true);
  const [wallR, warCtx] = makeCanvas(512);

  waCtx.fillStyle = '#cec4b4';
  waCtx.fillRect(0, 0, 512, 512);
  wahCtx.fillStyle = '#808080';
  wahCtx.fillRect(0, 0, 512, 512);
  warCtx.fillStyle = '#d4d4d4';
  warCtx.fillRect(0, 0, 512, 512);

  // Alternating matte paper & satin silk vertical stripes
  for (let x = 0; x < 512; x += 32) {
    waCtx.fillStyle = 'rgba(0, 0, 0, 0.085)';
    waCtx.fillRect(x, 0, 14, 356);
    wahCtx.fillStyle = '#727272';
    wahCtx.fillRect(x, 0, 14, 356);
    warCtx.fillStyle = '#9a9a9a'; // satin stripe catches grazing candlelight!
    warCtx.fillRect(x + 14, 0, 18, 356);
  }

  // Ornate damask botanical filigree medallions
  for (let y = 44; y < 340; y += 88) {
    const xOff = (Math.floor(y / 88) % 2) * 44;
    for (let x = -44; x < 560; x += 88) {
      const cx = x + xOff;
      waCtx.strokeStyle = 'rgba(255, 244, 214, 0.24)';
      waCtx.fillStyle = 'rgba(54, 38, 24, 0.1)';
      waCtx.lineWidth = 2;
      waCtx.beginPath();
      waCtx.moveTo(cx, y - 28);
      waCtx.quadraticCurveTo(cx + 22, y - 10, cx + 16, y);
      waCtx.quadraticCurveTo(cx + 22, y + 10, cx, y + 28);
      waCtx.quadraticCurveTo(cx - 22, y + 10, cx - 16, y);
      waCtx.quadraticCurveTo(cx - 22, y - 10, cx, y - 28);
      waCtx.fill();
      waCtx.stroke();

      wahCtx.fillStyle = '#b4b4b4';
      wahCtx.beginPath();
      wahCtx.ellipse(cx, y, 13, 20, 0, 0, Math.PI * 2);
      wahCtx.fill();
    }
  }

  // Subtle vertical wallpaper seam lines & damp foxing water-stains near ceiling/dado!
  for (let sx = 128; sx < 512; sx += 128) {
    waCtx.fillStyle = 'rgba(18, 12, 8, 0.16)';
    waCtx.fillRect(sx, 0, 2, 352);
    wahCtx.fillStyle = '#404040';
    wahCtx.fillRect(sx, 0, 2, 352);
  }
  for (let st = 0; st < 7; st++) {
    const sx = seeded(4100 + st * 19) * 512;
    const sy = seeded(4200 + st * 11) * 320;
    const sr = 28 + seeded(4300 + st * 7) * 52;
    const sg = waCtx.createRadialGradient(sx, sy, 4, sx, sy, sr);
    sg.addColorStop(0, 'rgba(42, 30, 18, 0.22)');
    sg.addColorStop(0.7, 'rgba(68, 48, 28, 0.1)');
    sg.addColorStop(1, 'rgba(68, 48, 28, 0)');
    waCtx.fillStyle = sg;
    waCtx.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
  }

  // Aged patina darkening near ceiling cornice & dado rail
  const wallGrad = waCtx.createLinearGradient(0, 0, 0, 356);
  wallGrad.addColorStop(0, 'rgba(16, 10, 7, 0.44)');
  wallGrad.addColorStop(0.18, 'rgba(16, 10, 7, 0)');
  wallGrad.addColorStop(0.84, 'rgba(16, 10, 7, 0)');
  wallGrad.addColorStop(1, 'rgba(16, 10, 7, 0.32)');
  waCtx.fillStyle = wallGrad;
  waCtx.fillRect(0, 0, 512, 356);

  // Carved & scuffed dark walnut wainscoting lower section (y: 356..512)
  waCtx.fillStyle = '#382419';
  waCtx.fillRect(0, 356, 512, 156);
  warCtx.fillStyle = '#8e8e8e';
  warCtx.fillRect(0, 356, 512, 156);

  // Chair rail carved molding + thin brass inlay
  waCtx.fillStyle = '#6c4d30';
  waCtx.fillRect(0, 350, 512, 12);
  waCtx.fillStyle = '#c9a056';
  waCtx.fillRect(0, 349, 512, 3);
  wahCtx.fillStyle = '#f5f5f5';
  wahCtx.fillRect(0, 349, 512, 14);

  // Recessed wainscot panels with scuffed baseboards
  for (let px = 18; px < 512; px += 128) {
    waCtx.fillStyle = '#261810';
    waCtx.fillRect(px, 376, 92, 104);
    waCtx.strokeStyle = '#6b4c30';
    waCtx.lineWidth = 3;
    waCtx.strokeRect(px + 2, 378, 88, 100);
    wahCtx.fillStyle = '#3a3a3a';
    wahCtx.fillRect(px, 376, 92, 104);
    wahCtx.strokeStyle = '#eaeaea';
    wahCtx.lineWidth = 5;
    wahCtx.strokeRect(px + 2, 378, 88, 100);
  }
  // Scuff marks near bottom baseboard
  for (let sc = 0; sc < 18; sc++) {
    const x = seeded(4500 + sc * 7) * 512;
    const y = 478 + seeded(4600 + sc * 13) * 30;
    waCtx.fillStyle = 'rgba(175, 140, 98, 0.14)';
    waCtx.fillRect(x, y, 8 + seeded(sc) * 14, 2);
  }
  addMicroWeathering(waCtx, 512, 4900, 800, 0.07, 0.03);

  const wallpaper = finalizeTexture(wallC, maxAnisotropy, 2, 1, true);
  const wallpaperNormal = heightToNormalTexture(wallH, 2.4, maxAnisotropy, 2, 1);
  const wallpaperRough = finalizeTexture(wallR, maxAnisotropy, 2, 1, false);

  // -------------------------------------------------------------------------
  // 5. GRAINED & EDGE-WORN FURNITURE WALNUT (No flat solid-color furniture!)
  // -------------------------------------------------------------------------
  const [fwC, fwCtx] = makeCanvas(256);
  const [fwH, fwhCtx] = makeCanvas(256, true);
  const [fwR, fwrCtx] = makeCanvas(256);
  fwCtx.fillStyle = '#472d1d';
  fwCtx.fillRect(0, 0, 256, 256);
  fwhCtx.fillStyle = '#909090';
  fwhCtx.fillRect(0, 0, 256, 256);
  fwrCtx.fillStyle = '#8a8a8a';
  fwrCtx.fillRect(0, 0, 256, 256);

  for (let y = 0; y < 256; y += 3) {
    const n = seeded(5100 + y * 11);
    fwCtx.strokeStyle =
      y % 6 === 0 ? `rgba(22, 11, 5, ${0.26 + n * 0.18})` : `rgba(145, 96, 56, ${0.12 + n * 0.1})`;
    fwCtx.lineWidth = 1.4;
    fwCtx.beginPath();
    fwCtx.moveTo(0, y);
    fwCtx.bezierCurveTo(85, y + (n - 0.5) * 6, 170, y - (n - 0.5) * 6, 256, y);
    fwCtx.stroke();

    fwhCtx.strokeStyle = y % 6 === 0 ? 'rgba(65,65,65,0.45)' : 'rgba(175,175,175,0.25)';
    fwhCtx.beginPath();
    fwhCtx.moveTo(0, y);
    fwhCtx.bezierCurveTo(85, y + (n - 0.5) * 6, 170, y - (n - 0.5) * 6, 256, y);
    fwhCtx.stroke();
  }
  // Subtle edge wear & tiny wood dings
  fwCtx.strokeStyle = 'rgba(186, 138, 86, 0.22)';
  fwCtx.lineWidth = 5;
  fwCtx.strokeRect(3, 3, 250, 250);
  for (let i = 0; i < 24; i++) {
    const x = seeded(5300 + i * 7) * 256;
    const y = seeded(5400 + i * 13) * 256;
    fwCtx.fillStyle = 'rgba(18, 10, 6, 0.28)';
    fwCtx.fillRect(x, y, 6, 1.5);
    fwrCtx.fillStyle = 'rgba(210, 210, 210, 0.6)';
    fwrCtx.fillRect(x, y, 8, 3);
  }
  const furnitureWood = finalizeTexture(fwC, maxAnisotropy, 1, 1, true);
  const furnitureWoodNormal = heightToNormalTexture(fwH, 1.8, maxAnisotropy, 1, 1);
  const furnitureWoodRough = finalizeTexture(fwR, maxAnisotropy, 1, 1, false);

  // -------------------------------------------------------------------------
  // 6. OIL-RUBBED PATINATED ANTIQUE BRASS (Albedo + Roughness breakup)
  // -------------------------------------------------------------------------
  const [brC, brCtx] = makeCanvas(256);
  const [brR, brrCtx] = makeCanvas(256);
  const brGrad = brCtx.createLinearGradient(0, 0, 256, 256);
  brGrad.addColorStop(0, '#dfc07c');
  brGrad.addColorStop(0.5, '#c4994f');
  brGrad.addColorStop(1, '#9f7735');
  brCtx.fillStyle = brGrad;
  brCtx.fillRect(0, 0, 256, 256);
  brrCtx.fillStyle = '#484848';
  brrCtx.fillRect(0, 0, 256, 256);

  // Brushed directional metal micro-scratches & dark oxidized patina pockets
  for (let i = 0; i < 90; i++) {
    const y = seeded(6100 + i * 7) * 256;
    brCtx.strokeStyle = i % 2 === 0 ? 'rgba(255,244,210,0.12)' : 'rgba(42,30,14,0.16)';
    brCtx.lineWidth = 1;
    brCtx.beginPath();
    brCtx.moveTo(0, y);
    brCtx.lineTo(256, y + (seeded(i) - 0.5) * 4);
    brCtx.stroke();
  }
  for (let p = 0; p < 16; p++) {
    const px = seeded(6300 + p * 19) * 256;
    const py = seeded(6400 + p * 23) * 256;
    const rad = 14 + seeded(6500 + p) * 26;
    const pg = brCtx.createRadialGradient(px, py, 2, px, py, rad);
    pg.addColorStop(0, p % 4 === 0 ? 'rgba(56, 78, 66, 0.22)' : 'rgba(38, 25, 12, 0.28)');
    pg.addColorStop(1, 'rgba(38, 25, 12, 0)');
    brCtx.fillStyle = pg;
    brCtx.fillRect(px - rad, py - rad, rad * 2, rad * 2);

    const rg = brrCtx.createRadialGradient(px, py, 2, px, py, rad);
    rg.addColorStop(0, 'rgba(185, 185, 185, 0.7)');
    rg.addColorStop(1, 'rgba(185, 185, 185, 0)');
    brrCtx.fillStyle = rg;
    brrCtx.fillRect(px - rad, py - rad, rad * 2, rad * 2);
  }
  const patinaBrass = finalizeTexture(brC, maxAnisotropy, 1, 1, true);
  const patinaBrassRough = finalizeTexture(brR, maxAnisotropy, 1, 1, false);

  // -------------------------------------------------------------------------
  // 7. EXTERIOR CLAPBOARD TIMBER
  // -------------------------------------------------------------------------
  const [extC, eCtx] = makeCanvas(256);
  eCtx.fillStyle = '#241812';
  eCtx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 24) {
    const grad = eCtx.createLinearGradient(0, y, 0, y + 24);
    grad.addColorStop(0, '#36261d');
    grad.addColorStop(1, '#1c130e');
    eCtx.fillStyle = grad;
    eCtx.fillRect(0, y, 256, 22);
    eCtx.fillStyle = '#0f0906';
    eCtx.fillRect(0, y + 22, 256, 2);
  }
  addMicroWeathering(eCtx, 256, 6800, 300, 0.1, 0.04);
  const exteriorWood = finalizeTexture(extC, maxAnisotropy, 2, 2, true);

  // -------------------------------------------------------------------------
  // 8. WORN PERSIAN ESTATE RUG (With textile weave & faded foot traffic)
  // -------------------------------------------------------------------------
  const [rugC, rCtx] = makeCanvas(512);
  rCtx.fillStyle = '#5c1d22';
  rCtx.fillRect(0, 0, 512, 512);
  rCtx.strokeStyle = '#c89e56';
  rCtx.lineWidth = 14;
  rCtx.strokeRect(18, 18, 476, 476);
  rCtx.strokeStyle = '#1b222e';
  rCtx.lineWidth = 18;
  rCtx.strokeRect(42, 42, 428, 428);
  rCtx.strokeStyle = '#d8b26a';
  rCtx.lineWidth = 5;
  rCtx.strokeRect(60, 60, 392, 392);
  [
    [92, 92],
    [420, 92],
    [92, 420],
    [420, 420],
  ].forEach(([cx, cy]) => {
    rCtx.fillStyle = '#c9a058';
    rCtx.beginPath();
    rCtx.arc(cx, cy, 18, 0, Math.PI * 2);
    rCtx.fill();
    rCtx.fillStyle = '#4a171c';
    rCtx.beginPath();
    rCtx.arc(cx, cy, 9, 0, Math.PI * 2);
    rCtx.fill();
  });
  rCtx.fillStyle = '#222434';
  rCtx.beginPath();
  rCtx.moveTo(256, 98);
  rCtx.lineTo(376, 256);
  rCtx.lineTo(256, 414);
  rCtx.lineTo(136, 256);
  rCtx.closePath();
  rCtx.fill();
  rCtx.strokeStyle = '#dfc07a';
  rCtx.lineWidth = 6;
  rCtx.stroke();
  rCtx.fillStyle = '#74282c';
  rCtx.beginPath();
  rCtx.moveTo(256, 152);
  rCtx.lineTo(328, 256);
  rCtx.lineTo(256, 360);
  rCtx.lineTo(184, 256);
  rCtx.closePath();
  rCtx.fill();
  rCtx.strokeStyle = '#c9a058';
  rCtx.lineWidth = 3;
  rCtx.stroke();
  // Woven thread crosshatch + subtle center wear fade
  for (let y = 0; y < 512; y += 4) {
    rCtx.fillStyle = 'rgba(0, 0, 0, 0.08)';
    rCtx.fillRect(0, y, 512, 1);
  }
  const wearG = rCtx.createRadialGradient(256, 256, 20, 256, 256, 170);
  wearG.addColorStop(0, 'rgba(218, 198, 165, 0.14)');
  wearG.addColorStop(1, 'rgba(218, 198, 165, 0)');
  rCtx.fillStyle = wearG;
  rCtx.fillRect(0, 0, 512, 512);
  const rug = finalizeTexture(rugC, maxAnisotropy, 1, 1, true);

  // -------------------------------------------------------------------------
  // 9. OIL-PAINTED ANCESTRAL PORTRAIT WITH CRACKED VARNISH CRAQUELURE
  // -------------------------------------------------------------------------
  const [portC, pCtx] = makeCanvas(512);
  const pGrad = pCtx.createRadialGradient(256, 190, 24, 256, 256, 300);
  pGrad.addColorStop(0, '#5a4431');
  pGrad.addColorStop(0.6, '#281d16');
  pGrad.addColorStop(1, '#100c0b');
  pCtx.fillStyle = pGrad;
  pCtx.fillRect(0, 0, 512, 512);
  pCtx.fillStyle = '#181316';
  pCtx.beginPath();
  pCtx.ellipse(256, 468, 175, 145, 0, Math.PI, Math.PI * 2);
  pCtx.fill();
  pCtx.fillStyle = '#ddd2bd';
  pCtx.beginPath();
  pCtx.moveTo(226, 328);
  pCtx.lineTo(286, 328);
  pCtx.lineTo(256, 424);
  pCtx.closePath();
  pCtx.fill();
  const fGrad = pCtx.createRadialGradient(242, 214, 12, 256, 232, 92);
  fGrad.addColorStop(0, '#d6c1a3');
  fGrad.addColorStop(1, '#866c53');
  pCtx.fillStyle = fGrad;
  pCtx.beginPath();
  pCtx.ellipse(256, 232, 72, 92, 0, 0, Math.PI * 2);
  pCtx.fill();
  pCtx.fillStyle = '#1d1614';
  pCtx.beginPath();
  pCtx.arc(256, 200, 76, Math.PI * 1.05, Math.PI * 1.95);
  pCtx.fill();
  pCtx.fillStyle = '#ede7d9';
  pCtx.beginPath();
  pCtx.ellipse(226, 224, 14, 8, 0, 0, Math.PI * 2);
  pCtx.ellipse(286, 224, 14, 8, 0, 0, Math.PI * 2);
  pCtx.fill();
  // Aged oil-varnish craquelure lines
  for (let c = 0; c < 18; c++) {
    pCtx.strokeStyle = 'rgba(20, 14, 10, 0.2)';
    pCtx.lineWidth = 0.8;
    const x = seeded(7100 + c * 11) * 512;
    const y = seeded(7200 + c * 17) * 512;
    pCtx.beginPath();
    pCtx.moveTo(x, y);
    pCtx.lineTo(x + (seeded(c) - 0.5) * 90, y + (seeded(c + 3) - 0.5) * 90);
    pCtx.stroke();
  }
  const portrait = finalizeTexture(portC, maxAnisotropy, 1, 1, true);

  // -------------------------------------------------------------------------
  // 10. CATHEDRAL STAINED GLASS ROSE WINDOW
  // -------------------------------------------------------------------------
  const [glassC, gCtx] = makeCanvas(512);
  gCtx.fillStyle = '#111622';
  gCtx.fillRect(0, 0, 512, 512);
  const gColors = ['#4d88b8', '#9c3648', '#d9aa56', '#3d7c75', '#6b4785'];
  for (let i = 0; i < 16; i++) {
    const a0 = (i / 16) * Math.PI * 2;
    const a1 = ((i + 1) / 16) * Math.PI * 2;
    gCtx.fillStyle = gColors[i % gColors.length];
    gCtx.beginPath();
    gCtx.moveTo(256, 256);
    gCtx.arc(256, 256, 228, a0, a1);
    gCtx.closePath();
    gCtx.fill();
    gCtx.strokeStyle = '#0c0d12';
    gCtx.lineWidth = 7;
    gCtx.stroke();
  }
  gCtx.strokeStyle = '#0c0d12';
  gCtx.lineWidth = 10;
  gCtx.beginPath();
  gCtx.arc(256, 256, 146, 0, Math.PI * 2);
  gCtx.stroke();
  gCtx.fillStyle = '#f2cc78';
  gCtx.beginPath();
  gCtx.arc(256, 256, 56, 0, Math.PI * 2);
  gCtx.fill();
  gCtx.stroke();
  const stainedGlass = finalizeTexture(glassC, maxAnisotropy, 1, 1, true);

  // -------------------------------------------------------------------------
  // 11. GRANDFATHER CLOCK DIAL (ROMAN XIII)
  // -------------------------------------------------------------------------
  const [clockC, cCtx] = makeCanvas(512);
  const cGrad = cCtx.createRadialGradient(256, 256, 20, 256, 256, 240);
  cGrad.addColorStop(0, '#f3e8cf');
  cGrad.addColorStop(0.82, '#ddcca8');
  cGrad.addColorStop(1, '#ae9466');
  cCtx.fillStyle = cGrad;
  cCtx.beginPath();
  cCtx.arc(256, 256, 240, 0, Math.PI * 2);
  cCtx.fill();
  cCtx.strokeStyle = '#6d5021';
  cCtx.lineWidth = 18;
  cCtx.stroke();
  cCtx.strokeStyle = '#2b2016';
  cCtx.lineWidth = 3;
  cCtx.beginPath();
  cCtx.arc(256, 256, 204, 0, Math.PI * 2);
  cCtx.stroke();
  cCtx.fillStyle = '#1c150e';
  cCtx.font = 'bold 36px Georgia, serif';
  cCtx.textAlign = 'center';
  cCtx.textBaseline = 'middle';
  const romans = ['XIII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
    cCtx.fillText(romans[i], 256 + Math.cos(a) * 170, 256 + Math.sin(a) * 170);
  }
  cCtx.strokeStyle = '#18120c';
  cCtx.lineWidth = 11;
  cCtx.lineCap = 'round';
  cCtx.beginPath();
  cCtx.moveTo(256, 256);
  cCtx.lineTo(222, 114);
  cCtx.stroke();
  cCtx.lineWidth = 7;
  cCtx.beginPath();
  cCtx.moveTo(256, 256);
  cCtx.lineTo(168, 152);
  cCtx.stroke();
  cCtx.fillStyle = '#c59b56';
  cCtx.beginPath();
  cCtx.arc(256, 256, 14, 0, Math.PI * 2);
  cCtx.fill();
  const clockFace = finalizeTexture(clockC, maxAnisotropy, 1, 1, true);

  // -------------------------------------------------------------------------
  // 12. VICTORIAN STUDY LEATHER & MAHOGANY SURVEYOR'S TABLETOP (Albedo + Rough)
  // -------------------------------------------------------------------------
  const [tableC, tCtx] = makeCanvas(512);
  const [tableR, trCtx] = makeCanvas(512);
  const tGrad = tCtx.createRadialGradient(256, 256, 24, 256, 256, 360);
  tGrad.addColorStop(0, '#222b25'); // Deep antique hunter-green/umber baize leather center
  tGrad.addColorStop(0.62, '#1a1f1c');
  tGrad.addColorStop(1, '#12100f');
  tCtx.fillStyle = tGrad;
  tCtx.fillRect(0, 0, 512, 512);
  trCtx.fillStyle = '#c8c8c8';
  trCtx.fillRect(0, 0, 512, 512);

  // Subtle tooled gold-leaf surveyor grid + compass ticks
  tCtx.strokeStyle = 'rgba(202, 162, 92, 0.14)';
  tCtx.lineWidth = 1.2;
  for (let i = 0; i <= 512; i += 64) {
    tCtx.beginPath();
    tCtx.moveTo(i, 0);
    tCtx.lineTo(i, 512);
    tCtx.stroke();
    tCtx.beginPath();
    tCtx.moveTo(0, i);
    tCtx.lineTo(512, i);
    tCtx.stroke();
  }
  // Leather pebble grain, ink smudges, old wax & coffee cup ring stains!
  addMicroWeathering(tCtx, 512, 8100, 1200, 0.08, 0.03);
  for (let r = 0; r < 5; r++) {
    const rx = 80 + seeded(8500 + r * 17) * 352;
    const ry = 80 + seeded(8600 + r * 23) * 352;
    const rr = 18 + seeded(8700 + r * 11) * 20;
    tCtx.strokeStyle = 'rgba(12, 8, 5, 0.25)';
    tCtx.lineWidth = 3.2;
    tCtx.beginPath();
    tCtx.arc(rx, ry, rr, 0, Math.PI * 2);
    tCtx.stroke();

    trCtx.strokeStyle = 'rgba(65, 65, 65, 0.6)';
    trCtx.lineWidth = 4;
    trCtx.beginPath();
    trCtx.arc(rx, ry, rr, 0, Math.PI * 2);
    trCtx.stroke();
  }
  const tabletop = finalizeTexture(tableC, maxAnisotropy, 3, 3, true);
  const tabletopRough = finalizeTexture(tableR, maxAnisotropy, 3, 3, false);

  // -------------------------------------------------------------------------
  // 13. BAKED ROOM ARCHITECTURAL AMBIENT OCCLUSION CREASE MAP (Wall-Base & Corners!)
  // -------------------------------------------------------------------------
  const [aoC, aoCtx] = makeCanvas(256);
  aoCtx.fillStyle = '#ffffff';
  aoCtx.fillRect(0, 0, 256, 256);
  // Dark shadow falloff inward from all 4 wall bases
  const edgeSize = 54;
  const topG = aoCtx.createLinearGradient(0, 0, 0, edgeSize);
  topG.addColorStop(0, 'rgba(18, 12, 8, 0.72)');
  topG.addColorStop(0.35, 'rgba(18, 12, 8, 0.28)');
  topG.addColorStop(1, 'rgba(18, 12, 8, 0)');
  aoCtx.fillStyle = topG;
  aoCtx.fillRect(0, 0, 256, edgeSize);

  const botG = aoCtx.createLinearGradient(0, 256, 0, 256 - edgeSize);
  botG.addColorStop(0, 'rgba(18, 12, 8, 0.72)');
  botG.addColorStop(0.35, 'rgba(18, 12, 8, 0.28)');
  botG.addColorStop(1, 'rgba(18, 12, 8, 0)');
  aoCtx.fillStyle = botG;
  aoCtx.fillRect(0, 256 - edgeSize, 256, edgeSize);

  const leftG = aoCtx.createLinearGradient(0, 0, edgeSize, 0);
  leftG.addColorStop(0, 'rgba(18, 12, 8, 0.72)');
  leftG.addColorStop(0.35, 'rgba(18, 12, 8, 0.28)');
  leftG.addColorStop(1, 'rgba(18, 12, 8, 0)');
  aoCtx.fillStyle = leftG;
  aoCtx.fillRect(0, 0, edgeSize, 256);

  const rightG = aoCtx.createLinearGradient(256, 0, 256 - edgeSize, 0);
  rightG.addColorStop(0, 'rgba(18, 12, 8, 0.72)');
  rightG.addColorStop(0.35, 'rgba(18, 12, 8, 0.28)');
  rightG.addColorStop(1, 'rgba(18, 12, 8, 0)');
  aoCtx.fillStyle = rightG;
  aoCtx.fillRect(256 - edgeSize, 0, edgeSize, 256);

  const roomAO = finalizeTexture(aoC, 1, 1, 1, false);
  roomAO.wrapS = THREE.ClampToEdgeWrapping;
  roomAO.wrapT = THREE.ClampToEdgeWrapping;

  // -------------------------------------------------------------------------
  // 14. SOFT RADIAL CONTACT SHADOW + SLAB DROP SHADOW + CANDLE GLOW + BOKEH DUST
  // -------------------------------------------------------------------------
  const [csC, csCtx] = makeCanvas(128);
  const csGrad = csCtx.createRadialGradient(64, 64, 4, 64, 64, 62);
  csGrad.addColorStop(0, 'rgba(5, 3, 2, 0.82)');
  csGrad.addColorStop(0.45, 'rgba(5, 3, 2, 0.42)');
  csGrad.addColorStop(0.78, 'rgba(5, 3, 2, 0.12)');
  csGrad.addColorStop(1, 'rgba(5, 3, 2, 0)');
  csCtx.fillStyle = csGrad;
  csCtx.fillRect(0, 0, 128, 128);
  const contactShadow = finalizeTexture(csC, 1, 1, 1, true);
  contactShadow.wrapS = THREE.ClampToEdgeWrapping;
  contactShadow.wrapT = THREE.ClampToEdgeWrapping;

  // Soft rectangular room-slab drop shadow on tabletop
  const [slC, slCtx] = makeCanvas(256);
  slCtx.clearRect(0, 0, 256, 256);
  slCtx.shadowColor = 'rgba(4, 2, 1, 0.88)';
  slCtx.shadowBlur = 32;
  slCtx.fillStyle = 'rgba(4, 2, 1, 0.86)';
  slCtx.fillRect(34, 34, 188, 188);
  const slabShadow = finalizeTexture(slC, 1, 1, 1, true);
  slabShadow.wrapS = THREE.ClampToEdgeWrapping;
  slabShadow.wrapT = THREE.ClampToEdgeWrapping;

  // Warm additive candlelight halo sprite
  const [lgC, lgCtx] = makeCanvas(128);
  const lgGrad = lgCtx.createRadialGradient(64, 64, 2, 64, 64, 62);
  lgGrad.addColorStop(0, 'rgba(255, 228, 165, 0.85)');
  lgGrad.addColorStop(0.3, 'rgba(255, 178, 84, 0.38)');
  lgGrad.addColorStop(0.68, 'rgba(230, 118, 42, 0.1)');
  lgGrad.addColorStop(1, 'rgba(230, 118, 42, 0)');
  lgCtx.fillStyle = lgGrad;
  lgCtx.fillRect(0, 0, 128, 128);
  const lightGlow = finalizeTexture(lgC, 1, 1, 1, true);
  lightGlow.wrapS = THREE.ClampToEdgeWrapping;
  lightGlow.wrapT = THREE.ClampToEdgeWrapping;

  // Soft circular bokeh particle texture (zero ugly square WebGL points!)
  const [ptC, ptCtx] = makeCanvas(64);
  const ptGrad = ptCtx.createRadialGradient(32, 32, 2, 32, 32, 30);
  ptGrad.addColorStop(0, 'rgba(255, 240, 200, 1)');
  ptGrad.addColorStop(0.45, 'rgba(245, 212, 145, 0.55)');
  ptGrad.addColorStop(1, 'rgba(245, 212, 145, 0)');
  ptCtx.fillStyle = ptGrad;
  ptCtx.fillRect(0, 0, 64, 64);
  const softParticle = finalizeTexture(ptC, 1, 1, 1, true);
  softParticle.wrapS = THREE.ClampToEdgeWrapping;
  softParticle.wrapT = THREE.ClampToEdgeWrapping;

  const allTextures = [
    woodFloor,
    woodNormal,
    woodRough,
    marbleFloor,
    marbleNormal,
    marbleRough,
    stoneFloor,
    stoneNormal,
    stoneRough,
    wallpaper,
    wallpaperNormal,
    wallpaperRough,
    furnitureWood,
    furnitureWoodNormal,
    furnitureWoodRough,
    patinaBrass,
    patinaBrassRough,
    exteriorWood,
    rug,
    portrait,
    stainedGlass,
    clockFace,
    tabletop,
    tabletopRough,
    roomAO,
    contactShadow,
    slabShadow,
    lightGlow,
    softParticle,
  ];

  return {
    woodFloor,
    woodNormal,
    woodRough,
    marbleFloor,
    marbleNormal,
    marbleRough,
    stoneFloor,
    stoneNormal,
    stoneRough,
    wallpaper,
    wallpaperNormal,
    wallpaperRough,
    furnitureWood,
    furnitureWoodNormal,
    furnitureWoodRough,
    patinaBrass,
    patinaBrassRough,
    exteriorWood,
    rug,
    portrait,
    stainedGlass,
    clockFace,
    tabletop,
    tabletopRough,
    roomAO,
    contactShadow,
    slabShadow,
    lightGlow,
    softParticle,
    dispose: () => {
      allTextures.forEach((t) => t.dispose());
    },
  };
}

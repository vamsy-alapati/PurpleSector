import { KERB, mulberry32, RUNOFF, type Track } from '@purple-sector/sim';
import { CAR_PIVOT, type Effects } from './effects';
import { drawScenery, type Scenery } from './scenery';

export interface TrackGfx {
  road: Path2D;
  edges: Path2D;
  kerbs: Path2D;
  /** Centre-lines of the gravel bands (stroked wide). */
  gravel: Path2D;
  gravelWidth: number;
  grassPattern: CanvasPattern | string;
  scrubPattern: CanvasPattern | string;
  gravelPattern: CanvasPattern | string;
}

/** World point (x, y) is drawn at screen point (ax, ay), rotated and scaled. */
export interface View {
  x: number;
  y: number;
  rotation: number;
  /** CSS pixels per metre. */
  scale: number;
  ax: number;
  ay: number;
}

export interface CarPose {
  x: number;
  y: number;
  heading: number;
  steer: number;
  braking: boolean;
  /** Sideways body lean (m), from cornering load. */
  roll: number;
  /** Distance travelled (m) for tyre tread animation; null hides the treads (too fast to see). */
  wheelPhase: number | null;
}

export interface Scene {
  track: Track;
  gfx: TrackGfx;
  view: View;
  car: CarPose;
  ghost: CarPose | null;
  fx: Effects;
  scenery: Scenery;
  /** Seconds, for crowd animation. */
  time: number;
  /** Visual size multiplier for cars (bigger in the full-track view). */
  carScale: number;
  minimap: boolean;
}

const COLORS = {
  scrub: '#18301e',
  grassA: '#24492c',
  grassB: '#2a5232',
  gravel: '#bba57c',
  barrier: '#0b0f0c',
  road: '#3a3e46',
  edge: '#ececec',
  kerbRed: '#d6342c',
  kerbWhite: '#f2f2f2',
};

/** Player livery: racing red with white accents — pops against the green. */
const LIVERY = { body: '#e3262f', bodyDark: '#a3161d', dark: '#111318', accent: '#ffffff' };
const GHOST_LIVERY = { body: '#e5e7eb', bodyDark: '#9ca3af', dark: '#374151', accent: '#c084fc' };

/** Kerbs appear where the bend radius is tighter than this (m). */
const KERB_RADIUS = 45;

// ---------- textures (generated, seeded so they look the same every load) ----------

function makePattern(
  ctx: CanvasRenderingContext2D,
  size: number,
  pxPerMetre: number,
  paint: (g: CanvasRenderingContext2D, rand: () => number) => void,
  fallback: string,
): CanvasPattern | string {
  try {
    const tile = document.createElement('canvas');
    tile.width = size;
    tile.height = size;
    const g = tile.getContext('2d');
    if (!g) return fallback;
    paint(g, mulberry32(size * 7919 + pxPerMetre));
    const p = ctx.createPattern(tile, 'repeat');
    if (!p) return fallback;
    p.setTransform(new DOMMatrix().scaleSelf(1 / pxPerMetre, 1 / pxPerMetre));
    return p;
  } catch {
    return fallback;
  }
}

/** Mown-stripe grass inside the barriers: 8 m stripes + fine speckle. */
function grassTexture(ctx: CanvasRenderingContext2D) {
  return makePattern(
    ctx,
    256,
    8,
    (g, rand) => {
      for (let i = 0; i < 4; i++) {
        g.fillStyle = i % 2 === 0 ? COLORS.grassA : COLORS.grassB;
        g.fillRect(i * 64, 0, 64, 256);
      }
      for (let i = 0; i < 1400; i++) {
        g.fillStyle = rand() < 0.5 ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.035)';
        g.fillRect(rand() * 256, rand() * 256, 1 + rand() * 1.5, 1 + rand() * 1.5);
      }
    },
    COLORS.grassA,
  );
}

/** Rough scrub with bushes outside the barriers. */
function scrubTexture(ctx: CanvasRenderingContext2D) {
  return makePattern(
    ctx,
    256,
    4,
    (g, rand) => {
      g.fillStyle = COLORS.scrub;
      g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 900; i++) {
        g.fillStyle = rand() < 0.5 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.025)';
        g.fillRect(rand() * 256, rand() * 256, 2, 2);
      }
      for (let i = 0; i < 16; i++) {
        const x = rand() * 256;
        const y = rand() * 256;
        const r = 5 + rand() * 13;
        const col = rand() < 0.5 ? '#122619' : '#1e3d26';
        // draw wrapped copies so the tile is seamless
        for (const ox of [-256, 0, 256]) {
          for (const oy of [-256, 0, 256]) {
            g.fillStyle = 'rgba(0,0,0,0.25)';
            g.beginPath();
            g.arc(x + ox + r * 0.25, y + oy + r * 0.3, r, 0, Math.PI * 2);
            g.fill();
            g.fillStyle = col;
            g.beginPath();
            g.arc(x + ox, y + oy, r, 0, Math.PI * 2);
            g.fill();
          }
        }
      }
    },
    COLORS.scrub,
  );
}

/** Pebbly gravel: 4 m tile at 16 px/m. */
function gravelTexture(ctx: CanvasRenderingContext2D) {
  return makePattern(
    ctx,
    64,
    16,
    (g, rand) => {
      g.fillStyle = COLORS.gravel;
      g.fillRect(0, 0, 64, 64);
      const cols = ['#a8946c', '#cdbb93', '#8c7a57', '#e0d2ae', '#9b8862'];
      for (let i = 0; i < 260; i++) {
        g.fillStyle = cols[Math.floor(rand() * cols.length)]!;
        g.beginPath();
        g.arc(rand() * 64, rand() * 64, 0.5 + rand() * 1.2, 0, Math.PI * 2);
        g.fill();
      }
    },
    COLORS.gravel,
  );
}

/** Pre-builds Path2D objects (in metres) and textures for everything static about the track. */
export function buildTrackGfx(ctx: CanvasRenderingContext2D, t: Track): TrackGfx {
  const road = new Path2D();
  for (let k = 0; k < t.n; k++) {
    if (k === 0) road.moveTo(t.xs[k]!, t.ys[k]!);
    else road.lineTo(t.xs[k]!, t.ys[k]!);
  }
  road.closePath();

  const edges = new Path2D();
  for (const side of [-1, 1]) {
    const off = side * (t.half - 0.45);
    for (let k = 0; k <= t.n; k++) {
      const i = k % t.n;
      const x = t.xs[i]! + t.nx[i]! * off;
      const y = t.ys[i]! + t.ny[i]! * off;
      if (k === 0) edges.moveTo(x, y);
      else edges.lineTo(x, y);
    }
  }

  // Kerbs on both sides wherever the bend is tight
  const kerbs = new Path2D();
  const kMin = 1 / KERB_RADIUS;
  for (const side of [-1, 1]) {
    const off = side * (t.half + 0.55);
    let inRun = false;
    for (let k = 0; k <= t.n; k++) {
      const i = k % t.n;
      const curved =
        Math.abs(t.curv[i]!) > kMin ||
        Math.abs(t.curv[(i + 2) % t.n]!) > kMin ||
        Math.abs(t.curv[(i - 2 + t.n) % t.n]!) > kMin;
      const x = t.xs[i]! + t.nx[i]! * off;
      const y = t.ys[i]! + t.ny[i]! * off;
      if (curved) {
        if (!inRun) kerbs.moveTo(x, y);
        else kerbs.lineTo(x, y);
      }
      inRun = curved;
    }
  }

  // Gravel bands: the same samples the sim uses for the gravel surface
  const gravelWidth = RUNOFF - KERB + 0.2;
  const gravelOff = t.half + KERB - 0.2 + gravelWidth / 2;
  const gravel = new Path2D();
  for (const side of [-1, 1]) {
    let inRun = false;
    for (let k = 0; k <= t.n; k++) {
      const i = k % t.n;
      const on = t.gravel[i] === side;
      const x = t.xs[i]! + t.nx[i]! * side * gravelOff;
      const y = t.ys[i]! + t.ny[i]! * side * gravelOff;
      if (on) {
        if (!inRun) gravel.moveTo(x, y);
        else gravel.lineTo(x, y);
      }
      inRun = on;
    }
  }

  return {
    road,
    edges,
    kerbs,
    gravel,
    gravelWidth,
    grassPattern: grassTexture(ctx),
    scrubPattern: scrubTexture(ctx),
    gravelPattern: gravelTexture(ctx),
  };
}

export function drawFrame(ctx: CanvasRenderingContext2D, w: number, h: number, dpr: number, s: Scene): void {
  const { track: t, gfx, view, fx } = s;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = COLORS.scrub;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.translate(view.ax, view.ay);
  ctx.scale(view.scale, view.scale);
  ctx.rotate(view.rotation);
  ctx.translate(-view.x, -view.y);

  // Scrub outside the barriers (world-space texture so it moves with the track)
  const r = Math.hypot(w, h) / view.scale;
  ctx.fillStyle = gfx.scrubPattern;
  ctx.fillRect(view.x - r, view.y - r, 2 * r, 2 * r);

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // Barrier wall, then mown grass inside it
  ctx.strokeStyle = COLORS.barrier;
  ctx.lineWidth = 2 * (t.half + RUNOFF) + 1.4;
  ctx.stroke(gfx.road);
  ctx.strokeStyle = gfx.grassPattern;
  ctx.lineWidth = 2 * (t.half + RUNOFF);
  ctx.stroke(gfx.road);

  // Gravel traps
  ctx.lineCap = 'butt';
  ctx.strokeStyle = gfx.gravelPattern;
  ctx.lineWidth = gfx.gravelWidth;
  ctx.stroke(gfx.gravel);

  // Kerbs
  ctx.lineWidth = 1.1;
  ctx.strokeStyle = COLORS.kerbWhite;
  ctx.stroke(gfx.kerbs);
  ctx.setLineDash([1.4, 1.4]);
  ctx.strokeStyle = COLORS.kerbRed;
  ctx.stroke(gfx.kerbs);
  ctx.setLineDash([]);
  ctx.lineCap = 'round';

  // Asphalt + white edge lines
  ctx.strokeStyle = COLORS.road;
  ctx.lineWidth = t.def.width;
  ctx.stroke(gfx.road);
  ctx.strokeStyle = COLORS.edge;
  ctx.lineWidth = 0.22;
  ctx.stroke(gfx.edges);

  drawScenery(ctx, s.scenery, s.time, s.car.x, s.car.y);
  drawTimingLines(ctx, t);
  drawSkids(ctx, fx);
  drawParticles(ctx, fx, false);

  if (s.ghost) {
    ctx.globalAlpha = 0.45;
    drawCar(ctx, s.ghost, s.carScale, GHOST_LIVERY);
    ctx.globalAlpha = 1;
  }
  drawCar(ctx, s.car, s.carScale, LIVERY);
  drawParticles(ctx, fx, true); // dust clouds drift over the car

  if (s.minimap) drawMinimap(ctx, w, h, dpr, s);
}

function drawTimingLines(ctx: CanvasRenderingContext2D, t: Track): void {
  // Chequered start/finish line
  const s = t.lines[0];
  ctx.save();
  ctx.translate(t.xs[s]!, t.ys[s]!);
  ctx.rotate(Math.atan2(t.ty[s]!, t.tx[s]!));
  const sq = t.def.width / 10;
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 10; col++) {
      ctx.fillStyle = (col + row) % 2 === 0 ? '#111' : '#f5f5f5';
      ctx.fillRect(row * sq - sq, -t.half + col * sq, sq, sq);
    }
  }
  ctx.restore();

  // Sector lines
  ctx.strokeStyle = 'rgba(250, 204, 21, 0.6)';
  ctx.lineWidth = 0.35;
  for (const i of [t.lines[1], t.lines[2]]) {
    ctx.beginPath();
    ctx.moveTo(t.xs[i]! - t.nx[i]! * t.half, t.ys[i]! - t.ny[i]! * t.half);
    ctx.lineTo(t.xs[i]! + t.nx[i]! * t.half, t.ys[i]! + t.ny[i]! * t.half);
    ctx.stroke();
  }
}

function drawSkids(ctx: CanvasRenderingContext2D, fx: Effects): void {
  if (fx.skidCount === 0) return;
  const d = fx.skids;
  ctx.strokeStyle = 'rgba(12, 12, 14, 0.38)';
  ctx.lineWidth = 0.45;
  ctx.lineCap = 'butt';
  ctx.beginPath();
  for (let i = 0; i < fx.skidCount; i++) {
    const o = i * 4;
    ctx.moveTo(d[o]!, d[o + 1]!);
    ctx.lineTo(d[o + 2]!, d[o + 3]!);
  }
  ctx.stroke();
  ctx.lineCap = 'round';
}

/** clouds = smoke/dust (drawn above the car); otherwise solid bits (gravel/grass, below). */
function drawParticles(ctx: CanvasRenderingContext2D, fx: Effects, clouds: boolean): void {
  for (const p of fx.particles) {
    const isCloud = p.kind === 'smoke' || p.kind === 'dust';
    if (isCloud !== clouds) continue;
    const a = p.life / p.maxLife;
    if (isCloud) {
      ctx.fillStyle = `${p.color}${(p.kind === 'smoke' ? 0.32 : 0.4) * a})`;
    } else {
      ctx.globalAlpha = Math.min(1, a * 1.6);
      ctx.fillStyle = p.color;
    }
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

type Livery = typeof LIVERY;

const TYRE_FRONT = { x: 1.45, y: 0.79, l: 0.68, w: 0.42 };
const TYRE_REAR = { x: -1.56, y: 0.8, l: 0.84, w: 0.52 };

function drawTyre(ctx: CanvasRenderingContext2D, l: number, w: number, phase: number | null): void {
  ctx.fillStyle = '#0b0b0c';
  ctx.beginPath();
  ctx.roundRect(-l / 2, -w / 2, l, w, 0.1);
  ctx.fill();
  if (phase === null) return;
  // Tread lines rolling round the tyre
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  const gap = l / 3;
  for (let k = 0; k < 3; k++) {
    const p = (((phase + k * gap) % l) + l) % l;
    ctx.fillRect(-l / 2 + p - 0.03, -w / 2 + 0.05, 0.06, w - 0.1);
  }
}

/** Original open-wheel car design, drawn in metres with the nose along +x. */
function drawCar(ctx: CanvasRenderingContext2D, car: CarPose, scale: number, L: Livery): void {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.heading);
  ctx.scale(scale, scale);
  ctx.translate(CAR_PIVOT, 0);

  // Shadow (shifts slightly opposite the lean)
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(-0.05, 0.3 - car.roll * 0.6, 2.65, 1.15, 0, 0, Math.PI * 2);
  ctx.fill();

  // Tyres: fronts turn with the steering
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(TYRE_REAR.x, side * TYRE_REAR.y);
    drawTyre(ctx, TYRE_REAR.l, TYRE_REAR.w, car.wheelPhase);
    ctx.restore();
    ctx.save();
    ctx.translate(TYRE_FRONT.x, side * TYRE_FRONT.y);
    ctx.rotate(car.steer * 0.4);
    drawTyre(ctx, TYRE_FRONT.l, TYRE_FRONT.w, car.wheelPhase);
    ctx.restore();
  }
  // Suspension arms
  ctx.strokeStyle = L.dark;
  ctx.lineWidth = 0.07;
  ctx.beginPath();
  for (const side of [-1, 1]) {
    ctx.moveTo(1.45, side * 0.6);
    ctx.lineTo(0.9, side * 0.2 + car.roll);
    ctx.moveTo(-1.56, side * 0.6);
    ctx.lineTo(-1.2, side * 0.3 + car.roll);
  }
  ctx.stroke();

  // Everything sprung leans with cornering load
  ctx.translate(0, car.roll);

  // Rear wing with endplates
  ctx.fillStyle = L.dark;
  ctx.fillRect(-2.52, -0.8, 0.46, 1.6);
  ctx.fillStyle = L.accent;
  ctx.fillRect(-2.52, -0.8, 0.12, 1.6);

  // Floor
  ctx.fillStyle = L.dark;
  ctx.beginPath();
  ctx.moveTo(-1.95, -0.5);
  ctx.lineTo(0.7, -0.7);
  ctx.lineTo(1.0, -0.36);
  ctx.lineTo(1.0, 0.36);
  ctx.lineTo(0.7, 0.7);
  ctx.lineTo(-1.95, 0.5);
  ctx.closePath();
  ctx.fill();

  // Body: sidepods tapering into the nose
  ctx.fillStyle = L.body;
  ctx.beginPath();
  ctx.moveTo(-2.08, -0.3);
  ctx.quadraticCurveTo(-1.3, -0.6, -0.6, -0.6);
  ctx.lineTo(0.45, -0.58);
  ctx.quadraticCurveTo(0.8, -0.5, 1.05, -0.26);
  ctx.lineTo(2.38, -0.12);
  ctx.quadraticCurveTo(2.46, 0, 2.38, 0.12);
  ctx.lineTo(1.05, 0.26);
  ctx.quadraticCurveTo(0.8, 0.5, 0.45, 0.58);
  ctx.lineTo(-0.6, 0.6);
  ctx.quadraticCurveTo(-1.3, 0.6, -2.08, 0.3);
  ctx.closePath();
  ctx.fill();

  // Shading on the sidepods + centre stripe
  ctx.fillStyle = L.bodyDark;
  ctx.fillRect(-1.6, 0.25, 1.9, 0.32);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(-1.6, -0.55, 1.9, 0.14);
  ctx.fillStyle = L.accent;
  ctx.fillRect(-1.9, -0.06, 4.2, 0.12);
  // Sidepod intakes
  ctx.fillStyle = L.dark;
  ctx.fillRect(0.25, -0.56, 0.18, 0.2);
  ctx.fillRect(0.25, 0.36, 0.18, 0.2);

  // Front wing with endplates
  ctx.fillStyle = L.dark;
  ctx.fillRect(2.12, -0.9, 0.36, 1.8);
  ctx.fillStyle = L.accent;
  ctx.fillRect(2.38, -0.9, 0.1, 1.8);

  // Cockpit, helmet, halo
  ctx.fillStyle = L.dark;
  ctx.beginPath();
  ctx.ellipse(-0.25, 0, 0.52, 0.28, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fde047';
  ctx.beginPath();
  ctx.arc(-0.32, 0, 0.17, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#1f2937';
  ctx.lineWidth = 0.08;
  ctx.beginPath();
  ctx.ellipse(-0.2, 0, 0.42, 0.26, 0, -Math.PI * 0.6, Math.PI * 0.6);
  ctx.stroke();

  // Brake light
  ctx.fillStyle = car.braking ? '#ff3b30' : '#5b1512';
  ctx.fillRect(-2.62, -0.1, 0.1, 0.2);
  if (car.braking) {
    ctx.fillStyle = 'rgba(255,59,48,0.35)';
    ctx.beginPath();
    ctx.arc(-2.6, 0, 0.5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/** North-up track map in the bottom-right corner (chase view only). */
function drawMinimap(ctx: CanvasRenderingContext2D, w: number, h: number, dpr: number, s: Scene): void {
  const { track: t, gfx } = s;
  const b = t.bounds;
  const pad = 14;
  const size = Math.min(240, w * 0.38);
  const bw = b.maxX - b.minX + 2 * pad;
  const bh = b.maxY - b.minY + 2 * pad;
  const m = size / Math.max(bw, bh);
  const boxW = bw * m;
  const boxH = bh * m;
  const ox = w - boxW - 16;
  const oy = h - boxH - 16;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.beginPath();
  ctx.roundRect(ox, oy, boxW, boxH, 12);
  ctx.fill();

  ctx.setTransform(dpr * m, 0, 0, dpr * m, dpr * (ox + (pad - b.minX) * m), dpr * (oy + (pad - b.minY) * m));
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 4 / m;
  ctx.stroke(gfx.road);

  // Start/finish marker
  const sl = t.lines[0];
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3 / m;
  ctx.beginPath();
  ctx.moveTo(t.xs[sl]! - t.nx[sl]! * 8, t.ys[sl]! - t.ny[sl]! * 8);
  ctx.lineTo(t.xs[sl]! + t.nx[sl]! * 8, t.ys[sl]! + t.ny[sl]! * 8);
  ctx.stroke();

  const dot = (x: number, y: number, r: number, fill: string, ring: number) => {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath();
    ctx.arc(x, y, (r + ring + 1.5) / m, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, (r + ring) / m, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(x, y, r / m, 0, Math.PI * 2);
    ctx.fill();
  };
  if (s.ghost) dot(s.ghost.x, s.ghost.y, 5, '#c084fc', 1.5);
  dot(s.car.x, s.car.y, 7, LIVERY.body, 2.5);
}

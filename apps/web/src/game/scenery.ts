/**
 * Grandstands with animated crowds. Purely visual (not part of the sim), but placed
 * deterministically from the track id so everyone sees the same layout.
 */
import { hashString, mulberry32, RUNOFF, type Bounds, type Track } from '@purple-sector/sim';

const GAP_BEHIND_BARRIER = 2.5;
const DEPTH = 7.5;
const ROW_GAP = 1.15;
const SEAT_GAP = 0.72;
const MAIN_LENGTH = 46;
const SIDE_LENGTH = 30;
const MAX_STANDS = 6;

const SHIRTS = ['#ef4444', '#f59e0b', '#3b82f6', '#10b981', '#e5e7eb', '#a855f7', '#f472b6', '#facc15', '#1f2937', '#0ea5e9'];
const SKIN = ['#f1c7a1', '#d9a074', '#a86b45', '#6b4128'];

export interface Stand {
  /** Front-centre point (closest to the track). */
  cx: number;
  cy: number;
  /** Local axes: ux along the stand, vy pointing away from the track. */
  ux: number;
  uy: number;
  vx: number;
  vy: number;
  length: number;
  main: boolean;
  /** Per spectator: localX, localY, phase, shirt index, skin index. */
  people: Float32Array;
  count: number;
}

export interface Scenery {
  stands: Stand[];
  /** Bounds of the stands (for fitting the full-track view). */
  bounds: Bounds;
}

/** The full-track view frames the track plus this margin (m); stands must fit inside it. */
export function frameMargin(t: Track): number {
  return t.half + RUNOFF + 3;
}

function clearOfTrack(t: Track, s: Omit<Stand, 'people' | 'count' | 'main'>, others: Stand[]): boolean {
  const minD = t.half + RUNOFF + 1.5;
  const minD2 = minD * minD;
  const m = frameMargin(t);
  const b0 = t.bounds;
  for (let a = -s.length / 2; a <= s.length / 2 + 0.01; a += 2) {
    for (let b = 0; b <= DEPTH + 0.01; b += DEPTH / 3) {
      const px = s.cx + s.ux * a + s.vx * b;
      const py = s.cy + s.uy * a + s.vy * b;
      // keep stands inside the full-track frame so they never force the view to zoom out
      if (px < b0.minX - m || px > b0.maxX + m || py < b0.minY - m || py > b0.maxY + m) return false;
      for (let i = 0; i < t.n; i++) {
        const dx = px - t.xs[i]!;
        const dy = py - t.ys[i]!;
        if (dx * dx + dy * dy < minD2) return false;
      }
      for (const o of others) {
        // inside another stand's footprint (with a little margin)?
        const rx = px - o.cx;
        const ry = py - o.cy;
        const la = rx * o.ux + ry * o.uy;
        const lb = rx * o.vx + ry * o.vy;
        if (Math.abs(la) < o.length / 2 + 3 && lb > -3 && lb < DEPTH + 3) return false;
      }
    }
  }
  return true;
}

function makeStand(t: Track, i: number, side: number, length: number): Omit<Stand, 'people' | 'count' | 'main'> {
  // Axes chosen so the transform is always a rotation (never a mirror)
  const ux = side * t.tx[i]!;
  const uy = side * t.ty[i]!;
  const vx = side * t.nx[i]!;
  const vy = side * t.ny[i]!;
  const off = t.half + RUNOFF + GAP_BEHIND_BARRIER;
  return { cx: t.xs[i]! + vx * off, cy: t.ys[i]! + vy * off, ux, uy, vx, vy, length };
}

function fillCrowd(s: Omit<Stand, 'people' | 'count'>, rand: () => number): Stand {
  const rows = Math.floor((DEPTH - 1.2) / ROW_GAP);
  const perRow = Math.floor((s.length - 1) / SEAT_GAP);
  const data: number[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < perRow; c++) {
      if (rand() < 0.12) continue; // a few empty seats
      const x = -s.length / 2 + 0.5 + c * SEAT_GAP + (rand() - 0.5) * 0.15;
      const y = 1.0 + r * ROW_GAP + (rand() - 0.5) * 0.1;
      data.push(x, y, rand() * Math.PI * 2, Math.floor(rand() * SHIRTS.length), Math.floor(rand() * SKIN.length));
    }
  }
  return { ...s, people: new Float32Array(data), count: data.length / 5 };
}

export function buildScenery(t: Track): Scenery {
  const rand = mulberry32(hashString(`stands:${t.def.id}`));
  const stands: Stand[] = [];

  // Main grandstand facing the start/finish line — try both sides, then shorter
  main: for (const length of [MAIN_LENGTH, MAIN_LENGTH * 0.7]) {
    for (const side of [1, -1]) {
      const s = makeStand(t, t.lines[0], side, length);
      if (clearOfTrack(t, s, stands)) {
        stands.push(fillCrowd({ ...s, main: true }, rand));
        break main;
      }
    }
  }

  // Smaller stands spread around the lap, preferring the outside of bends (best view)
  const slots = 14;
  for (let k = 1; k < slots && stands.length < MAX_STANDS; k++) {
    const i = (t.lines[0] + Math.floor((k * t.n) / slots)) % t.n;
    const outside = t.gravel[i]! !== 0 ? t.gravel[i]! : rand() < 0.5 ? 1 : -1;
    placing: for (const length of [SIDE_LENGTH, SIDE_LENGTH * 0.7]) {
      for (const side of [outside, -outside]) {
        const s = makeStand(t, i, side, length);
        if (clearOfTrack(t, s, stands)) {
          stands.push(fillCrowd({ ...s, main: false }, rand));
          k += 1; // leave a gap before the next stand
          break placing;
        }
      }
    }
  }

  const bounds: Bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const s of stands) {
    for (const [a, b] of [
      [-s.length / 2, 0],
      [s.length / 2, 0],
      [-s.length / 2, DEPTH],
      [s.length / 2, DEPTH],
    ] as const) {
      const x = s.cx + s.ux * a + s.vx * b;
      const y = s.cy + s.uy * a + s.vy * b;
      bounds.minX = Math.min(bounds.minX, x);
      bounds.maxX = Math.max(bounds.maxX, x);
      bounds.minY = Math.min(bounds.minY, y);
      bounds.maxY = Math.max(bounds.maxY, y);
    }
  }
  return { stands, bounds };
}

/**
 * Draw stands + crowd. People bob gently; they get livelier when the car is close,
 * and the main stand does a Mexican wave every so often.
 */
export function drawScenery(ctx: CanvasRenderingContext2D, sc: Scenery, time: number, carX: number, carY: number): void {
  for (const s of sc.stands) {
    ctx.save();
    ctx.transform(s.ux, s.uy, s.vx, s.vy, s.cx, s.cy);
    const L = s.length;

    // Shadow, terraces, back wall, front railing
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(-L / 2 + 0.6, 0.6, L, DEPTH);
    ctx.fillStyle = '#7b818c';
    ctx.fillRect(-L / 2, 0, L, DEPTH);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    for (let y = 0.45; y < DEPTH - 0.8; y += ROW_GAP) ctx.fillRect(-L / 2, y, L, 0.12);
    ctx.fillStyle = s.main ? '#1f2937' : '#374151';
    ctx.fillRect(-L / 2, DEPTH - 0.7, L, 0.7);
    ctx.fillStyle = '#e5e7eb';
    ctx.fillRect(-L / 2, 0, L, 0.18);
    // Stairways
    ctx.fillStyle = '#9ca3af';
    for (let x = -L / 2 + L / 4; x < L / 2 - 1; x += L / 4) ctx.fillRect(x - 0.35, 0.2, 0.7, DEPTH - 0.9);

    if (s.main) {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(-L / 2 + 2, DEPTH - 0.62, L - 4, 0.55);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 0.45px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('PURPLE SECTOR  ·  PURPLE SECTOR  ·  PURPLE SECTOR', 0, DEPTH - 0.34);
    }

    // Crowd excitement: distance from the car to the stand centre
    const mx = s.cx + s.vx * (DEPTH / 2);
    const my = s.cy + s.vy * (DEPTH / 2);
    const dist = Math.hypot(carX - mx, carY - my);
    const excite = Math.max(0, Math.min(1, 1 - (dist - 15) / 50));
    const wave = s.main ? ((time % 14) / 4) * (L + 10) - L / 2 - 5 : -1e9;

    const p = s.people;
    // Batch draws by colour: shirts/shoulders first, then heads
    for (let colour = 0; colour < SHIRTS.length; colour++) {
      ctx.fillStyle = SHIRTS[colour]!;
      ctx.beginPath();
      for (let k = 0; k < s.count; k++) {
        const o = k * 5;
        if (p[o + 3] !== colour) continue;
        const [x, y, size] = personPose(p, o, time, excite, wave);
        ctx.moveTo(x + 0.3 * size, y);
        ctx.ellipse(x, y, 0.3 * size, 0.22 * size, 0, 0, Math.PI * 2);
      }
      ctx.fill();
    }
    for (let tone = 0; tone < SKIN.length; tone++) {
      ctx.fillStyle = SKIN[tone]!;
      ctx.beginPath();
      for (let k = 0; k < s.count; k++) {
        const o = k * 5;
        if (p[o + 4] !== tone) continue;
        const [x, y, size] = personPose(p, o, time, excite, wave);
        ctx.moveTo(x + 0.14 * size, y - 0.02);
        ctx.arc(x, y - 0.02, 0.14 * size, 0, Math.PI * 2);
      }
      ctx.fill();
    }
    ctx.restore();
  }
}

/** Position + size of one spectator this frame. Standing up = slightly bigger (closer to the camera). */
function personPose(p: Float32Array, o: number, time: number, excite: number, wave: number): [number, number, number] {
  const x = p[o]!;
  const y = p[o + 1]!;
  const phase = p[o + 2]!;
  const idle = Math.sin(time * 1.8 + phase);
  const cheer = Math.max(0, Math.sin(time * 9 + phase * 3));
  const inWave = Math.max(0, 1 - Math.abs(x - wave) / 2.5);
  const lift = Math.max(excite * cheer, inWave);
  return [x + idle * 0.04, y + idle * 0.05 - lift * 0.18, 1 + lift * 0.3];
}

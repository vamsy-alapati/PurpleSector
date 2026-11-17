/**
 * Procedural daily tracks. The same seed string always produces the same track on
 * every device and on the server, so the daily track never has to be stored.
 *
 * Method ("circuit blueprint"):
 *   1. start from a wide rectangle (screens are wide, so tracks are too)
 *   2. cut features into it: notches (U-sections → hairpin-style corners),
 *      corner cut-outs (L-shapes) and chamfers (45° kinks); jitter the vertices a little
 *   3. round every vertex with a real arc (radius ≥ MIN_RADIUS) → crisp corners + straights
 *   4. reject anything too long/short, too tight, self-overlapping, or with too few corners
 */
import { atan2, cos, sin } from './detmath';
import { hashString, mulberry32 } from './rng';
import { RUNOFF } from './session';
import { buildTrack, circDist, type Track, type TrackDef } from './track';

export const TRACK_WIDTH = 12;
export const MIN_LENGTH = 520;
export const MAX_LENGTH = 900;
/** Tightest allowed bend radius on the centreline (m). */
export const MIN_RADIUS = 14;
/** Fillet radii are never smaller than this (a margin above MIN_RADIUS for spline wobble). */
const MIN_FILLET = 16;
/** Minimum number of distinct corners (radius < CORNER_RADIUS) per lap. */
export const MIN_CORNERS = 8;
const CORNER_RADIUS = 60;
const STRAIGHT_CURV = 1 / 100;
/** Overall size of the blueprint (1 = 230–290 m wide). Smaller = shorter laps. */
const SCALE = 0.82;

const ADJECTIVES = [
  'Copper', 'Granite', 'Midnight', 'Saffron', 'Cobalt', 'Ember', 'Glacier', 'Harbour',
  'Juniper', 'Lantern', 'Meadow', 'Obsidian', 'Quarry', 'Rapid', 'Sable', 'Summit',
  'Tidal', 'Velvet', 'Willow', 'Zephyr', 'Amber', 'Basalt', 'Cinder', 'Falcon',
];
const NOUNS = [
  'Ring', 'Loop', 'Circuit', 'Park', 'Bends', 'Sprint', 'Hollow', 'Ridge',
  'Raceway', 'Esses', 'Speedway', 'Hairpins', 'Gardens', 'Point', 'Valley', 'Docks',
];

function pick<T>(arr: readonly T[], r: number): T {
  return arr[Math.floor(r * arr.length) % arr.length]!;
}

type Pt = [number, number];

const range = (rand: () => number, lo: number, hi: number) => lo + rand() * (hi - lo);

// ---------------------------------------------------------------------------
// 1–2. Blueprint polygon
// ---------------------------------------------------------------------------

type CornerKind = { kind: 'plain' } | { kind: 'chamfer'; c: number } | { kind: 'cutout'; a: number; b: number };

function blueprint(rand: () => number): Pt[] {
  const W = range(rand, 230, 290);
  const H = range(rand, 115, 150);
  // Clockwise on screen (y down): top-left, top-right, bottom-right, bottom-left
  const C: Pt[] = [
    [-W / 2, -H / 2],
    [W / 2, -H / 2],
    [W / 2, H / 2],
    [-W / 2, H / 2],
  ];
  const len = [W, H, W, H];
  const dir: Pt[] = [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
  ];
  // For this rectangle, the inward normal of side k is the direction of side k+1
  const inward = (k: number) => dir[(k + 1) % 4]!;

  // Corner features (corner k sits at the START of side k)
  const corners: CornerKind[] = [];
  for (let k = 0; k < 4; k++) {
    const r = rand();
    const prevLen = len[(k + 3) % 4]!;
    if (r < 0.28) {
      corners.push({ kind: 'cutout', a: range(rand, 45, prevLen * 0.38), b: range(rand, 40, len[k]! * 0.38) });
    } else if (r < 0.55) {
      corners.push({ kind: 'chamfer', c: range(rand, 22, 40) });
    } else {
      corners.push({ kind: 'plain' });
    }
  }
  /** Distance reserved by a corner feature along the side that LEAVES it / ENTERS it. */
  const reserveOut = (c: CornerKind) => (c.kind === 'cutout' ? c.b : c.kind === 'chamfer' ? c.c : 0);
  const reserveIn = (c: CornerKind) => (c.kind === 'cutout' ? c.a : c.kind === 'chamfer' ? c.c : 0);

  // Notches: 1–3, at most one per side, where they fit
  const notchCount = 1 + Math.floor(rand() * 3);
  const notch: ({ u0: number; u1: number; d: number; slant: number } | null)[] = [null, null, null, null];
  for (let tries = 0, placed = 0; tries < 12 && placed < notchCount; tries++) {
    const k = Math.floor(rand() * 4);
    if (notch[k]) continue;
    const start = reserveOut(corners[k]!) + 30;
    const end = len[k]! - reserveIn(corners[(k + 1) % 4]!) - 30;
    const width = range(rand, 60, 95);
    if (end - start < width) continue;
    const u0 = range(rand, start, end - width);
    const across = len[(k + 1) % 4]!; // depth limit comes from the perpendicular dimension
    const d = range(rand, 30, across * 0.42);
    notch[k] = { u0, u1: u0 + width, d, slant: range(rand, 0, 14) };
    placed++;
  }

  const v: Pt[] = [];
  const at = (k: number, u: number, depth: number): Pt => {
    const o = C[k]!;
    const dk = dir[k]!;
    const nk = inward(k);
    return [o[0] + dk[0] * u + nk[0] * depth, o[1] + dk[1] * u + nk[1] * depth];
  };
  for (let k = 0; k < 4; k++) {
    const prev = (k + 3) % 4;
    const ck = corners[k]!;
    // Corner k
    if (ck.kind === 'plain') {
      v.push([C[k]![0], C[k]![1]]);
    } else if (ck.kind === 'chamfer') {
      v.push(at(prev, len[prev]! - ck.c, 0));
      v.push(at(k, ck.c, 0));
    } else {
      v.push(at(prev, len[prev]! - ck.a, 0));
      v.push(at(prev, len[prev]! - ck.a, ck.b)); // the inner (concave) corner
      v.push(at(k, ck.b, 0));
    }
    // Notch on side k
    const n = notch[k];
    if (n) {
      v.push(at(k, n.u0, 0));
      v.push(at(k, n.u0 + n.slant, n.d));
      v.push(at(k, n.u1 - n.slant, n.d));
      v.push(at(k, n.u1, 0));
    }
  }

  // Organic jitter so nothing looks ruler-straight, then scale to the target size
  for (const p of v) {
    p[0] = (p[0] + range(rand, -7, 7)) * SCALE;
    p[1] = (p[1] + range(rand, -7, 7)) * SCALE;
  }
  return v;
}

// ---------------------------------------------------------------------------
// 3. Round every vertex with a circular arc
// ---------------------------------------------------------------------------

function filleted(v: Pt[], rand: () => number): Pt[] | null {
  const n = v.length;
  const out: Pt[] = [];
  let prevEnd: Pt | null = null;

  const pushStraight = (from: Pt, to: Pt) => {
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const len = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.floor(len / 20);
    for (let s = 1; s < steps; s++) out.push([from[0] + (dx * s) / steps, from[1] + (dy * s) / steps]);
  };

  const arcs: { p1: Pt; p2: Pt; pts: Pt[] }[] = [];
  for (let i = 0; i < n; i++) {
    const p = v[(i - 1 + n) % n]!;
    const c = v[i]!;
    const q = v[(i + 1) % n]!;
    const ax = c[0] - p[0];
    const ay = c[1] - p[1];
    const bx = q[0] - c[0];
    const by = q[1] - c[1];
    const la = Math.sqrt(ax * ax + ay * ay);
    const lb = Math.sqrt(bx * bx + by * by);
    if (la < 1 || lb < 1) return null;
    const ux = ax / la;
    const uy = ay / la;
    const wx = bx / lb;
    const wy = by / lb;
    const phi = atan2(ux * wy - uy * wx, ux * wx + uy * wy); // signed turn, + = right (y down)
    const turn = Math.abs(phi);
    if (turn < 0.04) {
      arcs.push({ p1: c, p2: c, pts: [[c[0], c[1]]] });
      continue;
    }
    const tanHalf = sin(turn / 2) / cos(turn / 2);
    let r = rand() < 0.2 ? range(rand, 32, 48) : range(rand, MIN_FILLET, 30);
    let T = r * tanHalf;
    const tMax = 0.48 * Math.min(la, lb);
    if (T > tMax) {
      T = tMax;
      r = T / tanHalf;
    }
    if (r < MIN_FILLET) return null;
    const p1: Pt = [c[0] - ux * T, c[1] - uy * T];
    const p2: Pt = [c[0] + wx * T, c[1] + wy * T];
    const side = phi > 0 ? 1 : -1;
    const cx = p1[0] + -uy * r * side;
    const cy = p1[1] + ux * r * side;
    const start = atan2(p1[1] - cy, p1[0] - cx);
    const steps = Math.max(2, Math.ceil((turn * r) / 4));
    const pts: Pt[] = [];
    for (let s = 0; s <= steps; s++) {
      const ang = start + (phi * s) / steps;
      pts.push([cx + r * cos(ang), cy + r * sin(ang)]);
    }
    arcs.push({ p1, p2, pts });
  }

  for (const a of arcs) {
    if (prevEnd) pushStraight(prevEnd, a.p1);
    out.push(...a.pts);
    prevEnd = a.p2;
  }
  pushStraight(prevEnd!, arcs[0]!.p1);
  return out;
}

function randomPoints(rand: () => number): Pt[] | null {
  const pts = filleted(blueprint(rand), rand);
  if (!pts) return null;
  // Mirror and/or reverse for variety (clockwise and anticlockwise circuits)
  const mx = rand() < 0.5 ? -1 : 1;
  const my = rand() < 0.5 ? -1 : 1;
  for (const p of pts) {
    p[0] *= mx;
    p[1] *= my;
  }
  if (rand() < 0.5) pts.reverse();
  return pts;
}

// ---------------------------------------------------------------------------
// 4. Validation
// ---------------------------------------------------------------------------

/** Number of distinct corners (separate runs of tight curvature). */
export function countCorners(t: Track): number {
  const k = 1 / CORNER_RADIUS;
  let origin = 0;
  for (let i = 0; i < t.n; i++) {
    if (Math.abs(t.curv[i]!) < k) {
      origin = i;
      break;
    }
  }
  let corners = 0;
  let inCorner = false;
  let calm = 0;
  let lastSign = 0;
  for (let s = 1; s <= t.n; s++) {
    const c = t.curv[(origin + s) % t.n]!;
    if (Math.abs(c) >= k) {
      const sign = c > 0 ? 1 : -1;
      // a new corner starts after a calm stretch, or when the bend changes direction (esses)
      if (!inCorner || calm > 6 || sign !== lastSign) corners++;
      inCorner = true;
      calm = 0;
      lastSign = sign;
    } else if (inCorner && ++calm > 6) {
      inCorner = false;
    }
  }
  return corners;
}

/** Longest run of near-straight samples: [startIndex, length]. */
function longestStraight(t: Track): [number, number] {
  let bestStart = 0;
  let bestLen = 0;
  let origin = 0;
  for (let i = 0; i < t.n; i++) {
    if (Math.abs(t.curv[i]!) >= STRAIGHT_CURV) {
      origin = i;
      break;
    }
  }
  let runStart = -1;
  for (let k = 1; k <= t.n; k++) {
    const i = (origin + k) % t.n;
    const straight = Math.abs(t.curv[i]!) < STRAIGHT_CURV;
    if (straight && runStart < 0) runStart = k;
    if ((!straight || k === t.n) && runStart >= 0) {
      const len = k - runStart;
      if (len > bestLen) {
        bestLen = len;
        bestStart = (origin + runStart) % t.n;
      }
      runStart = -1;
    }
  }
  return [bestStart, bestLen];
}

/** Why a track is unacceptable, or null if it's fine. */
export function trackProblem(t: Track): string | null {
  if (t.length < MIN_LENGTH) return 'too short';
  if (t.length > MAX_LENGTH) return 'too long';
  for (let i = 0; i < t.n; i++) if (Math.abs(t.curv[i]!) > 1 / MIN_RADIUS) return 'bend too tight';
  if (longestStraight(t)[1] * t.spacing < 60) return 'no straight';
  if (countCorners(t) < MIN_CORNERS) return 'too few corners';

  const minSep = t.def.width + 2 * RUNOFF + 4;
  const minSep2 = minSep * minSep;
  const skip = Math.ceil(70 / t.spacing);
  for (let i = 0; i < t.n; i += 2) {
    // every other sample (~4 m) is plenty when the required gap is ~32 m
    for (let j = i + skip; j < t.n; j += 2) {
      if (circDist(i, j, t.n) < skip) continue;
      const dx = t.xs[i]! - t.xs[j]!;
      const dy = t.ys[i]! - t.ys[j]!;
      if (dx * dx + dy * dy < minSep2) return 'sections too close';
    }
  }
  return null;
}

export function validateTrack(t: Track): boolean {
  return trackProblem(t) === null;
}

/** Exposed for tuning/diagnostics: one raw candidate from a given RNG (null = blueprint failed). */
export function candidateTrack(rand: () => number): Track | null {
  const pts = randomPoints(rand);
  return pts ? buildTrack({ id: 'candidate', name: '', width: TRACK_WIDTH, points: pts }) : null;
}

// ---------------------------------------------------------------------------

/** Deterministically generate a valid track for any seed string (e.g. "2026-11-16"). */
export function generateTrackDef(seedKey: string): TrackDef {
  const rand = mulberry32(hashString(seedKey));
  const name = `${pick(ADJECTIVES, rand())} ${pick(NOUNS, rand())}`;

  for (let attempt = 0; attempt < 400; attempt++) {
    const pts = randomPoints(rand);
    if (!pts) continue;
    const def: TrackDef = { id: seedKey, name, width: TRACK_WIDTH, points: pts };
    const t = buildTrack(def);
    if (!validateTrack(t)) continue;
    // Put the start/finish line just past the middle of the longest straight
    const [start, len] = longestStraight(t);
    const startIdx = (start + Math.floor(len * 0.55)) % t.n;
    const final: TrackDef = { ...def, startAt: startIdx / t.n };
    // Re-validate exactly what players will drive (rotation shifts sample boundaries slightly)
    if (validateTrack(buildTrack(final))) return final;
  }

  // Practically unreachable fallback: a rounded rectangle
  const fallback = filleted(
    [
      [-120, -60],
      [120, -60],
      [120, 60],
      [-120, 60],
    ],
    () => 0.5,
  )!;
  return { id: seedKey, name, width: TRACK_WIDTH, points: fallback };
}

/**
 * Procedural daily tracks. The same seed string always produces the same track on
 * every device and on the server, so the daily track never has to be stored.
 *
 * Method: random points around a squashed circle (varying radius = bends, hairpins
 * and kinks) → smooth spline → reject anything too long, too tight or self-overlapping.
 */
import { cos, sin, TWO_PI } from './detmath';
import { hashString, mulberry32 } from './rng';
import { RUNOFF } from './session';
import { buildTrack, circDist, type Track, type TrackDef } from './track';

export const TRACK_WIDTH = 12;
export const MIN_LENGTH = 480;
export const MAX_LENGTH = 900;
/** Tightest allowed bend radius on the centreline (m). */
export const MIN_RADIUS = 14;
const STRAIGHT_CURV = 1 / 100;

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

function randomPoints(rand: () => number): [number, number][] {
  const count = 7 + Math.floor(rand() * 6); // 7–12 control points
  const A = 125; // half-extent x (m)
  const B = 80; // half-extent y (m)
  const step = TWO_PI / count;
  const phase = rand() * TWO_PI;
  const pts: [number, number][] = [];
  for (let i = 0; i < count; i++) {
    const theta = phase + i * step + (rand() - 0.5) * step * 0.6;
    const r = 0.45 + rand() * 0.55;
    pts.push([A * r * cos(theta), B * r * sin(theta)]);
  }
  if (rand() < 0.5) pts.reverse(); // clockwise or anticlockwise
  return pts;
}

/** Longest run of near-straight samples: [startIndex, length]. */
function longestStraight(t: Track): [number, number] {
  let bestStart = 0;
  let bestLen = 0;
  // Start scanning just after a bend so runs don't wrap awkwardly
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

export function validateTrack(t: Track): boolean {
  if (t.length < MIN_LENGTH || t.length > MAX_LENGTH) return false;
  for (let i = 0; i < t.n; i++) if (Math.abs(t.curv[i]!) > 1 / MIN_RADIUS) return false;
  if (longestStraight(t)[1] * t.spacing < 50) return false;

  const minSep = t.def.width + 2 * RUNOFF + 4;
  const minSep2 = minSep * minSep;
  const skip = Math.ceil(70 / t.spacing);
  for (let i = 0; i < t.n; i++) {
    for (let j = i + skip; j < t.n; j++) {
      if (circDist(i, j, t.n) < skip) continue;
      const dx = t.xs[i]! - t.xs[j]!;
      const dy = t.ys[i]! - t.ys[j]!;
      if (dx * dx + dy * dy < minSep2) return false;
    }
  }
  return true;
}

/** Deterministically generate a valid track for any seed string (e.g. "2026-11-16"). */
export function generateTrackDef(seedKey: string): TrackDef {
  const rand = mulberry32(hashString(seedKey));
  const name = `${pick(ADJECTIVES, rand())} ${pick(NOUNS, rand())}`;

  for (let attempt = 0; attempt < 400; attempt++) {
    const def: TrackDef = { id: seedKey, name, width: TRACK_WIDTH, points: randomPoints(rand) };
    const t = buildTrack(def);
    if (!validateTrack(t)) continue;
    // Put the start/finish line just past the middle of the longest straight
    const [start, len] = longestStraight(t);
    const startIdx = (start + Math.floor(len * 0.55)) % t.n;
    return { ...def, startAt: startIdx / t.n };
  }

  // Practically unreachable fallback: a plain oval
  const pts: [number, number][] = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TWO_PI;
    pts.push([110 * cos(a), 65 * sin(a)]);
  }
  return { id: seedKey, name, width: TRACK_WIDTH, points: pts };
}

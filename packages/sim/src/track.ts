/**
 * Track geometry: a closed centripetal Catmull-Rom spline through control points,
 * resampled to evenly spaced centreline samples (~2 m apart).
 * Coordinates are metres, y points DOWN (canvas convention).
 */

export interface TrackDef {
  id: string;
  name: string;
  /** Road width in metres. */
  width: number;
  /** Control points, in driving order. */
  points: ReadonlyArray<readonly [number, number]>;
  /** Where the start/finish line sits, as a fraction of the lap (0–1). Default 0. */
  startAt?: number;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface Track {
  def: TrackDef;
  /** Number of centreline samples. */
  n: number;
  /** Distance between samples (m). */
  spacing: number;
  /** Lap length (m). */
  length: number;
  /** Half road width (m). */
  half: number;
  xs: Float64Array;
  ys: Float64Array;
  /** Unit tangent (driving direction). */
  tx: Float64Array;
  ty: Float64Array;
  /** Unit normal pointing to the driver's RIGHT. */
  nx: Float64Array;
  ny: Float64Array;
  /** Signed curvature (1/m), positive = right-hand bend. */
  curv: Float64Array;
  /** Sample indices of the timing lines: [start/finish, sector 2 start, sector 3 start]. */
  lines: [number, number, number];
  /** Bounding box of the centreline. */
  bounds: Bounds;
  /** Gravel trap per sample: 0 = none, -1 = on the left side, 1 = on the right side. */
  gravel: Int8Array;
}

/** Bends tighter than this radius (m) get a gravel trap on the outside. */
const GRAVEL_RADIUS = 45;
const GRAVEL_REACH = 12;

const DENSE_STEPS = 40;

type P = readonly [number, number];

function knot(a: P, b: P): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  // centripetal parameterisation: |d|^0.5
  return Math.sqrt(Math.sqrt(dx * dx + dy * dy)) || 1e-6;
}

export function buildTrack(def: TrackDef, targetSpacing = 2): Track {
  const pts = def.points;
  const m = pts.length;
  if (m < 4) throw new Error('A track needs at least 4 control points');

  // 1) Dense spline polyline
  const dx: number[] = [];
  const dy: number[] = [];
  for (let i = 0; i < m; i++) {
    const p0 = pts[(i - 1 + m) % m]!;
    const p1 = pts[i]!;
    const p2 = pts[(i + 1) % m]!;
    const p3 = pts[(i + 2) % m]!;
    const t0 = 0;
    const t1 = t0 + knot(p0, p1);
    const t2 = t1 + knot(p1, p2);
    const t3 = t2 + knot(p2, p3);
    for (let s = 0; s < DENSE_STEPS; s++) {
      const t = t1 + ((t2 - t1) * s) / DENSE_STEPS;
      const a1x = ((t1 - t) / (t1 - t0)) * p0[0] + ((t - t0) / (t1 - t0)) * p1[0];
      const a1y = ((t1 - t) / (t1 - t0)) * p0[1] + ((t - t0) / (t1 - t0)) * p1[1];
      const a2x = ((t2 - t) / (t2 - t1)) * p1[0] + ((t - t1) / (t2 - t1)) * p2[0];
      const a2y = ((t2 - t) / (t2 - t1)) * p1[1] + ((t - t1) / (t2 - t1)) * p2[1];
      const a3x = ((t3 - t) / (t3 - t2)) * p2[0] + ((t - t2) / (t3 - t2)) * p3[0];
      const a3y = ((t3 - t) / (t3 - t2)) * p2[1] + ((t - t2) / (t3 - t2)) * p3[1];
      const b1x = ((t2 - t) / (t2 - t0)) * a1x + ((t - t0) / (t2 - t0)) * a2x;
      const b1y = ((t2 - t) / (t2 - t0)) * a1y + ((t - t0) / (t2 - t0)) * a2y;
      const b2x = ((t3 - t) / (t3 - t1)) * a2x + ((t - t1) / (t3 - t1)) * a3x;
      const b2y = ((t3 - t) / (t3 - t1)) * a2y + ((t - t1) / (t3 - t1)) * a3y;
      dx.push(((t2 - t) / (t2 - t1)) * b1x + ((t - t1) / (t2 - t1)) * b2x);
      dy.push(((t2 - t) / (t2 - t1)) * b1y + ((t - t1) / (t2 - t1)) * b2y);
    }
  }

  // 2) Arc-length resample to uniform spacing
  const dm = dx.length;
  const cum = new Float64Array(dm + 1);
  for (let i = 0; i < dm; i++) {
    const j = (i + 1) % dm;
    const ex = dx[j]! - dx[i]!;
    const ey = dy[j]! - dy[i]!;
    cum[i + 1] = cum[i]! + Math.sqrt(ex * ex + ey * ey);
  }
  const length = cum[dm]!;
  const n = Math.max(16, Math.round(length / targetSpacing));
  const spacing = length / n;
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  // Rotate so that sample 0 (the start/finish line) sits at def.startAt
  const offset = Math.round((def.startAt ?? 0) * n) % n;
  let j = 0;
  for (let k = 0; k < n; k++) {
    const target = ((k + offset) % n) * spacing;
    if (target < cum[j]!) j = 0;
    while (cum[j + 1]! < target) j++;
    const seg = cum[j + 1]! - cum[j]!;
    const f = seg > 0 ? (target - cum[j]!) / seg : 0;
    const a = j;
    const b = (j + 1) % dm;
    xs[k] = dx[a]! + (dx[b]! - dx[a]!) * f;
    ys[k] = dy[a]! + (dy[b]! - dy[a]!) * f;
  }

  // 3) Tangents, normals, curvature
  const tx = new Float64Array(n);
  const ty = new Float64Array(n);
  const nx = new Float64Array(n);
  const ny = new Float64Array(n);
  const curv = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    const a = (k - 1 + n) % n;
    const b = (k + 1) % n;
    const ex = xs[b]! - xs[a]!;
    const ey = ys[b]! - ys[a]!;
    const len = Math.sqrt(ex * ex + ey * ey) || 1;
    tx[k] = ex / len;
    ty[k] = ey / len;
    nx[k] = -ty[k]!;
    ny[k] = tx[k]!;
  }
  for (let k = 0; k < n; k++) {
    const a = (k - 1 + n) % n;
    const b = (k + 1) % n;
    curv[k] = (tx[a]! * ty[b]! - ty[a]! * tx[b]!) / (2 * spacing);
  }

  // Gravel on the OUTSIDE of tight bends (right-hand bend → outside is the left)
  const gravel = new Int8Array(n);
  for (let k = 0; k < n; k++) {
    let strongest = 0;
    for (let d = -GRAVEL_REACH; d <= GRAVEL_REACH; d++) {
      const c = curv[(k + d + n) % n]!;
      if (Math.abs(c) > Math.abs(strongest)) strongest = c;
    }
    if (Math.abs(strongest) > 1 / GRAVEL_RADIUS) gravel[k] = strongest > 0 ? -1 : 1;
  }

  const bounds: Bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (let k = 0; k < n; k++) {
    bounds.minX = Math.min(bounds.minX, xs[k]!);
    bounds.maxX = Math.max(bounds.maxX, xs[k]!);
    bounds.minY = Math.min(bounds.minY, ys[k]!);
    bounds.maxY = Math.max(bounds.maxY, ys[k]!);
  }

  return {
    def,
    bounds,
    gravel,
    n,
    spacing,
    length,
    half: def.width / 2,
    xs,
    ys,
    tx,
    ty,
    nx,
    ny,
    curv,
    lines: [0, Math.floor(n / 3), Math.floor((2 * n) / 3)],
  };
}

/** Shortest index distance between two samples on a closed loop. */
export function circDist(a: number, b: number, n: number): number {
  const d = Math.abs(a - b) % n;
  return d > n - d ? n - d : d;
}

export interface Location {
  /** Nearest centreline sample. */
  idx: number;
  /** Signed lateral offset from the centreline (m), positive = right. */
  lat: number;
}

/** ±samples searched around the previous position (car moves < 1 m per tick; samples are ~2 m apart). */
const SEARCH_WINDOW = 12;

/**
 * Find the nearest centreline sample. With a hint (the previous index) only a local
 * window is searched, which is fast and stops the car "teleporting" to a nearby
 * part of the circuit.
 */
export function locate(t: Track, x: number, y: number, hint = -1): Location {
  let best = 0;
  let bestD = Infinity;
  if (hint < 0) {
    for (let i = 0; i < t.n; i++) {
      const ex = x - t.xs[i]!;
      const ey = y - t.ys[i]!;
      const d = ex * ex + ey * ey;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
  } else {
    for (let k = -SEARCH_WINDOW; k <= SEARCH_WINDOW; k++) {
      const i = (((hint + k) % t.n) + t.n) % t.n;
      const ex = x - t.xs[i]!;
      const ey = y - t.ys[i]!;
      const d = ex * ex + ey * ey;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
  }
  const lat = (x - t.xs[best]!) * t.nx[best]! + (y - t.ys[best]!) * t.ny[best]!;
  return { idx: best, lat };
}

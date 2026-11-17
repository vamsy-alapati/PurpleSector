/**
 * Input recordings ("replays"). An attempt is the list of 4-bit inputs for every
 * physics tick from the grid until the timed lap completes. Because the sim is
 * deterministic, the inputs alone reproduce the lap exactly: the server re-runs
 * them to verify a lap time, and the client re-runs them to draw a ghost.
 */
import { DT } from './physics';
import { Session, type LapResult } from './session';
import type { Track } from './track';

/** Longest attempt we accept: 3 minutes of ticks. */
export const MAX_ATTEMPT_TICKS = 120 * 180;

/** Run-length encode: each run is `<value hex digit><count base36>` joined by '.' */
export function encodeInputs(bits: ArrayLike<number>): string {
  const runs: string[] = [];
  let i = 0;
  while (i < bits.length) {
    const v = bits[i]! & 15;
    let n = 1;
    while (i + n < bits.length && (bits[i + n]! & 15) === v) n++;
    runs.push(v.toString(16) + n.toString(36));
    i += n;
  }
  return runs.join('.');
}

/** Inverse of encodeInputs. Throws on malformed or oversized input. */
export function decodeInputs(s: string, maxTicks = MAX_ATTEMPT_TICKS): Uint8Array {
  if (s.length === 0) return new Uint8Array(0);
  if (!/^[0-9a-f][0-9a-z]+(\.[0-9a-f][0-9a-z]+)*$/.test(s)) throw new Error('malformed inputs');
  const runs = s.split('.');
  let total = 0;
  const parsed: [number, number][] = [];
  for (const r of runs) {
    const v = parseInt(r[0]!, 16);
    const n = parseInt(r.slice(1), 36);
    if (!(n > 0)) throw new Error('malformed run');
    total += n;
    if (total > maxTicks) throw new Error('attempt too long');
    parsed.push([v, n]);
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const [v, n] of parsed) {
    out.fill(v, o, o + n);
    o += n;
  }
  return out;
}

export interface AttemptOutcome {
  /** The completed timed lap, or null if the inputs never finish one. */
  lap: LapResult | null;
  /** Ticks consumed up to and including the lap's finishing tick. */
  ticks: number;
}

/**
 * Re-run an attempt from the grid. Optional `onTick` sees the session after every
 * step (used to build ghost poses).
 */
export function simulateAttempt(
  track: Track,
  inputs: ArrayLike<number>,
  onTick?: (s: Session) => void,
): AttemptOutcome {
  const s = new Session(track);
  for (let i = 0; i < inputs.length; i++) {
    s.step(inputs[i]!);
    onTick?.(s);
    if (s.laps.length > 0) return { lap: s.laps[0]!, ticks: i + 1 };
  }
  return { lap: null, ticks: inputs.length };
}

/** Ghost poses sampled every `every` ticks during the timed lap: flat [t, x, y, heading, …]. */
export function ghostFromInputs(track: Track, inputs: ArrayLike<number>, every = 4): number[] {
  const frames: number[] = [];
  simulateAttempt(track, inputs, (s) => {
    const lt = s.lapTime;
    if (lt === null || s.laps.length > 0) return;
    if (s.tick % every === 0) frames.push(lt, s.car.x, s.car.y, s.car.heading);
  });
  return frames;
}

/** Lap time → whole milliseconds isn't precise enough for ties; keep seconds but sanity-check. */
export function plausibleLapTime(t: number): boolean {
  return Number.isFinite(t) && t > 5 && t < MAX_ATTEMPT_TICKS * DT;
}

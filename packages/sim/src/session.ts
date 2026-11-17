/**
 * A driving session on one track: car, surfaces, barriers, track limits and lap timing.
 * Timing lines are crossed with sub-tick interpolation, so lap times are precise to well
 * under a millisecond even though physics runs at 120 Hz.
 */
import { atan2 } from './detmath';
import { createCar, DT, physicsFor, stepCar, type CarParams, type CarState, type Surface } from './physics';
import { circDist, locate, type Track } from './track';

/** Kerb width beyond the road edge that still counts as track surface (m). */
export const KERB = 1.2;
/** Car centre this far beyond the road edge = clearly beyond the kerb = lap invalid (m). */
export const TRACK_LIMIT = 2.2;
/** Grass run-off width before the barrier (m). */
export const RUNOFF = 8;
/** The car starts this many samples (~30 m) behind the start line. */
const START_BACK = 15;
/** A timing line only counts when crossed within this many samples of it. */
const LINE_NEAR = 20;

export interface LapResult {
  lap: number;
  time: number;
  sectors: [number, number, number];
  valid: boolean;
}

export type SessionEvent =
  | { type: 'lapStart' }
  | { type: 'invalidated' }
  | { type: 'sector'; index: number; time: number; split: number; valid: boolean }
  | { type: 'lap'; result: LapResult };

export class Session {
  car!: CarState;
  tick = 0;
  /** Nearest centreline sample. */
  idx = 0;
  /** Lateral offset from centreline (m). */
  lat = 0;
  surface: Surface = 'track';
  /** Sim time at which the current timed lap started, or null on the out-lap. */
  lapStart: number | null = null;
  /** Index into track.lines of the next timing line to cross. */
  nextLine = 0;
  splits: number[] = [];
  lapValid = true;
  lapCount = 0;
  laps: LapResult[] = [];
  private events: SessionEvent[] = [];
  /** Car rules for this track (versioned by day so old laps always replay exactly). */
  readonly physics: CarParams;

  constructor(readonly track: Track) {
    this.physics = physicsFor(track.def.id);
    this.resetCar();
  }

  get time(): number {
    return this.tick * DT;
  }

  get lapTime(): number | null {
    return this.lapStart === null ? null : this.time - this.lapStart;
  }

  /** Put the car back on the grid, behind the start line, for a new out-lap. */
  resetCar(): void {
    const t = this.track;
    const i = (t.n - START_BACK) % t.n;
    this.car = createCar(t.xs[i]!, t.ys[i]!, atan2(t.ty[i]!, t.tx[i]!));
    this.tick = 0;
    this.idx = i;
    this.lat = 0;
    this.surface = 'track';
    this.lapStart = null;
    this.nextLine = 0;
    this.splits = [];
    this.lapValid = true;
    this.events = [];
  }

  drainEvents(): SessionEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  step(input: number): void {
    const c = this.car;
    const t = this.track;
    const px = c.x;
    const py = c.y;

    stepCar(c, input, this.surface, this.physics);
    this.tick++;

    const loc = locate(t, c.x, c.y, this.idx);
    this.idx = loc.idx;
    let lat = loc.lat;

    // Barrier at the edge of the run-off
    const limit = t.half + RUNOFF;
    if (Math.abs(lat) > limit) {
      const s = lat > 0 ? 1 : -1;
      const nx = t.nx[loc.idx]!;
      const ny = t.ny[loc.idx]!;
      const excess = Math.abs(lat) - limit;
      c.x -= s * nx * excess;
      c.y -= s * ny * excess;
      const vn = (c.vx * nx + c.vy * ny) * s;
      if (vn > 0) {
        c.vx -= s * nx * vn * 1.4;
        c.vy -= s * ny * vn * 1.4;
        c.vx *= 0.75;
        c.vy *= 0.75;
        c.yawRate *= 0.3;
      }
      lat = s * limit;
    }
    this.lat = lat;

    const absLat = Math.abs(lat);
    if (absLat <= t.half + KERB) this.surface = 'track';
    else this.surface = t.gravel[loc.idx]! === (lat > 0 ? 1 : -1) ? 'gravel' : 'grass';
    if (this.lapStart !== null && this.lapValid && absLat > t.half + TRACK_LIMIT) {
      this.lapValid = false;
      this.events.push({ type: 'invalidated' });
    }

    this.checkTimingLine(px, py);
  }

  private checkTimingLine(px: number, py: number): void {
    const t = this.track;
    const L = t.lines[this.nextLine as 0 | 1 | 2];
    if (circDist(this.idx, L, t.n) > LINE_NEAR) return;

    const lx = t.xs[L]!;
    const ly = t.ys[L]!;
    const ltx = t.tx[L]!;
    const lty = t.ty[L]!;
    const d0 = (px - lx) * ltx + (py - ly) * lty;
    const d1 = (this.car.x - lx) * ltx + (this.car.y - ly) * lty;
    if (!(d0 < 0 && d1 >= 0)) return;

    // Exact crossing moment, interpolated within the tick
    const crossTime = (this.tick - 1 + d0 / (d0 - d1)) * DT;

    if (this.nextLine === 0) {
      if (this.lapStart !== null) {
        const time = crossTime - this.lapStart;
        const s1 = this.splits[0]!;
        const s2 = this.splits[1]!;
        const result: LapResult = {
          lap: ++this.lapCount,
          time,
          sectors: [s1, s2 - s1, time - s2],
          valid: this.lapValid,
        };
        this.laps.push(result);
        this.events.push({ type: 'lap', result });
      }
      this.lapStart = crossTime;
      this.splits = [];
      this.lapValid = true;
      this.nextLine = 1;
      this.events.push({ type: 'lapStart' });
    } else {
      const split = crossTime - (this.lapStart ?? 0);
      const prev = this.nextLine === 1 ? 0 : this.splits[0]!;
      this.splits.push(split);
      this.events.push({
        type: 'sector',
        index: this.nextLine - 1,
        time: split - prev,
        split,
        valid: this.lapValid,
      });
      this.nextLine = (this.nextLine + 1) % 3;
    }
  }
}

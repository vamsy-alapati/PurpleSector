/**
 * Ghost of your best lap: poses sampled at ~30 Hz from the moment the lap started.
 * (Phase 5 switches to input replays so ghosts can be verified and shared.)
 */
export interface GhostPose {
  x: number;
  y: number;
  heading: number;
}

/** Flat array: t, x, y, heading, t, x, y, heading, … */
export type GhostData = number[];

export class GhostRecorder {
  private frames: GhostData = [];

  reset(): void {
    this.frames = [];
  }

  record(t: number, x: number, y: number, heading: number): void {
    this.frames.push(round(t, 4), round(x, 2), round(y, 2), round(heading, 4));
  }

  take(): GhostData {
    const f = this.frames;
    this.frames = [];
    return f;
  }
}

export class GhostPlayer {
  private cursor = 0;

  constructor(readonly data: GhostData) {}

  /** Pose at lap time t (interpolated), or null when outside the recording. */
  poseAt(t: number): GhostPose | null {
    const d = this.data;
    const count = d.length / 4;
    if (count < 2 || t < d[0]! || t > d[(count - 1) * 4]!) return null;
    if (d[this.cursor * 4]! > t) this.cursor = 0;
    while (this.cursor < count - 2 && d[(this.cursor + 1) * 4]! <= t) this.cursor++;
    const a = this.cursor * 4;
    const b = a + 4;
    const span = d[b]! - d[a]!;
    const f = span > 0 ? (t - d[a]!) / span : 0;
    let dh = d[b + 3]! - d[a + 3]!;
    if (dh > Math.PI) dh -= 2 * Math.PI;
    if (dh < -Math.PI) dh += 2 * Math.PI;
    return {
      x: d[a + 1]! + (d[b + 1]! - d[a + 1]!) * f,
      y: d[a + 2]! + (d[b + 2]! - d[a + 2]!) * f,
      heading: d[a + 3]! + dh * f,
    };
  }
}

function round(v: number, places: number): number {
  const m = 10 ** places;
  return Math.round(v * m) / m;
}

import { describe, expect, it } from 'vitest';
import {
  atan2,
  buildTrack,
  carSpeed,
  cos,
  createCar,
  generateTrackDef,
  stepCar,
  INPUT,
  MAX_LENGTH,
  MIN_LENGTH,
  Session,
  sin,
  utcDateKey,
  validateTrack,
  wrapAngle,
  type Track,
} from '../src';

describe('detmath', () => {
  it('sin/cos/atan2 match Math within 1e-9', () => {
    for (let x = -20; x <= 20; x += 0.0137) {
      expect(Math.abs(sin(x) - Math.sin(x))).toBeLessThan(1e-9);
      expect(Math.abs(cos(x) - Math.cos(x))).toBeLessThan(1e-9);
    }
    for (let i = 0; i < 2000; i++) {
      const y = Math.sin(i * 1.7) * (i % 13);
      const x = Math.cos(i * 2.3) * (i % 7);
      if (x === 0 && y === 0) continue; // direction of a zero vector is undefined
      // ±π are the same direction (engines differ on the sign of -0), so compare wrapped
      expect(Math.abs(wrapAngle(atan2(y, x) - Math.atan2(y, x)))).toBeLessThan(1e-9);
    }
  });
});

/** 120 consecutive days starting 2026-01-01. */
const DAYS = Array.from({ length: 120 }, (_, i) => utcDateKey(new Date(Date.UTC(2026, 0, 1 + i))));

describe('daily track generator', () => {
  it('is deterministic for a given date', () => {
    expect(generateTrackDef('2026-11-16')).toEqual(generateTrackDef('2026-11-16'));
    expect(generateTrackDef('2026-11-16')).not.toEqual(generateTrackDef('2026-11-17'));
  });

  it('produces a valid, short track every day', () => {
    for (const day of DAYS) {
      const def = generateTrackDef(day);
      const t = buildTrack(def);
      expect(def.startAt, `${day} used the fallback oval`).toBeDefined();
      expect(validateTrack(t), day).toBe(true);
      expect(t.length).toBeGreaterThanOrEqual(MIN_LENGTH);
      expect(t.length).toBeLessThanOrEqual(MAX_LENGTH);
    }
  });
});

/** Simple autopilot used to prove tracks are drivable and timing works. */
function botInput(s: Session, t: Track): number {
  const c = s.car;
  const look = (s.idx + 6) % t.n;
  const ang = Math.atan2(t.ys[look]! - c.y, t.xs[look]! - c.x);
  const d = wrapAngle(ang - c.heading);
  let bits = 0;
  if (d > 0.03) bits |= INPUT.RIGHT;
  else if (d < -0.03) bits |= INPUT.LEFT;

  let maxK = 1e-4;
  const v = carSpeed(c);
  const ahead = Math.ceil((v * v) / (2 * 30) / t.spacing) + 6;
  for (let k = 0; k < ahead; k++) maxK = Math.max(maxK, Math.abs(t.curv[(s.idx + k) % t.n]!));
  const vMax = Math.sqrt(28 / maxK);
  if (v < vMax) bits |= INPUT.THROTTLE;
  else if (v > vMax + 2) bits |= INPUT.BRAKE;
  return bits;
}

function runBot(day: string, maxLaps: number) {
  const t = buildTrack(generateTrackDef(day));
  const s = new Session(t);
  const inputs: number[] = [];
  for (let i = 0; i < 120 * 200 && s.laps.length < maxLaps; i++) {
    const b = botInput(s, t);
    inputs.push(b);
    s.step(b);
  }
  return { s, inputs };
}

describe('surfaces', () => {
  it('tight bends get gravel traps on the outside', () => {
    const withGravel = DAYS.slice(0, 30).filter((d) => buildTrack(generateTrackDef(d)).gravel.some((g) => g !== 0));
    expect(withGravel.length).toBeGreaterThan(20);
  });

  it('you can reverse out of the grass at a decent speed', () => {
    const car = createCar(0, 0, 0);
    for (let i = 0; i < 120 * 2; i++) stepCar(car, INPUT.BRAKE, 'grass');
    expect(car.vx).toBeLessThan(-8);
  });
});

describe('session', () => {
  it('a bot completes laps of roughly 12–35 s on every daily track', () => {
    const times: number[] = [];
    for (const day of DAYS.slice(0, 40)) {
      const { s } = runBot(day, 2);
      expect(s.laps.length, day).toBe(2);
      const lap = s.laps[1]!;
      const sum = lap.sectors[0] + lap.sectors[1] + lap.sectors[2];
      expect(Math.abs(sum - lap.time)).toBeLessThan(1e-9);
      expect(lap.time, day).toBeGreaterThan(10);
      expect(lap.time, day).toBeLessThan(35);
      times.push(lap.time);
    }
    times.sort((a, b) => a - b);
    console.log(
      `bot flying laps over 40 days: min ${times[0]!.toFixed(2)}s, median ${times[20]!.toFixed(2)}s, max ${times[39]!.toFixed(2)}s`,
    );
  });

  it('is deterministic: replaying the same inputs gives the identical result', () => {
    const { s, inputs } = runBot('2026-11-16', 1);
    const replay = new Session(buildTrack(generateTrackDef('2026-11-16')));
    for (const b of inputs) replay.step(b);
    expect(replay.car).toEqual(s.car);
    expect(replay.laps).toEqual(s.laps);
  });
});

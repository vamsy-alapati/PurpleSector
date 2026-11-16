/**
 * Arcade car model. Runs at a FIXED timestep and only uses deterministic math,
 * so the same input sequence always produces the same lap on every device.
 */
import { cos, sin, wrapAngle } from './detmath';

/** Physics tick length: 120 Hz. */
export const DT = 1 / 120;

/** Input is a 4-bit mask per tick — tiny to store for replays and ghosts. */
export const INPUT = {
  THROTTLE: 1,
  BRAKE: 2,
  LEFT: 4,
  RIGHT: 8,
} as const;

export interface CarState {
  x: number;
  y: number;
  /** Radians; 0 = +x, increasing clockwise on screen (y down). */
  heading: number;
  vx: number;
  vy: number;
  yawRate: number;
  /** Smoothed steering position, -1 (left) … 1 (right). */
  steer: number;
}

export type Surface = 'track' | 'grass' | 'gravel';

interface OffroadGrip {
  accelMul: number;
  extraDrag: number;
  extraRolling: number;
  latMax: number;
  gripRate: number;
}

export const CAR = {
  /** Max acceleration from the engine (m/s²). */
  maxAccel: 15,
  /** Power-ish constant: engine accel = min(maxAccel, power / speed). */
  power: 900,
  /** Aerodynamic drag coefficient (per metre). */
  drag: 0.00125,
  rolling: 0.4,
  brake: 42,
  reverseAccel: 12,
  maxReverse: 14,
  wheelbase: 3.0,
  /** tan(max steering angle) — high, so tight daily-track bends are easy to take. */
  maxSteerTan: 0.75,
  /** Lateral grip limit (m/s²) ≈ 4.7 g, arcade-friendly. */
  latMax: 46,
  /** How quickly sideways velocity is scrubbed (1/s). Lower = more drift. */
  gripRate: 14,
  yawResponse: 20,
  steerIn: 9,
  steerOut: 12,
  offroad: {
    /** Grass: a mild penalty — you lose time, not the whole lap. */
    grass: { accelMul: 0.8, extraDrag: 0.002, extraRolling: 1.5, latMax: 26, gripRate: 6 },
    /** Gravel traps on the outside of tight bends: properly slow and slidey. */
    gravel: { accelMul: 0.45, extraDrag: 0.007, extraRolling: 6, latMax: 14, gripRate: 3 },
  } satisfies Record<'grass' | 'gravel', OffroadGrip>,
} as const;

export function createCar(x: number, y: number, heading: number): CarState {
  return { x, y, heading, vx: 0, vy: 0, yawRate: 0, steer: 0 };
}

export function carSpeed(c: CarState): number {
  return Math.sqrt(c.vx * c.vx + c.vy * c.vy);
}

export function stepCar(c: CarState, input: number, surface: Surface): void {
  const throttle = (input & INPUT.THROTTLE) !== 0;
  const brake = (input & INPUT.BRAKE) !== 0;
  const left = (input & INPUT.LEFT) !== 0;
  const right = (input & INPUT.RIGHT) !== 0;
  const off: OffroadGrip | null = surface === 'track' ? null : CAR.offroad[surface];

  // --- Steering (smoothed so digital keys feel analogue) ---
  const target = (right ? 1 : 0) - (left ? 1 : 0);
  const rate = target === 0 || target * c.steer < 0 ? CAR.steerOut : CAR.steerIn;
  const maxDelta = rate * DT;
  const diff = target - c.steer;
  c.steer += diff > maxDelta ? maxDelta : diff < -maxDelta ? -maxDelta : diff;

  // --- Velocity in the car's frame ---
  const ch = cos(c.heading);
  const sh = sin(c.heading);
  let vLong = c.vx * ch + c.vy * sh;
  let vLat = -c.vx * sh + c.vy * ch;

  // --- Longitudinal ---
  let a = 0;
  if (throttle) {
    const engine = Math.min(CAR.maxAccel, CAR.power / Math.max(Math.abs(vLong), 1));
    a += off ? engine * off.accelMul : engine;
  }
  if (brake) {
    if (vLong > 0.5) a -= CAR.brake;
    else if (!throttle) a -= CAR.reverseAccel;
  }
  const drag = CAR.drag + (off ? off.extraDrag : 0);
  a -= drag * vLong * Math.abs(vLong);

  const before = vLong;
  vLong += a * DT;
  // Off-road rolling resistance is halved when reversing, so you can always back out
  const offRolling = off ? (vLong < 0 ? off.extraRolling * 0.5 : off.extraRolling) : 0;
  const rolling = (CAR.rolling + offRolling) * DT;
  if (vLong > 0) vLong = Math.max(0, vLong - rolling);
  else if (vLong < 0) vLong = Math.min(0, vLong + rolling);
  if (brake && before > 0.5 && vLong < 0) vLong = 0;
  if (vLong < -CAR.maxReverse) vLong = -CAR.maxReverse;

  // --- Lateral grip: scrub sideways velocity ---
  const grip = off ? off.gripRate : CAR.gripRate;
  vLat = vLat / (1 + grip * DT);

  // --- Yaw: limited by steering geometry at low speed, by grip at high speed ---
  const av = Math.abs(vLong);
  const latMax = off ? off.latMax : CAR.latMax;
  const maxYaw = Math.min((av * CAR.maxSteerTan) / CAR.wheelbase, latMax / Math.max(av, 1));
  const desiredYaw = c.steer * maxYaw * (vLong >= 0 ? 1 : -1);
  c.yawRate += (desiredYaw - c.yawRate) * Math.min(1, CAR.yawResponse * DT);
  c.heading = wrapAngle(c.heading + c.yawRate * DT);

  // --- Back to world frame (old frame: rotation creates slip next tick) ---
  c.vx = vLong * ch - vLat * sh;
  c.vy = vLong * sh + vLat * ch;
  c.x += c.vx * DT;
  c.y += c.vy * DT;
}

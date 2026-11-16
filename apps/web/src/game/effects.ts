/** Purely visual effects (skid marks, smoke, dust, gravel spray). Not part of the deterministic sim. */
import { INPUT, type CarState, type Surface } from '@apex/sim';

/**
 * The sim tracks the car by a point near its REAR axle; the car body is drawn this far
 * (m, before scaling) ahead of it. Rotation then pivots around the rear wheels like a
 * real car instead of spinning around its middle.
 */
export const CAR_PIVOT = 1.1;

const MAX_SKIDS = 6000;
const MAX_PARTICLES = 500;

/** Rear tyre positions in car-local metres (relative to the sim point). */
const REAR = [
  [-1.55 + CAR_PIVOT, -0.8],
  [-1.55 + CAR_PIVOT, 0.8],
] as const;

export type ParticleKind = 'smoke' | 'dust' | 'gravel' | 'grass';

export interface Particle {
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  grow: number;
  color: string;
}

const GRAVEL_COLORS = ['#a8946c', '#cdbb93', '#8c7a57', '#e0d2ae'];
const GRASS_COLORS = ['#3f7a3a', '#2f6a2e', '#5c8f45'];

export class Effects {
  /** Ring buffer of skid segments: x1, y1, x2, y2. */
  readonly skids = new Float32Array(MAX_SKIDS * 4);
  skidCount = 0;
  private skidHead = 0;

  readonly particles: Particle[] = [];

  constructor(private readonly carScale: () => number) {}

  clear(): void {
    this.skidCount = 0;
    this.skidHead = 0;
    this.particles.length = 0;
  }

  /** Called after every sim step with the car state before and after it. */
  afterStep(prev: CarState, car: CarState, input: number, surface: Surface): void {
    const sh = Math.sin(car.heading);
    const ch = Math.cos(car.heading);
    const vLong = car.vx * ch + car.vy * sh;
    const vLat = -car.vx * sh + car.vy * ch;
    const speed = Math.hypot(car.vx, car.vy);
    const braking = (input & INPUT.BRAKE) !== 0 && vLong > 22;
    const sliding = Math.abs(vLat) > 2.4;
    const s = this.carScale();

    for (const [lx, ly] of REAR) {
      const p = wheel(prev, lx * s, ly * s);
      const c = wheel(car, lx * s, ly * s);
      if (surface === 'track') {
        if (sliding || braking) {
          this.addSkid(p[0], p[1], c[0], c[1]);
          if (sliding && Math.random() < 0.3) this.spawnSmoke(c[0], c[1], car, s);
        }
      } else if (speed > 3) {
        const intensity = Math.min(1, speed / 30);
        if (surface === 'gravel') {
          for (let k = 0; k < 2; k++) if (Math.random() < 0.8 * intensity) this.spawnBits(c[0], c[1], car, s, 'gravel');
          if (Math.random() < 0.35 * intensity) this.spawnDust(c[0], c[1], car, s, 'rgba(196,176,132,');
        } else {
          if (Math.random() < 0.5 * intensity) this.spawnBits(c[0], c[1], car, s, 'grass');
          if (Math.random() < 0.15 * intensity) this.spawnDust(c[0], c[1], car, s, 'rgba(120,100,62,');
        }
      }
    }
  }

  update(dt: number): void {
    const ps = this.particles;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i]!;
      p.life -= dt;
      if (p.life <= 0) {
        ps[i] = ps[ps.length - 1]!;
        ps.pop();
        continue;
      }
      const drag = Math.exp(-dt * (p.kind === 'gravel' || p.kind === 'grass' ? 5 : 3));
      p.vx *= drag;
      p.vy *= drag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.size += p.grow * dt;
    }
  }

  private addSkid(x1: number, y1: number, x2: number, y2: number): void {
    const o = this.skidHead * 4;
    this.skids[o] = x1;
    this.skids[o + 1] = y1;
    this.skids[o + 2] = x2;
    this.skids[o + 3] = y2;
    this.skidHead = (this.skidHead + 1) % MAX_SKIDS;
    this.skidCount = Math.min(this.skidCount + 1, MAX_SKIDS);
  }

  private push(p: Particle): void {
    if (this.particles.length < MAX_PARTICLES) this.particles.push(p);
  }

  private spawnSmoke(x: number, y: number, car: CarState, s: number): void {
    this.push({
      kind: 'smoke',
      x,
      y,
      vx: car.vx * 0.15 + (Math.random() - 0.5) * 4,
      vy: car.vy * 0.15 + (Math.random() - 0.5) * 4,
      life: 0.9,
      maxLife: 0.9,
      size: 0.5 * s,
      grow: 2.2 * s,
      color: 'rgba(225,225,230,',
    });
  }

  private spawnDust(x: number, y: number, car: CarState, s: number, color: string): void {
    this.push({
      kind: 'dust',
      x,
      y,
      vx: car.vx * 0.2 + (Math.random() - 0.5) * 5,
      vy: car.vy * 0.2 + (Math.random() - 0.5) * 5,
      life: 0.8,
      maxLife: 0.8,
      size: 0.6 * s,
      grow: 2.6 * s,
      color,
    });
  }

  /** Small pebbles / grass clippings flung backwards and sideways from the tyre. */
  private spawnBits(x: number, y: number, car: CarState, s: number, kind: 'gravel' | 'grass'): void {
    const back = -(0.25 + Math.random() * 0.35);
    const side = (Math.random() - 0.5) * 14;
    const ch = Math.cos(car.heading);
    const sh = Math.sin(car.heading);
    const palette = kind === 'gravel' ? GRAVEL_COLORS : GRASS_COLORS;
    const life = 0.35 + Math.random() * 0.35;
    this.push({
      kind,
      x,
      y,
      vx: car.vx * back - sh * side,
      vy: car.vy * back + ch * side,
      life,
      maxLife: life,
      size: (0.12 + Math.random() * 0.14) * s,
      grow: 0,
      color: palette[Math.floor(Math.random() * palette.length)]!,
    });
  }
}

function wheel(c: CarState, lx: number, ly: number): [number, number] {
  const ch = Math.cos(c.heading);
  const sh = Math.sin(c.heading);
  return [c.x + lx * ch - ly * sh, c.y + lx * sh + ly * ch];
}

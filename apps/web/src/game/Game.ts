import {
  buildTrack,
  carSpeed,
  DT,
  encodeInputs,
  INPUT,
  Session,
  wrapAngle,
  type CarState,
  type LapResult,
  type SessionEvent,
  type Track,
  type TrackDef,
} from '@purple-sector/sim';
import { formatDelta } from '../lib/format';
import { GameAudio } from './audio';
import { Effects } from './effects';
import { GhostPlayer, GhostRecorder } from './ghost';
import { Keyboard } from './input';
import { buildTrackGfx, drawFrame, type TrackGfx, type View } from './render';
import { buildScenery, frameMargin, type Scenery } from './scenery';
import {
  loadGhost,
  loadRecords,
  loadSettings,
  saveGhost,
  saveRecords,
  saveSettings,
  type Settings,
  type TrackRecords,
  type ViewMode,
} from './storage';

export type Phase = 'ready' | 'countdown' | 'running' | 'paused' | 'finished';

/** Outcome of one attempt (out-lap + one timed lap). */
export interface AttemptResult {
  time: number;
  valid: boolean;
  sectors: [number, number, number];
  sectorStatus: (SectorStatus | undefined)[];
  /** Versus the previous personal best (null if there was none, or the lap was invalid). */
  pbDelta: number | null;
  newPb: boolean;
  bestTime: number | null;
}
/** best = fastest ever in this sector, pb = quicker than your PB lap's sector. */
export type SectorStatus = 'best' | 'pb' | 'slower' | 'invalid';

export interface Flash {
  id: number;
  text: string;
  tone: 'best' | 'good' | 'bad';
}

export interface HudState {
  phase: Phase;
  /** Red start lights lit (0–3) during the countdown. */
  lights: number;
  showGo: boolean;
  trackName: string;
  /** 0 = out-lap. */
  lapNumber: number;
  lapTime: number | null;
  lapValid: boolean;
  lastLap: LapResult | null;
  bestLap: number | null;
  sectors: (SectorStatus | undefined)[];
  sectorTimes: (number | undefined)[];
  speedKmh: number;
  flash: Flash | null;
  offTrack: boolean;
  view: ViewMode;
  ghostOn: boolean;
  hasGhost: boolean;
  soundOn: boolean;
  result: AttemptResult | null;
  ghostLabel: string | null;
}

export const INITIAL_HUD: HudState = {
  phase: 'ready',
  lights: 0,
  showGo: false,
  trackName: '',
  lapNumber: 0,
  lapTime: null,
  lapValid: true,
  lastLap: null,
  bestLap: null,
  sectors: [],
  sectorTimes: [],
  speedKmh: 0,
  flash: null,
  offTrack: false,
  view: 'overview',
  ghostOn: true,
  hasGhost: false,
  soundOn: true,
  result: null,
  ghostLabel: null,
};

const LIGHT_STEP = 0.5;
const COUNTDOWN = LIGHT_STEP * 4;
/** Cars are drawn larger in the full-track view so they stay readable. */
const OVERVIEW_CAR_SCALE = 1.6;
/** Screen space reserved for the HUD above / below the track in the full-track view. */
const HUD_TOP = 58;
const HUD_BOTTOM = 44;

export interface Insets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}
export const DEFAULT_INSETS: Insets = { top: HUD_TOP, bottom: HUD_BOTTOM, left: 12, right: 12 };

/**
 * Owns the frame loop: real time → fixed 120 Hz sim steps → interpolated render.
 * React only receives a HUD snapshot ~30×/s; the canvas never goes through React.
 */
export class Game {
  private readonly track: Track;
  private readonly session: Session;
  private readonly gfx: TrackGfx;
  private readonly scenery: Scenery;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly kb: Keyboard;
  private readonly ro: ResizeObserver;
  private readonly records: TrackRecords;
  private readonly settings: Settings;
  private readonly fx: Effects;
  private readonly recorder = new GhostRecorder();
  private readonly audio: GameAudio;
  private ghost: GhostPlayer | null = null;
  /** Smoothed visual body lean (m) and tyre rotation (m travelled). */
  private roll = 0;
  private wheelPhase = 0;

  private prev: CarState;
  private bits = 0;
  private phase: Phase = 'ready';
  private pausedFrom: Phase = 'running';
  private countdown = 0;
  private goTimer = 0;
  private acc = 0;
  private lastFrame = 0;
  private raf = 0;
  private hudTimer = 0;

  /** Chase-camera state (updated every frame so switching views is seamless). */
  private chase = { x: 0, y: 0, angle: 0, scale: 10, look: 0 };

  private sectorStatus: (SectorStatus | undefined)[] = [];
  private sectorTimes: (number | undefined)[] = [];
  private lastLap: LapResult | null = null;
  private result: AttemptResult | null = null;
  private flash: Flash | null = null;
  private flashTimer = 0;
  private flashId = 0;

  private w = 1;
  private h = 1;
  private dpr = 1;

  /** Every tick's input since the attempt began (sent to the server for verification). */
  private attemptInputs: number[] = [];
  /** Whose ghost is loaded (null = none). Own PB ghosts are replaced automatically on improvement. */
  private ghostLabel: string | null = null;
  private ghostIsOwn = false;
  private touchBits = 0;
  private insets: Insets = DEFAULT_INSETS;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    def: TrackDef,
    private readonly onHud: (h: HudState) => void,
    /** Called when a timed lap completes: the recording to submit. */
    private readonly onAttempt?: (a: { day: string; inputs: string; lap: LapResult }) => void,
  ) {
    this.track = buildTrack(def);
    this.session = new Session(this.track);
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D is not supported in this browser');
    this.ctx = ctx;
    this.gfx = buildTrackGfx(ctx, this.track);
    this.scenery = buildScenery(this.track);
    this.records = loadRecords(def.id);
    this.settings = loadSettings();
    this.audio = new GameAudio(!this.settings.sound);
    const ghostData = loadGhost(def.id);
    if (ghostData) {
      this.ghost = new GhostPlayer(ghostData);
      this.ghostLabel = 'Your best';
      this.ghostIsOwn = true;
    }
    this.fx = new Effects(() => this.carScale());
    this.prev = { ...this.session.car };

    this.kb = new Keyboard(this.handleKey);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    document.addEventListener('visibilitychange', this.handleVisibility);
    this.resize();
    this.snapChase();
    this.emitHud();
    this.raf = requestAnimationFrame(this.frame);
  }

  // ---------- public controls (used by React buttons) ----------

  get trackRef(): Track {
    return this.track;
  }

  /** Race against someone else's lap (poses from ghostFromInputs). */
  setGhost(frames: number[], label: string): void {
    this.ghost = new GhostPlayer(frames);
    this.ghostLabel = label;
    this.ghostIsOwn = false;
    this.settings.ghost = true;
    saveSettings(this.settings);
    this.emitHud();
  }

  /** Pause if driving (e.g. when a menu opens). */
  pause(): void {
    if (this.phase === 'running' || this.phase === 'countdown') this.togglePause();
  }

  /** Bits from the on-screen touch controls (OR-ed with the keyboard). */
  setTouchInput(bits: number): void {
    this.touchBits = bits;
  }

  /** Screen space (px) the full-track view should keep clear for HUD / touch controls. */
  setInsets(insets: Insets): void {
    this.insets = insets;
  }

  setKeysEnabled(enabled: boolean): void {
    this.kb.enabled = enabled;
  }

  start(): void {
    this.audio.ensure();
    if (this.phase === 'ready') {
      this.attemptInputs = [];
      this.phase = 'countdown';
      this.countdown = COUNTDOWN;
      this.acc = 0;
      this.emitHud();
    }
  }

  /** Instant restart: back to the grid and straight into driving (timing starts at the line). */
  restart(): void {
    this.audio.ensure();
    this.session.resetCar();
    this.attemptInputs = [];
    Object.assign(this.prev, this.session.car);
    this.recorder.reset();
    this.fx.clear();
    this.sectorStatus = [];
    this.sectorTimes = [];
    this.flash = null;
    this.snapChase();
    this.phase = 'running';
    this.acc = 0;
    this.emitHud();
  }

  /** Abandon the current attempt and go back to the start screen. */
  toMenu(): void {
    this.session.resetCar();
    this.attemptInputs = [];
    Object.assign(this.prev, this.session.car);
    this.recorder.reset();
    this.fx.clear();
    this.sectorStatus = [];
    this.sectorTimes = [];
    this.flash = null;
    this.goTimer = 0;
    this.snapChase();
    this.phase = 'ready';
    this.emitHud();
  }

  togglePause(): void {
    if (this.phase === 'running' || this.phase === 'countdown') {
      this.pausedFrom = this.phase;
      this.phase = 'paused';
    } else if (this.phase === 'paused') {
      this.phase = this.pausedFrom;
    }
    this.emitHud();
  }

  toggleView(): void {
    this.settings.view = this.settings.view === 'overview' ? 'chase' : 'overview';
    saveSettings(this.settings);
    this.fx.clear(); // skid marks are positioned for the old car size
    this.snapChase();
    this.emitHud();
  }

  toggleGhost(): void {
    this.settings.ghost = !this.settings.ghost;
    saveSettings(this.settings);
    this.emitHud();
  }

  toggleSound(): void {
    this.settings.sound = !this.settings.sound;
    saveSettings(this.settings);
    this.audio.ensure();
    this.audio.setMuted(!this.settings.sound);
    this.emitHud();
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    this.audio.dispose();
    this.kb.dispose();
    this.ro.disconnect();
    document.removeEventListener('visibilitychange', this.handleVisibility);
  }

  // ---------- loop ----------

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = this.lastFrame ? Math.min(0.1, (now - this.lastFrame) / 1000) : 0;
    this.lastFrame = now;

    if (this.phase === 'countdown') {
      this.countdown -= dt;
      if (this.countdown <= 0) {
        this.phase = 'running';
        this.goTimer = 0.7;
        this.acc = 0;
      }
    }
    if (this.goTimer > 0) this.goTimer -= dt;
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) this.flash = null;
    }

    if (this.phase === 'running') {
      this.acc += dt;
      this.bits = this.kb.bits() | this.touchBits;
      const s = this.session;
      while (this.acc >= DT) {
        Object.assign(this.prev, s.car);
        this.attemptInputs.push(this.bits);
        s.step(this.bits);
        this.fx.afterStep(this.prev, s.car, this.bits, s.surface);
        for (const e of s.drainEvents()) this.handleEvent(e);
        this.acc -= DT;
        if (this.phase !== 'running') break; // the attempt just finished
        const lt = s.lapTime;
        if (lt !== null && s.tick % 4 === 0) this.recorder.record(lt, s.car.x, s.car.y, s.car.heading);
      }
    } else {
      this.bits = 0;
    }
    if (this.phase !== 'paused') this.fx.update(dt);

    const alpha = this.phase === 'running' ? this.acc / DT : 1;
    this.render(dt, alpha);

    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 1 / 30;
      this.emitHud();
    }
  };

  private render(dt: number, alpha: number): void {
    const p = this.prev;
    const c = this.session.car;
    const x = p.x + (c.x - p.x) * alpha;
    const y = p.y + (c.y - p.y) * alpha;
    const heading = p.heading + wrapAngle(c.heading - p.heading) * alpha;
    const speed = carSpeed(c);

    // Body lean from cornering load (≈5 cm per g, towards the outside of the bend)
    const latG = (speed * c.yawRate) / 9.81;
    this.roll += (-latG * 0.05 - this.roll) * (1 - Math.exp(-dt * 10));
    const vLong = c.vx * Math.cos(c.heading) + c.vy * Math.sin(c.heading);
    if (this.phase === 'running') this.wheelPhase += vLong * dt;

    // Sound
    const slip = Math.abs(-c.vx * Math.sin(c.heading) + c.vy * Math.cos(c.heading));
    this.audio.update(
      this.phase === 'running' || this.phase === 'countdown',
      speed,
      (this.bits & INPUT.THROTTLE) !== 0,
      slip,
      this.session.surface,
    );

    this.updateChase(dt, x, y, heading, speed);
    const view = this.settings.view === 'overview' ? this.overviewView() : this.chaseView();

    const lapTime = this.session.lapTime;
    const g = this.settings.ghost && this.ghost && lapTime !== null ? this.ghost.poseAt(lapTime) : null;

    drawFrame(this.ctx, this.w, this.h, this.dpr, {
      track: this.track,
      gfx: this.gfx,
      view,
      car: {
        x,
        y,
        heading,
        steer: c.steer,
        braking: (this.bits & INPUT.BRAKE) !== 0,
        roll: this.roll,
        wheelPhase: speed < 16 ? this.wheelPhase : null,
      },
      ghost: g ? { ...g, steer: 0, braking: false, roll: 0, wheelPhase: null } : null,
      fx: this.fx,
      scenery: this.scenery,
      time: performance.now() / 1000,
      carScale: this.carScale(),
      minimap: this.settings.view === 'chase',
    });
  }

  /** Whole track fitted to the screen; rotated 90° when that uses the screen better (e.g. phones). */
  private overviewView(): View {
    // Track + run-off (grandstands are placed inside this frame, see scenery.ts)
    const tb = this.track.bounds;
    const margin = frameMargin(this.track);
    const b = {
      minX: tb.minX - margin,
      minY: tb.minY - margin,
      maxX: tb.maxX + margin,
      maxY: tb.maxY + margin,
    };
    const bw = b.maxX - b.minX;
    const bh = b.maxY - b.minY;
    const ins = this.insets;
    const areaW = Math.max(100, this.w - ins.left - ins.right);
    const areaH = Math.max(100, this.h - ins.top - ins.bottom);
    const rotate = areaH > areaW !== bh > bw;
    const tw = rotate ? bh : bw;
    const th = rotate ? bw : bh;
    return {
      x: (b.minX + b.maxX) / 2,
      y: (b.minY + b.maxY) / 2,
      rotation: rotate ? Math.PI / 2 : 0,
      scale: Math.min(areaW / tw, areaH / th),
      ax: ins.left + areaW / 2,
      ay: ins.top + areaH / 2,
    };
  }

  private chaseView(): View {
    const ch = this.chase;
    return {
      x: ch.x,
      y: ch.y,
      rotation: -ch.angle - Math.PI / 2,
      scale: ch.scale,
      ax: this.w / 2,
      ay: this.h * 0.64,
    };
  }

  private updateChase(dt: number, x: number, y: number, heading: number, speed: number): void {
    const ch = this.chase;
    const k = (rate: number) => 1 - Math.exp(-dt * rate);
    ch.angle += wrapAngle(heading - ch.angle) * k(7);
    ch.look += (Math.min(speed, 80) * 0.18 - ch.look) * k(3);
    ch.x = x + Math.cos(heading) * ch.look;
    ch.y = y + Math.sin(heading) * ch.look;
    const target = this.chaseBaseScale() * (1.1 - 0.35 * Math.min(1, speed / 70));
    ch.scale += (target - ch.scale) * k(2);
  }

  // ---------- timing events ----------

  private handleEvent(e: SessionEvent): void {
    switch (e.type) {
      case 'invalidated':
        this.showFlash('TRACK LIMITS', 'bad', 2);
        break;
      case 'sector':
        this.recordSector(e.index, e.time, e.split, e.valid);
        break;
      case 'lap':
        this.recordLap(e.result);
        break;
      case 'lapStart':
        this.recorder.reset();
        break;
    }
  }

  private classify(i: 0 | 1 | 2, time: number, valid: boolean): SectorStatus {
    if (!valid) return 'invalid';
    const best = this.records.bestSectors[i];
    if (best == null || time < best) return 'best';
    const pb = this.records.pb?.sectors[i];
    if (pb != null && time <= pb) return 'pb';
    return 'slower';
  }

  private recordSector(index: number, time: number, split: number, valid: boolean): void {
    const i = index as 0 | 1 | 2;
    if (i === 0) {
      this.sectorStatus = [];
      this.sectorTimes = [];
    }
    this.sectorStatus[i] = this.classify(i, time, valid);
    this.sectorTimes[i] = time;
    if (valid) {
      const best = this.records.bestSectors[i];
      if (best == null || time < best) {
        this.records.bestSectors[i] = time;
        saveRecords(this.track.def.id, this.records);
      }
    }
    const pb = this.records.pb;
    if (valid && pb && i < 2) {
      const ref = i === 0 ? pb.sectors[0] : pb.sectors[0] + pb.sectors[1];
      const d = split - ref;
      this.showFlash(formatDelta(d), d < 0 ? 'good' : 'bad', 2);
    }
  }

  /** The timed lap is done: record it and end the attempt (results pop-up). */
  private recordLap(r: LapResult): void {
    this.lastLap = r;
    this.recordSector(2, r.sectors[2], r.time, r.valid);
    const frames = this.recorder.take();
    const pb = this.records.pb;
    const pbDelta = pb && r.valid ? r.time - pb.time : null;
    const newPb = r.valid && (!pb || r.time < pb.time);
    if (newPb) {
      this.records.pb = { time: r.time, sectors: [...r.sectors] };
      saveRecords(this.track.def.id, this.records);
      saveGhost(this.track.def.id, frames);
      // Replace the ghost only if it was our own (don't swap out a chosen rival)
      if (this.ghostIsOwn || !this.ghost) {
        this.ghost = new GhostPlayer(frames);
        this.ghostLabel = 'Your best';
        this.ghostIsOwn = true;
      }
    }
    if (r.valid) this.onAttempt?.({ day: this.track.def.id, inputs: encodeInputs(this.attemptInputs), lap: r });
    this.flash = null;
    this.result = {
      time: r.time,
      valid: r.valid,
      sectors: [...r.sectors],
      sectorStatus: [...this.sectorStatus],
      pbDelta,
      newPb,
      bestTime: this.records.pb?.time ?? null,
    };
    this.phase = 'finished';
    this.emitHud();
  }

  private showFlash(text: string, tone: Flash['tone'], seconds: number): void {
    this.flash = { id: ++this.flashId, text, tone };
    this.flashTimer = seconds;
  }

  // ---------- helpers ----------

  private handleKey = (code: string) => {
    if (code === 'Enter' || code === 'Space') {
      if (this.phase === 'ready') this.start();
      else if (this.phase === 'paused') this.togglePause();
      else if (this.phase === 'finished') this.restart();
    } else if (code === 'KeyR') {
      if (this.phase !== 'ready') this.restart();
    } else if (code === 'Escape' || code === 'KeyP') {
      this.togglePause();
    } else if (code === 'KeyC') {
      this.toggleView();
    } else if (code === 'KeyG') {
      this.toggleGhost();
    } else if (code === 'KeyM') {
      this.toggleSound();
    }
  };

  private handleVisibility = () => {
    if (document.hidden && (this.phase === 'running' || this.phase === 'countdown')) this.togglePause();
  };

  private carScale(): number {
    return this.settings.view === 'overview' ? OVERVIEW_CAR_SCALE : 1;
  }

  private chaseBaseScale(): number {
    return Math.min(this.w, this.h) / 60;
  }

  private snapChase(): void {
    const c = this.session.car;
    this.chase = { x: c.x, y: c.y, angle: c.heading, scale: this.chaseBaseScale() * 1.1, look: 0 };
  }

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = Math.max(1, rect.width);
    this.h = Math.max(1, rect.height);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
  }

  private emitHud(): void {
    const s = this.session;
    const lights =
      this.phase === 'countdown'
        ? Math.min(3, Math.floor((COUNTDOWN - this.countdown) / LIGHT_STEP) + 1)
        : 0;
    this.onHud({
      phase: this.phase,
      lights,
      showGo: this.goTimer > 0,
      trackName: this.track.def.name,
      lapNumber: s.lapStart !== null ? s.lapCount + 1 : 0,
      lapTime: s.lapTime,
      lapValid: s.lapValid,
      lastLap: this.lastLap,
      bestLap: this.records.pb?.time ?? null,
      sectors: [...this.sectorStatus],
      sectorTimes: [...this.sectorTimes],
      speedKmh: Math.round(carSpeed(s.car) * 3.6),
      flash: this.flash,
      offTrack: s.surface === 'grass',
      view: this.settings.view,
      ghostOn: this.settings.ghost,
      hasGhost: this.ghost !== null,
      soundOn: this.settings.sound,
      result: this.phase === 'finished' ? this.result : null,
      ghostLabel: this.ghostLabel,
    });
  }
}

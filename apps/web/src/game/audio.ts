/**
 * Synthesised sound — no audio files needed (and no licensing questions).
 * Engine: two detuned oscillators through a low-pass filter, pitch follows a virtual
 * 8-speed gearbox. Tyres: filtered noise for squeal (sliding) and rumble (gravel/grass).
 */

/** Upper speed (m/s) of each gear. */
const GEARS = [0, 17, 28, 38, 48, 58, 68, 78, 200];

export class GameAudio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private engineGain!: GainNode;
  private osc1!: OscillatorNode;
  private osc2!: OscillatorNode;
  private engineFilter!: BiquadFilterNode;
  private squealGain!: GainNode;
  private rumbleGain!: GainNode;
  private muted: boolean;

  constructor(muted: boolean) {
    this.muted = muted;
  }

  /** Must be called from a user gesture (key press / click) — browsers block autoplay. */
  ensure(): void {
    try {
      if (!this.ctx) this.build();
      if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      /* Web Audio unavailable — play silently */
    }
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.05);
  }

  /** Called every frame. */
  update(active: boolean, speed: number, throttle: boolean, slip: number, surface: string): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;

    let g = 1;
    while (g < GEARS.length - 1 && speed > GEARS[g]!) g++;
    const lo = GEARS[g - 1]!;
    const hi = GEARS[g]!;
    const rpm = g === 1 ? 0.25 + 0.75 * (speed / hi) : 0.45 + 0.55 * ((speed - lo) / (hi - lo));
    const freq = 48 + rpm * 150;

    this.osc1.frequency.setTargetAtTime(freq, t, 0.025);
    this.osc2.frequency.setTargetAtTime(freq * 1.502, t, 0.025);
    this.engineFilter.frequency.setTargetAtTime(throttle ? 1400 + rpm * 1600 : 700 + rpm * 500, t, 0.05);
    this.engineGain.gain.setTargetAtTime(active ? (throttle ? 0.11 : 0.06) : 0, t, 0.06);

    const squeal = active && surface === 'track' ? Math.min(1, Math.max(0, (slip - 2.2) / 5)) : 0;
    this.squealGain.gain.setTargetAtTime(squeal * 0.07, t, 0.04);
    const rough = active && surface !== 'track' ? Math.min(1, speed / 25) * (surface === 'gravel' ? 0.16 : 0.07) : 0;
    this.rumbleGain.gain.setTargetAtTime(rough, t, 0.05);
  }

  dispose(): void {
    void this.ctx?.close();
    this.ctx = null;
  }

  private build(): void {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctor();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    this.master.connect(ctx.destination);

    // Engine
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.Q.value = 4;
    this.osc1 = ctx.createOscillator();
    this.osc1.type = 'sawtooth';
    this.osc2 = ctx.createOscillator();
    this.osc2.type = 'square';
    const o2gain = ctx.createGain();
    o2gain.gain.value = 0.35;
    this.osc1.connect(this.engineFilter);
    this.osc2.connect(o2gain).connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain).connect(this.master);
    this.osc1.start();
    this.osc2.start();

    // Shared noise source for tyres
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;

    const squealFilter = ctx.createBiquadFilter();
    squealFilter.type = 'bandpass';
    squealFilter.frequency.value = 1100;
    squealFilter.Q.value = 9;
    this.squealGain = ctx.createGain();
    this.squealGain.gain.value = 0;
    noise.connect(squealFilter).connect(this.squealGain).connect(this.master);

    const rumbleFilter = ctx.createBiquadFilter();
    rumbleFilter.type = 'lowpass';
    rumbleFilter.frequency.value = 420;
    this.rumbleGain = ctx.createGain();
    this.rumbleGain.gain.value = 0;
    noise.connect(rumbleFilter).connect(this.rumbleGain).connect(this.master);
    noise.start();
  }
}

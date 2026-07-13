/**
 * Procedural sound effects via WebAudio — no audio assets to load. Every
 * sound is a short oscillator envelope. Disabled by default; enabling (a
 * user gesture on the menu) creates/resumes the AudioContext, which
 * satisfies the browser autoplay policy.
 */
const PREF_KEY = 'ttf.sound';

export class AudioBus {
  private ctx: AudioContext | null = null;
  private _enabled: boolean;

  constructor() {
    let pref = '0';
    try {
      pref = localStorage.getItem(PREF_KEY) ?? '0';
    } catch {
      /* storage unavailable → default off */
    }
    this._enabled = pref === '1';
  }

  get enabled(): boolean {
    return this._enabled;
  }

  setEnabled(on: boolean): void {
    this._enabled = on;
    try {
      localStorage.setItem(PREF_KEY, on ? '1' : '0');
    } catch {
      /* non-fatal */
    }
    if (on) this.ensure();
  }

  /** Rising click per correct keystroke — pitch climbs through the word. */
  click(step = 0): void {
    this.tone({ freq: 540 + Math.min(step, 12) * 28, dur: 0.05, type: 'triangle', gain: 0.12 });
  }

  /** Dull thud on a miss. */
  miss(): void {
    this.tone({ freq: 130, end: 78, dur: 0.12, type: 'sawtooth', gain: 0.16 });
  }

  /** Mutant killed — quick rising arpeggio. */
  kill(): void {
    const notes = [660, 880, 1175];
    notes.forEach((freq, i) => this.tone({ freq, dur: 0.07, type: 'square', gain: 0.09, delay: i * 0.045 }));
  }

  /** Mutant survived (reached the build) — falling two-voice alarm. */
  survive(): void {
    this.tone({ freq: 170, end: 52, dur: 0.42, type: 'sawtooth', gain: 0.22 });
    this.tone({ freq: 105, end: 44, dur: 0.48, type: 'square', gain: 0.12 });
  }

  private ensure(): AudioContext | null {
    if (!this._enabled) return null;
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
      } catch {
        return null;
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  private tone(opts: {
    freq: number;
    end?: number;
    dur: number;
    type: OscillatorType;
    gain: number;
    delay?: number;
  }): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const t0 = ctx.currentTime + (opts.delay ?? 0);
    osc.type = opts.type;
    osc.frequency.setValueAtTime(opts.freq, t0);
    if (opts.end !== undefined) osc.frequency.exponentialRampToValueAtTime(opts.end, t0 + opts.dur);
    gain.gain.setValueAtTime(opts.gain, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + opts.dur + 0.02);
  }
}

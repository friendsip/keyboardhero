export interface RunStats {
  wpm: number;
  accuracy: number;
  correct: number;
  missed: number;
  wildMisses: number;
  keyErrors: Record<string, number>;
  durationMs: number;
}

const ROLLING_WINDOW_MS = 10_000;
const WARMUP_MS = 2_000;

/**
 * All timing is keyed to the engine's active-time clock (accumulated fixed
 * steps), never the wall clock — pause time is excluded for free and every
 * reading is deterministic.
 */
export class StatsTracker {
  private correct = 0;
  private missed = 0;
  private wildMisses = 0;
  private readonly keyErrors: Record<string, number> = {};
  private activeMs = 0;
  private times: number[] = [];
  private head = 0;

  keystroke(correct: boolean, expected: string | null, got: string): void {
    if (correct) {
      this.correct++;
      this.times.push(this.activeMs);
      return;
    }
    this.missed++;
    if (expected === null) {
      this.wildMisses++;
      return;
    }
    const key = `${expected}→${got}`;
    this.keyErrors[key] = (this.keyErrors[key] ?? 0) + 1;
  }

  addActiveTime(dtMs: number): void {
    this.activeMs += dtMs;
  }

  accuracy(): number {
    const total = this.correct + this.missed;
    return total === 0 ? 1 : this.correct / total;
  }

  rollingWpm(): number | null {
    if (this.activeMs < WARMUP_MS) return null;
    const cutoff = this.activeMs - ROLLING_WINDOW_MS;
    while (this.head < this.times.length && (this.times[this.head] ?? Infinity) < cutoff) {
      this.head++;
    }
    if (this.head > 256 && this.head * 2 > this.times.length) {
      this.times = this.times.slice(this.head);
      this.head = 0;
    }
    const count = this.times.length - this.head;
    const windowMs = Math.min(this.activeMs, ROLLING_WINDOW_MS);
    return count / 5 / (windowMs / 60_000);
  }

  finalize(): RunStats {
    const minutes = this.activeMs / 60_000;
    return {
      wpm: minutes === 0 ? 0 : this.correct / 5 / minutes,
      accuracy: this.accuracy(),
      correct: this.correct,
      missed: this.missed,
      wildMisses: this.wildMisses,
      keyErrors: { ...this.keyErrors },
      durationMs: this.activeMs,
    };
  }
}

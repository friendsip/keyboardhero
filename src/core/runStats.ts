export interface RunTotals {
  correct: number;
  missed: number;
  activeMs: number;
}

const WARMUP_MS = 2_000;

/** Run-wide average WPM; null during warm-up (too little data to be stable). */
export function aggregateWpm(t: RunTotals): number | null {
  if (t.activeMs < WARMUP_MS) return null;
  return t.correct / 5 / (t.activeMs / 60_000);
}

/** Run-wide accuracy across every scoring keystroke. */
export function aggregateAccuracy(t: RunTotals): number {
  const total = t.correct + t.missed;
  return total === 0 ? 1 : t.correct / total;
}

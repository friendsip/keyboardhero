export function comboMultiplier(combo: number): number {
  if (combo >= 10) return 4;
  if (combo >= 6) return 3;
  if (combo >= 3) return 2;
  return 1;
}

export function wordScore(wordLength: number, comboMult: number, charsPerSec: number): number {
  const speedBonus = Math.min(Math.max(1 + (charsPerSec - 3) * 0.15, 1), 2);
  return Math.round(wordLength * 10 * comboMult * speedBonus);
}

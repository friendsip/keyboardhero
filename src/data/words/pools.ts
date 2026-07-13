import tier1 from './tier1.json';
import tier2 from './tier2.json';
import tier3 from './tier3.json';
import tier4 from './tier4.json';
import tier5 from './tier5.json';
import length2 from './length2.json';

const SINGLES = 'abcdefghijklmnopqrstuvwxyz'.split('');
const TWO = [...new Set([...tier1, ...length2].filter((w) => w.length === 2))];
const THREE = tier1.filter((w) => w.length === 3);

/**
 * Pools by word length for the level ladder. Index 0 (tier 1) is single
 * letters — the micro-mutant swarm pool; levels 1..6 use lengths
 * 2 / 3 / 4 / 5 / 6–7 / 8+.
 */
export const WORD_POOLS: string[][] = [SINGLES, TWO, THREE, tier2, tier3, tier4, tier5];

export const SWARM_TIER = 1;
export const MAX_LEVEL = 6;

/** Level N draws its main waves from WORD_POOLS[N] (1-based tier = N + 1). */
export function tierForLevel(level: number): number {
  return Math.min(Math.max(level, 1), MAX_LEVEL) + 1;
}

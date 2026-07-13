import type { Rng } from './Rng';

/**
 * Tiered word pools: tier 1 = 2–3 letters, tier 2 = 4, tier 3 = 5,
 * tier 4 = 6–7, tier 5 = 8+. Each tier is its own shuffle-bag. If a tier is
 * starved (every eligible first letter reserved), take() falls back to the
 * nearest tier — harder first — rather than stalling the spawner.
 */
export class WordBank {
  private readonly pools: string[][];
  private readonly bags: string[][];

  constructor(tiers: readonly (readonly string[])[], private readonly rng: Rng) {
    if (tiers.length === 0 || tiers.every((t) => t.length === 0)) {
      throw new Error('WordBank: empty pools');
    }
    this.pools = tiers.map((t) => t.map((w) => w.toLowerCase()));
    this.bags = this.pools.map(() => []);
    for (let i = 0; i < this.pools.length; i++) this.refill(i);
  }

  /** tier is 1-based; out-of-range tiers clamp to the nearest existing one. */
  take(tier: number, excludedFirst: ReadonlySet<string>): string | null {
    for (const i of this.tierSearchOrder(tier)) {
      const word = this.takeFromTier(i, excludedFirst);
      if (word !== null) return word;
    }
    return null;
  }

  private tierSearchOrder(tier: number): number[] {
    const t = Math.min(Math.max(tier - 1, 0), this.pools.length - 1);
    const order = [t];
    for (let d = 1; d < this.pools.length; d++) {
      if (t + d < this.pools.length) order.push(t + d);
      if (t - d >= 0) order.push(t - d);
    }
    return order.filter((i) => (this.pools[i]?.length ?? 0) > 0);
  }

  private takeFromTier(index: number, excludedFirst: ReadonlySet<string>): string | null {
    const first = this.dealFrom(index, excludedFirst);
    if (first !== null) {
      if ((this.bags[index]?.length ?? 0) === 0) this.refill(index);
      return first;
    }
    // Bag has no eligible word; reshuffle the full pool and try once more so a
    // long-lived level cannot starve on the tail of a bag.
    const bag = this.bags[index];
    const pool = this.pools[index];
    if (bag && pool && bag.length < pool.length) {
      this.refill(index);
      return this.dealFrom(index, excludedFirst);
    }
    return null;
  }

  private dealFrom(index: number, excludedFirst: ReadonlySet<string>): string | null {
    const bag = this.bags[index];
    if (!bag) return null;
    for (let i = bag.length - 1; i >= 0; i--) {
      const word = bag[i];
      if (word !== undefined && !excludedFirst.has(word[0] ?? '')) {
        bag.splice(i, 1);
        return word;
      }
    }
    return null;
  }

  private refill(index: number): void {
    const pool = this.pools[index];
    if (!pool) return;
    const bag = [...pool];
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      const a = bag[i];
      const b = bag[j];
      if (a !== undefined && b !== undefined) {
        bag[i] = b;
        bag[j] = a;
      }
    }
    this.bags[index] = bag;
  }
}

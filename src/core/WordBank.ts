import type { Rng } from './Rng';

export class WordBank {
  private bag: string[] = [];
  private readonly pool: readonly string[];

  constructor(pool: readonly string[], private readonly rng: Rng) {
    if (pool.length === 0) throw new Error('WordBank: empty pool');
    this.pool = pool.map((w) => w.toLowerCase());
    this.refill();
  }

  take(excludedFirst: ReadonlySet<string>): string | null {
    const first = this.dealFrom(excludedFirst);
    if (first !== null) {
      if (this.bag.length === 0) this.refill();
      return first;
    }
    // Bag has no eligible word; reshuffle the full pool and try once more so a
    // long-lived level cannot starve on the tail of a bag.
    if (this.bag.length < this.pool.length) {
      this.refill();
      return this.dealFrom(excludedFirst);
    }
    return null;
  }

  private dealFrom(excludedFirst: ReadonlySet<string>): string | null {
    for (let i = this.bag.length - 1; i >= 0; i--) {
      const word = this.bag[i];
      if (word !== undefined && !excludedFirst.has(word[0] ?? '')) {
        this.bag.splice(i, 1);
        return word;
      }
    }
    return null;
  }

  private refill(): void {
    this.bag = [...this.pool];
    for (let i = this.bag.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      const a = this.bag[i];
      const b = this.bag[j];
      if (a !== undefined && b !== undefined) {
        this.bag[i] = b;
        this.bag[j] = a;
      }
    }
  }
}

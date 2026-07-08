# 04 — WordBank & SpawnDirector

## WordBank

### Requirements

- Tiered built-in pools (`tier1.json` … `tier5.json`): tier 1 = 2–4
  letters, tier 2 = 4–6, tier 3 = 6–8, tier 4 = 8–11, tier 5 = 11+ /
  multi-word. All lowercase ASCII. Themed packs (e.g. `network.json`) are
  extra pools levels can reference by name; level JSON can embed inline
  custom pools.
- **Shuffle-bag selection**, not uniform random: shuffle a copy of the pool
  (with the injected `Rng`), deal from it, reshuffle when empty. Uniform
  random repeats words back-to-back often enough that players notice within
  one level.
- API: `take(poolId, tier, excludedFirstLetters: Set<string>): string | null`.

### The unique-first-letter invariant

**No two lock-eligible enemies may simultaneously have the same first
remaining-letter at progress 0.** This is what makes lock-on unambiguous.

Implementation: a **reservation set** of first letters held by live,
lock-eligible, *unlocked* enemies. `take()` deals from the bag but skips
words whose first letter is reserved (skipped words go back at the end of
the bag). Release the reservation when the enemy locks (a locked enemy
can't be re-targeted), dies, or reaches the core.

**Gotchas — all of these have bitten someone building this genre:**

1. **Small-pool deadlock.** A custom pool `["cat","car","cow"]` reserves
   `c` after one spawn; the next `take()` returns `null` forever. Runtime
   rule: on `null`, SpawnDirector re-tries next step and, after 2 s of
   failure, spawns anyway with a duplicate letter but marks the enemy
   `lockPriority = spawnOrder` (nearest-spawned-first tiebreak on lock).
   Degraded but not frozen. Editor rule: validation *warns* when a pool has
   < 8 distinct first letters and *errors* when < 4 (doc 08).
2. **Equivalent Mutants reserve too early.** A disguised equivalent mutant
   is not lock-eligible, so its letter must be reserved **at reveal time**,
   not spawn time — and reveal must re-check: if the letter got taken
   meanwhile, the mutant swaps to a fresh word (player never saw the old
   one). Reserving at spawn silently starves other spawns for the whole
   approach.
3. **Micro-mutant swarms exhaust letters.** A 12-strong swarm of 1-letter
   words needs 12 distinct letters. Cap `swarm` waves at 10 concurrent and
   give micro-mutants a dedicated single-letter pool ordered by home-row
   frequency.
4. **Case folding.** Reservation set stores lowercase; with
   `caseSensitive: true`, still reserve by lowercase (players scan shapes,
   not case — `Cat` vs `cat` live together is ambiguous to a human even if
   not to the code).
5. **Higher-order re-mutation** of an *unlocked* mutant re-rolls its word:
   release old reservation → take with current exclusions → reserve new.
   Locked mutants skip reservation entirely (doc 01).
6. **Concurrent-enemy ceiling.** The invariant caps concurrent unlocked
   enemies at 26-ish; in practice keep level design ≤ 12 concurrent. The
   editor's difficulty estimator (doc 08) flags scripts that exceed it.

### Determinism

`WordBank` takes an `Rng` (mulberry32) in its constructor. Same seed + same
level script ⇒ identical word sequence. `?seed=1234` on the URL pins it for
bug reproduction; otherwise seed from `performance.now()` **at the boundary**
(main.ts), never inside core.

```ts
// core/Rng.ts — mulberry32, 10 lines, no deps
export function mulberry32(seed: number): () => number { /* ... */ }
```

## SpawnDirector

Plays back `level.script` against the engine clock.

```ts
class SpawnDirector {
  constructor(script: LevelScript, bank: WordBank, rng: Rng);
  step(dtMs: number): SpawnRequest[];   // called from engine tick
  isExhausted(): boolean;               // script done AND all pending waves flushed
}
```

### Requirements

- Script entries are `{ at: seconds, wave: {...} }` sorted by `at`
  (validated; the editor keeps them sorted). A wave with `count: 6,
  interval: 0.8` emits 6 spawns 0.8 s apart starting at `at`. Multiple
  waves may overlap.
- Spawn positions: lanes across the top/sides in engine space. `lane:
  "spread" | "left" | "right" | "center" | number`. Jitter position with
  `rng`, never `Math.random`.
- Win condition: `isExhausted() && liveEnemies === 0 && bossDead` — the
  engine checks this in `tick`, not the scene.

### Gotchas

1. **Clock basis.** The director's clock is *accumulated step time*, not
   wall time and not Phaser's `time` parameter. It therefore pauses for
   free and stays deterministic. Do not "simplify" to
   `performance.now() - levelStart`.
2. **Catch-up bursts.** After a clamped huge delta (doc 02), the director
   must still emit at most one spawn per fixed step per wave — emitting the
   whole backlog in one step dumps 6 enemies on one frame. The fixed-step
   loop gives this for free **if** wave progress is tracked as "spawns
   emitted" vs "spawns due", not as a countdown timer.
3. **`checkpoint` entries** mark integrity refill + a script index the
   player restarts from on death (lose → offer "retry from checkpoint").
   Restarting from a checkpoint must **reset the WordBank reservation set
   and bags** — stale reservations from pre-death enemies otherwise leak
   and starve spawns. Easiest correct implementation: rebuild
   WordBank + SpawnDirector from scratch with the same seed and fast-forward
   `script` to the checkpoint index (do NOT fast-forward by replaying steps,
   which would replay word draws; jump the clock and skip earlier entries).
4. **Spawn-request vs spawn-fact.** The director *requests*; the engine
   applies the WordBank take and may defer (gotcha 1 in WordBank). Keep the
   retry queue in the engine so the director stays a pure script reader.

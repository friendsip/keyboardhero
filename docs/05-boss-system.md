# 05 — Boss System

Bosses are data: an ordered list of **phases**, each selecting a mechanic
primitive with params. `BossMachine` runs the state machine inside the
engine tick; `BossOverlayScene` renders HP bar, phase banners, and the
special input UIs.

## BossMachine

```ts
interface BossDef {
  name: string; sprite: string; hp: number;          // hp = phases are HP-gated or completion-gated
  phases: PhaseDef[];
}
type PhaseDef =
  | { mechanic: 'waves';           script: LevelScript; until: 'cleared' | { seconds: number } }
  | { mechanic: 'long-passphrase'; text: string; seconds: number; missPenaltySec: number }
  | { mechanic: 'multi-stream';    streams: number; tier: Tier; splitDepth: number; coreWord: string }
  | { mechanic: 'mutating-word';   tier: Tier; mutateEverySec: number; kills: number }
  | { mechanic: 'reversed-word';   tier: Tier; kills: number }
  | { mechanic: 'question-answer'; pairs: Array<{ q: string; answers: string[] }>; required: number }
  | { mechanic: 'timed-gauntlet';  text: string; seconds: number; minAccuracy: number };
```

Phase transition: on phase success → next phase (or boss death after the
last). On phase failure (timer expiry where defined) → integrity damage +
phase restarts (DEADLOCK, THE SURVIVOR) — *not* level failure unless integrity
hits 0.

**State-machine gotchas**

- **Field hygiene on transition.** Entering any non-`waves` phase must
  clear live regular enemies (with a scripted "purge" effect, not silent
  deletion), release all WordBank reservations, and drop any player lock
  (emit nothing — doc 03 §2). Leftover locked enemies during a passphrase
  phase double-consume keystrokes; this WILL happen if you skip the sweep.
- **Input routing is exclusive.** The engine has exactly one input mode:
  `targeting | buffer`. Passphrase/question/gauntlet phases switch to
  `buffer`; forgetting to switch back after the phase re-breaks targeting.
  Make the mode a property of the active phase, derived, not set/unset
  imperatively.
- **All phase timers tick in the engine step** (pause-safe, doc 03 §3).

## Mechanic-specific requirements & gotchas

### long-passphrase (DEADLOCK P2)

- Comparator: same rules as a word — next-expected-char, misses don't
  advance, no backspace. Miss adds `missPenaltySec` to the countdown's
  elapsed side.
- Render as a wrapping multi-line block with typed/next/remaining coloring;
  **spaces must render visibly when typed** (doc 03 §5).
- Gotcha: passphrase text goes through the same lowercase folding as words;
  author passphrases lowercase to avoid confusing the "next char" pulse
  with case differences.
- Accessibility: pull `seconds` from level JSON; never hardcode — the
  editor's boss builder exposes it as the primary difficulty dial.

### multi-stream (THE REGRESSION)

- Multiple simultaneous words — the ONE place the unique-first-letter
  invariant applies *between boss streams* too: draw stream words with
  mutual first-letter exclusion, and on head-split, draw the two child
  words excluding both remaining streams' letters.
- Lock rules are unchanged (first keystroke locks a stream). Heads *do not
  advance* toward the core; instead a shared phase timer applies pressure.
- Gotcha: killing the last head at `splitDepth` must not leave a 1-frame
  window where no stream exists and a keystroke counts as a wild miss —
  spawn the `coreWord` in the same engine step.

### mutating-word (THE POLYMORPH P1)

- Reuses the polymorph rules (mutate untyped remainder only; locked target
  mutation is unrestricted). `kills` completions advance the phase.
- Gotcha: mutation timing must reset on every correct hit, or a slow-ish
  typist gets mutated mid-word regardless of effort and reads it as unfair.
  The dial is `mutateEverySec` *of idle*, not absolute.

### reversed-word (THE POLYMORPH P2)

- Display reversed, type forward: label shows `thgie`, player types
  `eight`. Implement in **WordLabel** (render-side transform), engine
  matches normally. Do not reverse in the engine — stats and per-key
  heatmap must record real expected letters.

### question-answer (THE POLYMORPH P3)

- `answers` is an array (`["eight","8"]`). Match against each candidate's
  next-expected char; commit to the candidate set that still matches, i.e.
  keep a set of live candidates and drop those whose next char mismatches
  the keystroke — miss only when *no* candidate matches.
- Gotcha: numeric answers mean the top-row digits must be in the allowed
  character set; they already pass the §1 filter, just include them in the
  editor's allowed-char validation for this mechanic.

### timed-gauntlet (THE SURVIVOR final)

- Passphrase mechanics + `minAccuracy` gate computed over the phase only
  (separate mini StatsTracker instance, discarded after).
- Failure restarts the phase with fresh accuracy — do NOT carry the
  failed attempt's misses into the retry, and do NOT feed gauntlet misses
  into the global per-key heatmap twice (feed final successful attempt
  only, or every retry poisons the heatmap with panic typos).

## BossOverlayScene

- Launched *in parallel* with GameScene (`scene.launch`, doc 09 §2) when
  the level has a boss; renders from `snapshot().boss`.
- Phase banners ("PHASE 2 — DECRYPT") are cosmetic tweens on the scene
  clock; the engine does not wait for them. If a banner should delay the
  phase, that's a `{ mechanic: 'waves', until: { seconds: 2 } }` breather
  phase in data — keeps engine deterministic.

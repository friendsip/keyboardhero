# 03 — Typing Engine & Input Pipeline

The highest-risk subsystem. If keystroke handling is wrong, everything is
wrong, and browser keyboard input is a minefield. Read the gotchas twice.

## 1. Capturing keystrokes

**Requirement:** attach ONE `keydown` listener on `window` in `main.ts`,
route through a normalizer, and forward to whatever consumer is active
(game engine, editor, menu). Do NOT use Phaser's `addKey`/key-code API for
typing — it is built for WASD-style controls, not text.

```ts
// main.ts (boundary — the only place that touches KeyboardEvent)
window.addEventListener('keydown', (e) => {
  const k = normalizeKey(e);
  if (k === null) return;
  if (k.preventDefault) e.preventDefault();
  router.dispatch(k);           // → engine.handleKey(k.char, e.timeStamp)
});
```

### normalizeKey — the full filter list

| Condition | Action | Why |
|---|---|---|
| `e.repeat === true` | drop | OS key auto-repeat would spam misses when a key is held. **The #1 bug in amateur typing games.** |
| `e.ctrlKey \|\| e.metaKey \|\| e.altKey` | drop, do NOT preventDefault | Let browser shortcuts work. Note `Ctrl+W`/`Cmd+W` **cannot** be blocked — never require chorded characters in word pools. AltGr caveat below. |
| `e.isComposing \|\| e.key === 'Process'` | drop | IME composition (CJK, etc.) delivers synthetic keydowns; the game does not support IME input (see §7). |
| `e.key === 'Dead'` | drop | Dead keys (´ ¨ ~ on intl layouts) produce no character until the next key. Restrict pools to ASCII so players never *need* one; a stray press must not count as a miss. |
| `e.key === 'Unidentified'` | drop | Android soft keyboards & exotic layouts. |
| `e.key.length > 1` (Shift, Tab, F5, Arrow…) | drop, EXCEPT `Enter` when a boss mechanic asked for it | `e.key` is the printed character for printables; multi-char values are named keys. |
| `e.key === ' '` | keep, **preventDefault** | Space scrolls the page / re-activates the last focused button. Passphrases contain spaces. |
| `e.key === "'"` or `/` | keep, **preventDefault** | Firefox Quick Find opens on `/` and `'` and steals every subsequent keystroke. Ship without this and Firefox users report "game randomly stops responding". |
| anything else printable | keep | Use `e.key`, never `e.keyCode`/`e.code` — `e.key` respects the user's actual layout (AZERTY, Dvorak…). |

**AltGr gotcha:** on Windows intl layouts AltGr reports as
`ctrlKey && altKey`. The rule above drops it — acceptable because pools are
ASCII (no AltGr needed), but do not "fix" the modifier filter to allow
ctrl+alt combos generally.

**Case:** default matching is case-insensitive — lowercase both sides via
`char.toLowerCase()`. `caseSensitive: true` (hard-mode level flag) compares
raw. **Gotcha:** use plain `toLowerCase`, not `toLocaleLowerCase` — Turkish
locale maps `I → ı` and breaks matching for Turkish players.

**Timestamps:** never `Date.now()` — it jumps with NTP/system clock changes
and wrecks WPM. As implemented, the engine keys ALL stats timing (rolling
WPM, per-word speed bonus) to its own active-time clock (accumulated fixed
steps), so keystroke wall-clock timestamps are not used at all: pause time
is excluded by construction and every run is deterministic for the golden
test. `handleKey(char)` therefore takes no timestamp. If sub-frame keystroke
timing ever matters (it shouldn't at 60 fps), `e.timeStamp` — same clock as
`performance.now()` — is the one to thread through.

**Focus:** on `window 'blur'` and on `document visibilitychange → hidden`,
auto-pause (launch PauseScene). Otherwise enemies advance while the player
is on another window — and macOS Cmd+Tab delivers a `keyup` you never see,
which is another reason `e.repeat` filtering matters.

## 2. Lock-on and matching (TargetLock)

State: `lockedId: string | null` plus per-enemy `progress: number`
(letters consumed).

`handleKey(char, t)` resolution order:

1. **Locked:** compare `char` against `word[progress]` of the locked enemy.
   Match → `hit` (progress++, `wordComplete` if done, release lock).
   No match → `miss` with `expected` set. **Lock is never dropped by a
   miss.**
2. **Unlocked:** find lock-eligible enemies whose `word[0]` matches. The
   unique-first-letter invariant (doc 04) guarantees ≤ 1 candidate.
   Found → `lock` + immediately consume the letter as a `hit` (the locking
   keystroke counts — the original does this; requiring a second press of
   the same letter feels broken). None → `miss` with `expected: null`.
3. **Boss special modes** (passphrase / question-answer) replace this with a
   buffer comparator — doc 05.

**Lock-eligibility:** alive, on screen, not disguised (equivalent-mutant
pre-reveal), not buried (heisenbug) — *except* an already-locked heisenbug
stays typeable while buried (doc 01).

**Simultaneity gotchas (tick-order contract, enforced by a test):**

- Enemy reaches core on the same engine step the final letter arrives:
  process **input before movement** within a step. The player who typed the
  letter in time gets the kill.
- Locked enemy dies from a non-typing cause (race-condition self-detonation,
  boss phase clearing the field): release the lock and emit nothing — do
  not count the in-flight word as complete or as a combo break.
- `wordComplete.flawless` means zero misses *while this enemy was locked* —
  track a per-lock miss counter, not global.

## 3. Tick loop

```ts
private acc = 0;
tick(deltaMs: number) {
  this.acc += Math.min(deltaMs, 250);       // clamp huge deltas (tab refocus)
  while (this.acc >= STEP) {                 // STEP = 1000/60
    this.stepInput();                        // (input is applied on arrival; this drains boss timers fed by input)
    this.stepSpawns(STEP);                   // SpawnDirector
    this.stepEnemies(STEP);                  // movement, behaviors, fuses, re-mutation idle timers
    this.stepBoss(STEP);                     // BossMachine timers/phases
    this.acc -= STEP;
  }
}
```

- All timed behaviors (infinite-loop countdown, race-condition fuse,
  higher-order re-mutation idle, heisenbug surface cycle, boss timers) are
  **decremented here**. Grep
  rule: `setTimeout`/`setInterval` are forbidden in `src/core/` and
  `src/scenes/` (Phaser's `this.time` is allowed in scenes for pure
  cosmetics only).
- `handleKey` is applied immediately on arrival (not queued to the next
  step) so the visual response to a keystroke lands on the very next
  rendered frame. Stats use the real event timestamp either way.

## 4. StatsTracker

```ts
class StatsTracker {
  keystroke(correct: boolean, expected: string | null, got: string, tMs: number): void;
  addActiveTime(dtMs: number): void;   // called from tick — auto-excludes pause
  rollingWpm(nowMs: number): number;   // 10 s window
  finalize(): RunStats;                // { wpm, acc, maxCombo, keyErrors, durationMs }
}
```

**Rolling WPM:** ring buffer of correct-keystroke timestamps; on read, drop
entries older than 10 s, then `wpm = (count / 5) / (windowSec / 60)`.
Gotchas:

- **Warm-up:** with < 10 s elapsed, divide by *elapsed* time, not the window
  size, or the meter crawls up from zero and looks broken. Show `—` for the
  first 2 s.
- **Total WPM divides by active (unpaused) time** — accumulated via
  `addActiveTime` from `tick()`, which simply never runs while paused. Do
  not compute `end − start` wall time; a 5-minute pause would halve WPM.
- Division-by-zero guard when the first keystroke IS the window.

**Accuracy:** `correct / (correct + missed)`. Only keystrokes that survive
the §1 filter are counted, so a dropped Dead-key or repeat never dents
accuracy. Level with 0 keystrokes → accuracy 1.0 (grade formula must not
NaN).

**Per-key errors:** on miss with non-null `expected`, increment
`keyErrors["e→r"]`. Unlocked misses (`expected: null`) increment a separate
`wildMisses` counter — they indicate scanning failure, not finger error, so
they must not pollute the weak-keys heatmap.

## 5. Words with spaces & punctuation

- Passphrases contain spaces: space is a normal expected character
  (`word[progress] === ' '`). The WordLabel must render typed-space
  visibly (underline/box) or players think the game ate a keystroke.
- Pools policy: tiers 1–3 letters-only; tiers 4–5 may contain hyphens and
  apostrophes; passphrases may contain anything ASCII-printable. Keep `'`
  and `/` in the preventDefault list (§1) for exactly this reason.
- Reject non-ASCII in pools at **editor/import validation** time, not at
  runtime.

## 6. Snapshot (render contract)

```ts
interface EngineState {
  enemies: Array<{ id; type; x; y; word; progress; locked; revealed;
                   surfaced; timerFrac /* fuse/countdown 0..1 or null */ }>;
  integrity: number; combo: number; comboMult: number;
  boss: BossSnapshot | null;
  phase: 'running' | 'won' | 'lost';
}
```

Snapshot is rebuilt (or version-stamped) per render frame; scenes never
mutate it. Positions are engine-space (1280×720) — sprites copy directly.

## 7. Explicit non-goals

- **IME/CJK input:** not supported; composition events are dropped. Show a
  one-time notice if `navigator.language` suggests a CJK locale.
- **Backspace:** intentionally not an input. Document in the tutorial.
- **Mobile:** no on-screen keyboard support in v1; show a "keyboard
  required" screen when `matchMedia('(pointer: coarse)')` matches and no
  keydown has ever been seen.

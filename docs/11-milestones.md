# 11 — Milestones

> **Live status lives in [13-status-and-roadmap.md](13-status-and-roadmap.md)**
> (M1 is complete, including the rail-shooter pivot of doc 12). This doc
> keeps the original milestone definitions and acceptance criteria.

Each milestone ends playable/testable, with explicit acceptance criteria.
Sequencing rationale: feel first (M1), then content pipeline (M2), then the
things that make progress *persist* (M3), then the marquee features (M4–M5),
then breadth and ship (M6–M7).

## M1 — Typing core ("the fun test")

Scope: Vite + TS + Phaser skeleton; `core/` with TypingEngine, TargetLock,
WordBank (single pool), StatsTracker, Rng; input pipeline per doc 03; one
hardcoded wave of gray rectangles drifting toward a core; HUD with live
WPM/accuracy; vitest wired with the doc 10 engine tests.

Accept when:
- Keystroke → letter-color response is same-frame at 60 fps with 15 live
  enemies.
- Key repeat, modifiers, Dead keys, Firefox `'`/`/`, and space scrolling
  are all verifiably handled (manual checklist on Chrome + Firefox +
  Safari).
- Golden-run determinism test passes.
- **The team verdict is "typing at rectangles is already fun."** If not,
  stop and tune juice/latency — do not proceed on a mushy core.

## M2 — Data-driven levels & bestiary

Scope: zod schemas + validateLevel; SpawnDirector; enemy behaviors `drift`,
`beeline`, `swarm`, `disguised`, `stationary`(race condition), re-mutation
(higher-order mutant);
integrity/win/lose; ResultsScene with grading; EnemySprite/WordLabel with
BitmapText + pooling (doc 09 §3, §8); 5 handwritten Module 1 levels;
campaign JSON imported at build time.

Accept when: Module 1 is beatable start to finish; schema sweep in CI; the
WordBank invariant fuzz test passes with equivalent-mutant reveal semantics; pooling
verified (no allocation churn in a 3-minute level, via DevTools memory
timeline).

## M3 — Persistence & stats

Scope: StorageAdapter + LocalAdapter; SaveSchema + migrations scaffold
(v1, fixture test in place); backup slot + corruption recovery; write
coalescing; unlock chain + per-level bests; StatsScene (WPM/accuracy
history charts, weak-keys heatmap); settings (volume, reducedMotion,
wordScale) persisted; multi-tab guard.

Accept when: kill the tab mid-level → nothing lost but that run; corrupt
the save by hand → recovery path works and exports the corrupt blob; quota
simulation trims history; storage tests green.

## M4 — Boss system

Scope: BossMachine + primitives `waves`, `long-passphrase`, `multi-stream`,
`mutating-word`; input-mode routing; BossOverlayScene (HP bar, banners,
passphrase renderer with visible typed-spaces); DEADLOCK and THE REGRESSION
built as data; boss levels appended to Module 1/2.

Accept when: both bosses beatable and *losable* (timer-expiry damage
path exercised); phase-transition field-sweep test green; a keystroke
during a phase banner does the right thing; pause during every phase type
resumes correctly.

## M5 — Level editor

Scope: Editor + EditorUI scenes; DOM overlay + focus-war rules (doc 08);
timeline with drag/snap/undo; word-pool editor with distribution warnings;
boss builder (all shipped primitives); difficulty estimator; playtest
bridge; IndexedDB storage + drafts; import/export; Custom tab in
LevelSelect with bests.

Accept when: build a level from scratch in the editor, playtest, save,
export, delete, re-import, beat it, see a grade — without touching a JSON
file by hand; second consecutive playtest has no doubled audio (the
shutdown-hygiene canary); typing in every DOM field never leaks into the
game.

## M6 — Content & polish

Scope: remaining mutants (silent mutant, heisenbug, infinite loop);
remaining primitives (`reversed-word`, `question-answer`, `timed-gauntlet`);
THE POLYMORPH and THE SURVIVOR; full campaign (4 modules ≈ 16 levels + 4 bosses);
difficulty curve tuning via the estimator + playtesting; art pass (bitmap
font, enemy sprites, backgrounds); audio pass (audio sprite, music with
intensity layer, detune variety); juice pass (hit-stop, shake, combo
heat); practice mode biased by weak-keys heatmap.

Accept when: full campaign clearable by a ~50 WPM typist on defaults; S
ranks require ~80 WPM + 95 % (tuned, not asserted); reducedMotion honored
by every effect.

## M7 — Ship

Scope: keyboard-required guard for coarse-pointer devices; CJK-locale
notice; error boundary around boot + save-recovery UX text; Lighthouse/
bundle audit (Phaser chunking decision made, not deferred by default);
`base: './'` static deploy to GitHub Pages/Netlify/Cloudflare Pages; final
cross-browser sweep (Chrome/Firefox/Safari, incl. one Windows AZERTY or
Dvorak layout check via software layout switch); README with level-file
format docs for sharers.

Accept when: fresh browser, cold cache, public URL → playing in < 5 s on a
mid-range laptop; the doc 03 §1 filter checklist passes on all three
browsers; a shared `.ttf-level.json` round-trips between two machines.

## Deferred / non-goals (decided, not forgotten)

- Server sync, accounts, leaderboards (StorageAdapter seam exists).
- Mobile/on-screen-keyboard play.
- IME/CJK word support.
- Workshop-style in-game level browser (sharing = files, v1).
- Custom Phaser build/tree-shaking unless the M7 audit forces it.

# 08 — Level Editor

The editor edits the exact JSON of doc 06 — there is no separate editor
model. UI = Phaser canvas for the timeline/preview + **HTML DOM overlay**
for forms (text inputs, dropdowns, word-list textareas). Building form
controls in Phaser is a multi-week tarpit; don't.

## Scene architecture

- `EditorScene` (Phaser): timeline canvas — horizontal time axis, waves as
  draggable/resizable blocks per enemy-type row, checkpoint markers, boss
  block at the end. Click block → opens its inspector in the DOM panel.
- `EditorUIScene` (Phaser, parallel): thin — owns the lifecycle of the DOM
  overlay (created on `create`, removed on `shutdown`).
- DOM overlay: plain HTML `<div id="editor-panel">` appended over the
  canvas (the `dom: { createContainer: true }` game config, doc 02, gives a
  positioned container that tracks canvas scaling). Panels: level settings,
  wave inspector, word pools, boss builder, validation results.

## The focus war (the editor's #1 gotcha)

The global `keydown` handler (doc 03) and DOM text inputs both want the
keyboard. Rules:

1. The input router (doc 03 §1) drops every key when
   `document.activeElement` is an `<input>`/`<textarea>`/`select`/
   contenteditable. Check at dispatch time — do not try to toggle a flag on
   focus/blur events; you will miss a path (autofocus, tab-key focus,
   programmatic focus) and get "typing in the word list fires game sounds".
2. Also disable **Phaser's own keyboard capture**:
   `this.input.keyboard.disableGlobalCapture()` on editor entry,
   `enableGlobalCapture()` on exit. Phaser captures keys like Space/arrows
   at the document level and will `preventDefault` them *inside your text
   fields* otherwise — space bar not working in a textarea is the symptom.
3. The `'` and `/` preventDefault (Firefox quick-find, doc 03) must ALSO be
   skipped while a DOM field has focus, or users can't type apostrophes in
   word pools.

## Editor features & requirements

### Timeline

- Snap `at` to 0.5 s grid (hold Alt for free placement). Zoom levels 10 s /
  30 s / full. Keep script sorted by `at` on every mutation (schema
  requires it).
- Wave block width = `count × interval`; label shows enemy icon + count +
  tier. Drag = change `at`; handle-drag = change interval.
- **Undo/redo:** snapshot-based — push `structuredClone(level)` (level ≤
  256 KB, cloning is cheap) onto a bounded stack (50 entries) on each
  committed mutation. Snapshot on *commit* (drag end, field blur), not on
  every keystroke in a field. Do NOT attempt op-based undo; snapshot undo
  is 30 lines and correct.

### Word pool editor

- Textarea, one word per line; on blur: lowercase, trim, dedupe, validate
  against the char regex, then run the first-letter distribution check —
  show the doc 06 warnings inline ("only 5 distinct first letters — spawn
  starvation likely").

### Boss builder

- Ordered phase list; each row picks a mechanic and reveals its param form
  (passphrase textarea, stream count slider, Q&A pair table…). Reorder via
  buttons, not drag (cheap and unambiguous).
- Q&A answers input accepts comma-separated alternates → array.

### Difficulty estimator (advisory badge)

For each 10 s window of the script: `demand = Σ word chars due / 10 s → cps`.
Display peak demand as approximate WPM (`cps × 60 / 5`) so authors see
"peak ≈ 70 WPM" before playtesting. Also flag: > 12 concurrent enemies
(reservation ceiling, doc 04), infinite-loop timer < typing time of its word at
40 WPM, gauntlet accuracy gates > 0.95.

### Playtest bridge

```ts
// PlaytestBridge — no persistence involved
scene.scene.sleep('Editor'); scene.scene.sleep('EditorUI');
scene.scene.launch('Game', { level: inMemoryLevel, playtest: true,
                             returnTo: 'Editor' });
```

- Playtest runs the **validated in-memory level** (zod-parse first; refuse
  to playtest an invalid level — same gate as save).
- On exit (win/lose/Esc-hold), GameScene stops itself and wakes the editor
  scenes, passing `RunStats` back for a toast ("cleared: 61 WPM / 93 %").
- **Gotchas:** playtest runs record NO stats/bests (`playtest: true` skips
  `SaveSystem.recordRun`); sleep/wake — not stop/start — preserves editor
  state, but the DOM overlay must be hidden on sleep and reshown on wake
  (Phaser doesn't manage your DOM); GameScene must fully unsubscribe engine
  events on shutdown or the second playtest doubles all audio (doc 02).

### Saving

- Save → validate → `putLevel` (IndexedDB) with `meta.modified = Date.now()`.
- Autosave draft every 60 s to a separate id (`<id>.draft`), cleared on
  explicit save — protects against tab crashes without polluting the level
  list (list filter hides `.draft` unless recovering).
- Export button always available even when IndexedDB is unavailable
  (doc 07 §IndexedDB 6).

## Custom levels in Level Select

Custom tab lists `listLevels()` meta with grade badges from
`save.customBests`. Deleting a level asks for confirmation and mentions the
export option; bests for deleted levels are kept (harmless, tiny) so
re-importing the same level restores its history — this is why import keeps
the id when there is NO collision.

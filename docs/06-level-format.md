# 06 — Level Format & Schemas

One schema for campaign, editor, and imported levels. Defined in
`src/data/schemas.ts` with zod; every load path (`import` of campaign JSON,
IndexedDB read, file import) parses through it.

## LevelSchema

```jsonc
{
  "formatVersion": 1,                    // integer; bump on breaking change
  "id": "module2-3",                     // campaign: slug; custom: crypto.randomUUID()
  "meta": {
    "name": "Mutation Storm",
    "author": "mark",
    "module": 2,                         // 0 for custom levels
    "description": "Operator mutants loose in the core logic."
  },
  "settings": {
    "integrity": 5,
    "caseSensitive": false,
    "targetWpm": 45,                     // feeds grade formula (doc 01)
    "gradeThresholds": { "S": 0.95, "A": 0.90, "B": 0.80, "C": 0.65 }
  },
  "wordPools": {                         // optional inline pools
    "custom": ["packet", "socket", "router", "gateway"]
  },
  "rail": [
    { "kind": "travel", "duration": 4, "label": "lib/utils/" },
    { "kind": "encounter", "waves": [
      { "at": 0,  "wave": { "enemy": "typo", "count": 4, "interval": 1.2,
                             "tier": 1 } },
      { "at": 12, "wave": { "enemy": "operator", "count": 6, "interval": 0.8,
                             "tier": 2, "speedMult": 1.2 } }
    ] },
    { "kind": "travel", "duration": 5, "label": "core/engine/", "checkpoint": true },
    { "kind": "encounter", "waves": [
      { "at": 0, "wave": { "enemy": "hom", "count": 2, "interval": 3,
                            "pool": "custom" } }
    ] }
  ],
  "boss": null                           // or BossDef (doc 05)
}
```

### zod requirements (beyond field types)

- `formatVersion`: `z.literal(CURRENT_LEVEL_VERSION)` **after** migration
  (migrations run on the raw object first — doc 07).
- `rail`: non-empty; travel segments have `duration > 0`; encounter wave
  lists are `superRefine`d sorted by `at`, `at >= 0`, `count >= 1`,
  `interval > 0` when `count > 1`; concurrent-live estimates must fit the
  lane count (≤ 7, doc 12). `checkpoint` sits on travel segments (retry
  resumes the rail there).
- `wave.enemy`: `z.enum` built **from `enemies.json` keys at module load**
  so a new bestiary entry is automatically valid — do not hand-maintain a
  duplicate enum.
- `wave.pool`: if set, must exist in `wordPools` or in the built-in pool
  registry — validate with a refinement, or a typo'd pool name becomes a
  runtime spawn deadlock.
- Word pools: `z.string().regex(/^[a-z0-9' -]+$/)` per word (ASCII policy,
  doc 03 §5), min length 1, max 48; pool max 500 words; **warn** (not
  error) when `< 8` distinct first letters, **error** when `< 4`
  (deadlock risk, doc 04). zod has no warnings — return
  `{ level, warnings: string[] }` from a `validateLevel()` wrapper.
- Boss `question-answer` pairs: every answer must pass the character regex
  including digits.
- `id`: campaign slugs `[a-z0-9-]+`; imported levels get a **fresh UUID on
  import if the id already exists locally** (doc 07 — never trust an
  imported id).

### Size limits (enforced at import & editor save)

`JSON.stringify(level).length ≤ 256 KB`. Protects IndexedDB bloat and
guards against someone pasting a novel into a word pool.

## SaveSchema (localStorage)

```jsonc
{
  "formatVersion": 1,
  "campaign": {
    "unlocked": ["module1-1", "module1-2"],
    "bests": { "module1-1": { "grade": "A", "wpm": 62, "acc": 0.94,
                               "score": 18450, "ts": 1783500000000 } }
  },
  "customBests": { "<uuid>": { /* same shape */ } },
  "history": [ { "ts": 1783500000000, "levelId": "module1-1",
                 "wpm": 58, "acc": 0.91, "grade": "B" } ],   // ring: keep last 500
  "keyErrors": { "e→r": 14, "i→o": 9 },
  "wildMisses": 42,
  "settings": { "volume": 0.8, "keySound": "mech",
                "reducedMotion": false, "wordScale": 1.0 }
}
```

Requirements & gotchas:

- **`history` is capped** (last 500 runs). Unbounded, it is the one field
  that will eventually blow the localStorage quota.
- `acc` stored as 0–1 float; format to % only at render.
- Timestamps are `Date.now()` epoch ms — fine here (persistence, not
  gameplay math). The no-`Date.now()` rule applies to `core/` only.
- **Schema-parse on load, not on save.** Saving is hot-path (after every
  level); loading happens once. On parse failure → corruption recovery
  (doc 07), never a crash.

## Campaign levels are build-time imports

```ts
import module1_1 from '../data/levels/module1-1.json';
```

With `resolveJsonModule`, malformed JSON fails `tsc`. A vitest sweep
additionally zod-parses every campaign file (doc 10) so a *semantically*
invalid level (unsorted script, bad pool ref) fails CI. **Gotcha:** campaign
files still carry `formatVersion` and run through the same migration chain —
"we'll just keep the shipped files current" fails the first time an old
exported copy of a campaign level is re-imported by a player.

## File format for sharing

Export filename: `<name-slug>.ttf-level.json`. Content: the level object,
pretty-printed. No wrapper envelope, no compression — greppable, diffable,
hand-editable. Import accepts any `.json` and relies on schema validation,
not the filename.

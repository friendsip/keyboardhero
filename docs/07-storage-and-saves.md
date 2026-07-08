# 07 — Storage, Saves, Import/Export

## Split by data shape

| Data | Store | Why |
|---|---|---|
| Save file (progress, stats, settings) | `localStorage`, single key `ttf.save.v1` | Small (< 100 KB), synchronous read at boot, one blob |
| Custom levels | IndexedDB, db `ttf`, store `levels` keyed by `id` | Many, potentially large, needs enumeration |
| Nothing else | — | No cookies, no server |

## StorageAdapter interface

```ts
interface StorageAdapter {
  loadSave(): Promise<SaveFile>;                  // returns default save on absence
  writeSave(s: SaveFile): Promise<void>;
  listLevels(): Promise<LevelMeta[]>;             // meta only — do not load bodies for the list screen
  getLevel(id: string): Promise<Level | null>;
  putLevel(l: Level): Promise<void>;
  deleteLevel(id: string): Promise<void>;
}
```

Everything async even though localStorage is sync — the interface must not
leak the backend, or a future remote adapter breaks every call site.

## localStorage gotchas (all real, all frequent)

1. **Every read can return garbage.** Wrap `JSON.parse` in try/catch;
   parse-failure or zod-failure → corruption recovery (below). Users run
   extensions that mangle storage; Safari's ITP deletes storage for sites
   unvisited for 7 days.
2. **Every write can throw.** `QuotaExceededError` on quota (≈5 MB);
   older Safari private mode threw on *any* write. Catch on every
   `setItem`; on quota failure, drop the oldest half of `history` and
   retry once; if it still fails, surface a non-blocking toast — never
   crash mid-game because a save failed.
3. **Backup slot.** Keep `ttf.save.v1.bak`: before each write, move the
   current value to `.bak`, then write. Recovery order: main → parse fail →
   `.bak` → parse fail → fresh default + toast "save was corrupted, started
   fresh (backup exported)" and auto-download the corrupt blob so nothing
   is silently destroyed.
4. **Write coalescing.** Save after Results screen, settings changes, and
   editor saves — NOT per keystroke or per kill. localStorage writes are
   synchronous and can jank a frame.
5. **Multiple tabs.** Two tabs = last-write-wins clobbering. Listen for the
   `storage` event; when the save key changes from another tab, show
   "game is open in another tab — reload to sync" and block writes from the
   stale tab. Do not attempt merging.
6. **Never store class instances / Maps / Sets** — JSON round-trip only.
   `keyErrors` is a plain object keyed by `"e→r"` strings for this reason.

## IndexedDB gotchas

1. **Write a ~60-line promise wrapper** (open, get, put, delete, getAll of
   an index) instead of using raw event-callback IDB everywhere; or take
   the `idb` package — but the wrapper is small enough to own.
2. **Version upgrades:** DB version 1 creates `levels` (keyPath `id`) with
   index `byName`. All schema changes go through `onupgradeneeded` — it is
   the only place object stores may be created; feature-detecting stores at
   runtime is a classic corruption source.
3. **`blocked`/`versionchange` events:** another tab holding an old
   connection blocks upgrades forever. On `versionchange`, close the
   connection and prompt reload. Handle it or "the editor won't save" bug
   reports arrive with no repro.
4. **Store level *bodies* whole but list via meta.** `listLevels()` uses a
   cursor reading only `{id, meta, formatVersion}` fields (or keep a
   separate tiny `levelIndex` record) — loading 200 full levels to render a
   list is the difference between instant and 2 s.
5. **Safari:** modern Safari IDB is fine, but transactions auto-commit when
   the event loop is reached — never `await` a non-IDB promise inside a
   transaction and then continue using it. Structure the wrapper so each
   call is one transaction.
6. **Private browsing** (Firefox): IDB may be unavailable entirely. Detect
   at boot (`indexedDB.open` failure) → editor saves fall back to
   export-file-only mode with a visible notice.

## Migrations

```ts
// storage/migrations.ts
const saveMigrations: Record<number, (raw: any) => any> = {
  1: (v1) => ({ ...v1, formatVersion: 2, wildMisses: 0 }),   // example
};
export function migrateSave(raw: any): unknown { /* chain until CURRENT */ }
// identical machinery for levels: migrateLevel(raw)
```

Rules:

- Migrations run on the **raw parsed object before zod** (old shapes don't
  match the current schema by definition).
- Chain must be pure and total: each step handles exactly N → N+1.
- **Every historical version gets a frozen fixture** in
  `tests/fixtures/save.v1.json` etc.; `migrations.test.ts` runs each
  through the chain and zod-parses the result. A migration without a
  fixture test is a corruption bug on a timer.
- Missing `formatVersion` ⇒ treat as corrupt (recovery path), not as v1.
- Downgrade (file from a *newer* version, e.g. shared level from a newer
  build): refuse import with a clear message — never best-effort parse
  forward-versioned data.

## Import / Export (ImportExport.ts)

**Export:** `Blob` + object URL + programmatic `<a download>` click, then
`URL.revokeObjectURL` after a tick (revoking synchronously breaks the
download in Firefox). Works file for save backups too
(`ttf-save-backup.json`).

**Import:** `<input type="file">` + drag-and-drop onto the level-select
Custom tab. Pipeline: read text → `JSON.parse` (try/catch) → `migrateLevel`
→ zod → size check → **id collision check**. On collision, or whenever the
id isn't a valid UUID, assign a fresh UUID and keep `meta.name` — imported
ids are attacker/author-controlled and must never overwrite an existing
level silently. Reject files > 1 MB before parsing.

**Security note:** level content is data, never code — no `eval`, no
`innerHTML` with level-provided strings. Level `name`/`description`/words
are rendered via Phaser text objects (safe) and, in the DOM editor UI, via
`textContent` only. This matters the moment players share level files.

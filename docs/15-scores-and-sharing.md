# 15 — High Scores & Score Sharing (SCOPED — mechanics not yet built)

Design scope agreed 2026-07-13. Nothing in this doc is implemented except
the prerequisites noted at the bottom. Build order and mechanics come
later; this records the intended shape so the implementation doesn't drift.

## Design constraints already decided

- **No game saves.** The game is too fast-paced for save states — a run is
  won or lost in one sitting. Only *identity and settings* persist:
  3-letter initials (`ttf.user`), sound preference (`ttf.sound`).
- **Players are 3-letter initials** (arcade convention), already
  implemented on the menu. Initials are the identity key for all scoring —
  no accounts, no email registration, no passwords.

## Permanent high-score table ("all participants")

### Phase 1 — local table (no backend)

A localStorage list, rendered as an arcade high-score screen reachable from
the menu:

```jsonc
// key: ttf.scores.v1
{ "formatVersion": 1,
  "entries": [                       // top 50, sorted by score desc
    { "user": "MRK", "score": 18450, "level": 6, "wpm": 62,
      "acc": 0.94, "mutation": 100, "ts": 1783500000000 }
  ] }
```

- Insert after every finished run (win or lose — a heroic loss can still
  chart). Cap 50 entries; ties broken by earlier timestamp.
- "All participants" locally = everyone who plays on that machine/browser
  (family-computer semantics — matches the initials convention).
- Corruption/versioning rules follow doc 07 (parse-fail → fresh table).

### Phase 2 — global table (needs a tiny backend)

localStorage cannot be global; a shared table needs a server. Smallest
viable: one serverless endpoint pair on the existing Vercel deployment
(`POST /api/score`, `GET /api/scores?limit=100`) backed by Vercel KV.

Decisions to make at build time, recorded here so they aren't forgotten:

- **Cheat resistance:** scores are client-computed, so raw POST is fully
  forgeable. Options, cheapest first: rate-limit + sanity bounds (WPM ≤
  ~250, score ≤ theoretical max for the level); submit the run's `seed` +
  keystroke log and re-simulate in the (deterministic!) engine server-side
  — the golden-run machinery makes full verification genuinely feasible
  and cheap; sign nothing (there is no secret to hide client-side).
  Re-simulation is the recommended endgame; bounds-checking is fine for
  launch.
- **Initials collisions** are accepted (arcade rules): "MRK" is whoever
  typed MRK.
- **Profanity filter** on initials before global display (a 3-letter
  denylist is enough).
- The local table stays; global is an additional tab.

## Share my score

Both variants operate on a generated **score card** and require no backend.

### Score-card image (shared prerequisite)

Render a 1200×630 card (Open Graph size) to an offscreen canvas: wemutate
logo, initials, level, score, mutation %, WPM/accuracy, a toothy mutant,
and the URL. All assets are already in-bundle; `canvas.toBlob()` produces
the PNG.

### A) Download image

`toBlob` → object URL → `<a download="mutants-MRK-18450.png">` click →
revoke. Same mechanics as the level-export path specced in doc 07;
zero new infrastructure.

### B) Share to email address

`mailto:` link — no server, works everywhere:

```
mailto:?subject=I%20scored%2018450%20in%20Kill%20the%20Mutants&body=...score+link...
```

- Images **cannot be attached** via `mailto:`; the body carries the text
  summary + game URL, and the user attaches the downloaded card if they
  want the visual. (Attaching automatically would need a mail-sending
  backend — out of scope until there's a server for Phase 2 anyway; note
  the Web Share API `navigator.share({files})` covers "share with image"
  natively on mobile/Safari/Edge and should be offered when available.)

### UI

Results screen gains two typed commands (consistent with the game's
keyboard-first controls): `D` — download score card, `E` — email score.
Both also clickable.

## Prerequisites already in place (implemented)

- 3-letter initials with persistence + display in HUD/results.
- Deterministic engine + seed pinning (enables Phase-2 re-simulation).
- Results screen with all stats a score card needs.

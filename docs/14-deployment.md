# 14 — Deployment: Hosting on a Webserver

The game is a **fully static site**. `npm run build` produces `dist/`:
`index.html` plus one hashed JS bundle (~1.5 MB, ~350 KB gzipped — mostly
Phaser). There is no backend, no database, no API calls, and no external
requests at runtime (fonts are generated in-canvas, saves are
localStorage/IndexedDB in the player's browser). Any host that can serve
files can serve the game.

```bash
npm run build        # → dist/
npm run preview      # serve dist/ locally to sanity-check the build
```

`vite.config.ts` sets `base: './'` (relative asset URLs), so the same build
works at a domain root, on a subdomain, or in any subdirectory — no
rebuild needed per location.

## Option A — Subdirectory of an existing website (simplest) ← CHOSEN

*Verified 2026-07-07: the build was served from a local `/typing/` path
prefix and played end-to-end with a clean console.*

`scripts/deploy.sh` wraps the whole thing (build + rsync):

```bash
./scripts/deploy.sh user@server:/var/www/yoursite/typing/
# or: export DEPLOY_DEST=user@server:/var/www/yoursite/typing/ && ./scripts/deploy.sh
```

Which is equivalent to:

```bash
npm run build
rsync -av --delete dist/ user@server:/var/www/yoursite/typing/
# → https://yoursite.com/typing/
```

That's the entire deployment. Notes:

- **No rewrite rules needed.** The game is a single page with no
  client-side routing — a plain directory index is enough.
- The trailing slash matters when linking: link to `/typing/` (or serve a
  redirect from `/typing`), otherwise relative asset URLs resolve wrong.

### Nginx block (with the two cache rules that matter)

```nginx
location /typing/ {
    # hashed bundle: cache forever
    location ~* /typing/assets/.*\.(js|css|png|webp|ogg|mp3)$ {
        add_header Cache-Control "public, max-age=31536000, immutable";
    }
    # index.html: never cache, so new deploys are picked up immediately
    location = /typing/index.html {
        add_header Cache-Control "no-cache";
    }
    gzip on;
    gzip_types application/javascript text/css;
}
```

Why: Vite content-hashes `assets/*` filenames, so they can be cached
immutably; `index.html` is the pointer to the current hash and must not be
cached. Get these backwards and players see stale builds (or re-download
1.5 MB every visit). If the server supports brotli, enable it — the bundle
drops below 300 KB.

### Apache

No config strictly required — drop `dist/` contents into the folder. For
the cache headers, an `.htaccess`:

```apache
<FilesMatch "\.(js|css|png|webp|ogg|mp3)$">
  Header set Cache-Control "public, max-age=31536000, immutable"
</FilesMatch>
<Files "index.html">
  Header set Cache-Control "no-cache"
</Files>
```

## Option B — Static hosting platforms (zero server admin)

| Platform | Setup |
|---|---|
| **Vercel** ← LIVE | Deployed 2026-07-08: project `keyboardhero` under the `friendsips-projects` scope, production alias **https://keyboardhero.vercel.app**. Redeploy with `vercel --prod --yes --scope friendsips-projects` from the repo root (CLI already authenticated), or connect the GitHub repo in the Vercel dashboard for auto-deploy on push. Build runs `npm run build` (tsc + vite), output `dist/`, auto-detected. |
| **Cloudflare Pages / Netlify** | Connect the GitHub repo; build command `npm run build`, output directory `dist`. Auto-deploys on push; both apply sane caching + brotli automatically. |
| **GitHub Pages** | Workflow below. Serves at `https://<user>.github.io/<repo>/` — works because of `base: './'`. |

```yaml
# .github/workflows/deploy.yml
name: Deploy
on: { push: { branches: [main] } }
permissions: { contents: read, pages: write, id-token: write }
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run lint && npm test && npm run build   # CI gate + build in one job
      - uses: actions/upload-pages-artifact@v3
        with: { path: dist }
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment: { name: github-pages }
    steps:
      - uses: actions/deploy-pages@v4
```

## Option C — Embedding in a page of your website (iframe)

To put the game *inside* an existing page rather than on its own URL:

```html
<iframe
  src="/typing/"
  title="Typing to Freedom — Kill the Mutants"
  style="width: 100%; aspect-ratio: 16 / 9; border: 0; background: #010409;"
  allow="fullscreen"
></iframe>
```

**The keyboard-focus gotcha (this one bites):** a keyboard game inside an
iframe receives no keystrokes until the iframe has focus, and the player
has no visual cue for that. Mitigations, pick at least one:

- Overlay a "Click to play" cover on the parent page that calls
  `iframe.focus()` (or `iframe.contentWindow.focus()`, same-origin) on
  click, then hides itself.
- Prefer a dedicated page (Option A) and link to it — the game then owns
  the whole tab's keyboard, which is also better for `'`/`/`/space
  interception (doc 03).
- Page scrolling: the game `preventDefault`s space *inside its own
  document*, but if focus escapes the iframe, space scrolls the parent
  page mid-game. Another reason the dedicated page is the recommended
  integration.

## Things that carry over from the docs

- **Saves are per-origin.** localStorage/IndexedDB are scoped to the
  origin (scheme + domain + port), *not* the path — moving the game from
  `/typing/` to `/play/` on the same domain keeps player saves; moving it
  to a new domain silently loses them. The M3 save export/import (doc 07)
  is the migration path; until M3 exists there is nothing to lose.
- **HTTPS**: use it. Some browser features degrade on insecure origins,
  and mixed-content rules will bite the parent site in the iframe case.
- **No special headers required.** The game makes zero cross-origin
  requests, so it works under a strict `Content-Security-Policy` such as
  `default-src 'self'` — worth setting if the parent site has CSP anyway.
- **MIME types:** the only requirement is `.js` served as
  `text/javascript` (module scripts hard-fail otherwise); every mainstream
  server default does this.
- **Smoke test after deploy:** load the URL, check DevTools console is
  clean, type at the first ambush, and hit `?seed=1234` to compare against
  a known-good run.

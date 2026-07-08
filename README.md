# Typing to Freedom — Kill the Mutants

A web-based typing action game inspired by Sega's *The Typing of the Dead*,
themed on mutation testing: an on-rails first-person ride through an
infested codebase — type the words on incoming mutants to kill them before
they break the build, and reach the release gate to ship.

Built with Phaser 3 + TypeScript + Vite. Fully static, local-only saves,
no backend.

## Run it

```bash
npm install
npm run dev        # play at http://localhost:5173  (?seed=1234 pins a run)
```

## Develop

```bash
npm test           # vitest — engine unit tests + golden determinism run
npm run lint       # eslint, incl. the src/core framework-free boundary
npm run build      # tsc --noEmit + vite build → dist/
npm run preview    # serve the production build locally
```

## Documentation

Everything lives in [`docs/`](docs/README.md):

- **[Status & roadmap](docs/13-status-and-roadmap.md)** — what's built,
  what's next (start here).
- [Game design](docs/01-game-design.md) · [Architecture](docs/02-architecture.md)
  · [Typing engine](docs/03-typing-engine.md) · [Rail & camera](docs/12-rail-and-camera.md)
- **[Deployment](docs/14-deployment.md)** — hosting on a webserver or
  embedding in an existing website.

`PLAN.md` is the original one-page design summary.

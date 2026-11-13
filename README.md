# Garden Designer

A browser app to design our garden: draw the plot to scale, lay out hardscape and beds, place plants
from a built-in library, see sun and shade, and plan the vegetable garden. English and Dutch.
Everything is stored locally in the browser; nothing is sent to a server.

- **Live app:** https://xaveervanderlaan.github.io/garden.designer/
- **What we're building:** [SPEC.md](SPEC.md)
- **How and in what order:** [PLAN.md](PLAN.md) (milestones with checklists)

## Development

Requirements: Node.js 24 (see `.nvmrc`; with nvm: `nvm use`).

```bash
npm install          # install dependencies
npm run dev          # start the dev server → http://localhost:5173/garden.designer/
```

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Type-check and build the production site into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | oxlint (incl. the no-hard-coded-text rule) + Prettier check |
| `npm run format` | Format all files with Prettier |
| `npm run typecheck` | TypeScript type check |
| `npm test` | Unit and component tests (Vitest) |
| `npm run e2e` | End-to-end tests (Playwright, against the production build) |

First-time e2e setup: `npx playwright install chromium`. On Arch Linux (WSL) Chromium also needs
these system packages:

```bash
sudo pacman -S --needed nss alsa-lib at-spi2-core mesa libxkbcommon \
  libx11 libxext libxfixes libxrandr libxcomposite libxdamage ttf-dejavu
```

## Conventions

- **All UI text is translated.** Text lives in `src/i18n/locales/en.json` and `nl.json` (same keys in
  both, checked by a test) and is used via `t('...')`. A lint rule rejects hard-coded text in JSX.
- **Units are metres** everywhere in the data model.
- **Deploys:** every push to `main` runs CI (lint, typecheck, unit tests, build, e2e) and, when it
  passes, deploys to GitHub Pages.

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project documents — read these first

- **SPEC.md** — what we're building (requirements, decisions, decision log). Items marked *(proposed)* are not yet confirmed by the user.
- **PLAN.md** — how and in what order: milestones M0–M18 with checklists, architecture decisions (§2.3) and "as built" notes (§2.1). Follow §2.3 when implementing new milestones.

Workflow agreed with the user: work through PLAN.md milestone by milestone, commit directly on `main` at the end of a milestone, push (CI deploys), tick the PLAN.md checkboxes, then **stop for the user to try the app** before starting the next milestone. If a decision changes, update SPEC.md/PLAN.md too.

## Commands

Node 24 comes from nvm, which non-interactive shells don't load: prefix commands with `. ~/.nvm/nvm.sh &&`.

```bash
npm run dev          # dev server → http://localhost:5173/garden.designer/
npm run build        # tsc -b && vite build
npm run lint         # oxlint --deny-warnings && prettier --check .
npm run format       # prettier --write .
npm run typecheck    # tsc -b
npm test             # vitest run (unit + component, jsdom)
npm run e2e          # playwright test

npx vitest run src/routing.test.ts          # one test file
npx vitest run -t "switches to Dutch"       # tests matching a name
npx playwright test tests/e2e/smoke.spec.ts -g "Dutch browser"
```

- Playwright runs against the **production build**: its `webServer` runs `npm run build && npm run preview` on port 4173 under `/garden.designer/` (reuses a running server locally).
- This machine is Arch Linux on WSL; Playwright's `install-deps` doesn't support it. The Chromium system packages are listed in README.md (pacman).
- Definition of done for a milestone: lint, typecheck, test, build and e2e all pass; every UI string exists in EN and NL; no console errors (e2e tests collect them).
- Add dependencies with a supply-chain cool-down: `npm install --before=<date at least 2 weeks ago> <pkg>`.

## Architecture (current state)

- **Stack:** Vite 8, React 19, TypeScript 7 (native compiler: `tsc -b`, strict + `noUncheckedIndexedAccess`), Vitest 5, Playwright, i18next. Plain CSS Modules; design tokens are CSS custom properties in `src/styles/global.css`.
- **Routing** (`src/routing.ts`): a tiny hash router, chosen so GitHub Pages needs no 404 fallback. `useRoute()` subscribes to `hashchange` via `useSyncExternalStore`; `parseHash` maps `#/` → project list and `#/p/<id>` → editor (anything else → not found); build links with `hrefFor(...)`, never by hand. `App.tsx` switches on the route.
- **i18n** (`src/i18n/`): initialised by a side-effect import in `main.tsx`. Detection order is a saved choice in localStorage (`garden-designer.language`), then the browser language; `nl-*` maps to `nl`. On language change it updates `<html lang>` and `document.title`. Keys are type-checked against `locales/en.json` (`i18next.d.ts`). `locales.test.ts` enforces identical keys and `{{placeholders}}` in `en.json` and `nl.json`. Language names are endonyms in both files.
- **No hard-coded UI text:** the local oxlint plugin `scripts/oxlint-plugin-i18n.js` (rule `garden-i18n/no-literal-jsx-text`) flags letters in JSX text, static strings in JSX children, and user-facing attributes (`title`, `alt`, `placeholder`, `aria-label`, …). It is off for tests. Don't switch back to `eslint-plugin-i18next`: under oxlint it silently does nothing.
- **Tests:** `src/test/setup.ts` resets localStorage, the URL hash and the language (`en`) before each test. Vitest only picks up `src/**/*.test.{ts,tsx}`; e2e specs live in `tests/e2e/`.
- **Deploy:** `.github/workflows/ci.yml` runs verify (lint/typecheck/unit/build) and e2e on every push; on `main` a deploy job publishes `dist/` to GitHub Pages (https://xaveervanderlaan.github.io/garden.designer/). Vite `base` is `/garden.designer/`, so runtime asset URLs must use `import.meta.env.BASE_URL`, not `/`.

## Constraints from the spec

- Privacy and offline: no backend, accounts, analytics or external API/CDN calls. Bundle everything locally (e.g. the pdf.js worker later). User data stays in the browser (IndexedDB) and moves between devices only via exported `.garden.json` files.
- 2D top-down plan only; metres everywhere in the data model; NL uses a decimal comma, so number inputs must accept both `12,5` and `12.5`.
- Formatting: Prettier with no semicolons, single quotes, width 100; Markdown files are excluded from Prettier.

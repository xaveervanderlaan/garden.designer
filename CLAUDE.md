# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project documents — read these first

The spec and plan are **private**: `docs/` is a separate git repo (remote `garden.designer-docs`, private on GitHub) that this public repo ignores. Never copy them into the public repo or quote them in public commit messages. Commit doc changes in the docs repo itself (`git -C docs add … && git -C docs commit … && git -C docs push`).

- **docs/SPEC.md** — what we're building (requirements, decisions, decision log). Items marked *(proposed)* are not yet confirmed by the user.
- **docs/PLAN.md** — how and in what order: milestones M0–M18 with checklists, architecture decisions (§2.3) and "as built" notes (§2.1). Follow §2.3 when implementing new milestones.

Workflow agreed with the user: work through PLAN.md milestone by milestone. At the end of a milestone, commit directly on `main` and push (CI deploys); tick the PLAN.md checkboxes and commit and push the docs repo; then **stop for the user to try the app** before starting the next milestone. If a decision changes, update SPEC.md/PLAN.md too.

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
npm run plants:review  # plant data review tables → docs/plant-review/ (private docs repo)

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
- **Data model** (`src/model/`): the zod schemas in `schema.ts` are the single source of truth; TS types are inferred from them. Changing stored data shape means bumping `SCHEMA_VERSION` and adding a step to `MIGRATIONS` in `migrations.ts` (`MIGRATIONS[n]` upgrades n → n+1). Units are metres; timestamps are epoch ms. Version 2 (M4) gave the background (site plan) its pixel size and calibration; its visibility/lock is the "background" layer. Version 3 (M5): plant colours come from a fixed palette (`PLANT_COLORS`, with flower/foliage/autumn subsets; hex values in `styles/plantColors.ts`) and `flowerColors` is a list (the first one is drawn).
- **Persistence** (`src/persistence/`): Dexie/IndexedDB with tables `projects` and `assets` (binary files as `ArrayBuffer`, kept out of the project record). Always read projects through `loadProject()`, which migrates and validates. `.garden.json` export/import lives in `gardenFile.ts`: an import always creates a new project (new project and asset ids), and failures surface as `ImportError` codes that map to i18n messages. The project list reads via `useLiveQuery`, so it updates by itself after writes. Assets no longer referenced (a replaced or removed site plan) are kept while the design is open, so undo can bring them back; `pruneUnusedAssets` deletes them when a design is opened, and exports only include assets in use (`assetIdsInUse`).
- **Plant library:**
  - **Built-in plants** are JSON in `src/data/plants/<batch>.json`, merged by `index.ts` (`BUILT_IN_PLANTS`, `builtInPlant(id)`). The JSON is the source of truth, validated by `plants.test.ts` (schema, ranges, consistency), not at runtime. Ids are slugs of the Latin name, plus a suffix for a variant (`acer-campestre-hedge`). `verified: false` shows an "Unverified" badge; after the user spot-checks the tables from `npm run plants:review`, apply their corrections and set `verified: true`.
  - **Custom plants** are in `project.customPlants` with ids `custom-<uuid>`. `findPlant` looks there first, then in the built-ins; always display names through `plantName` (falls back to the other language, then Latin). Ops are in `model/plants.ts`; deleting a custom plant also removes its plantings (one undo step). `soilSuitability` is the soil rule for both the detail card and (M6) the warnings.
  - **UI** (`src/features/library/`): `LibraryPanel` (search, category tabs, filters; list ↔ `PlantDetail`), `PlantFormDialog` (custom plants), commands in `actions.ts`. Library view state is in `libraryStore`, not in `uiStore`. Search/filter logic is pure (`search.ts`: accent-insensitive, every word must occur in a NL/EN/Latin name); the form's draft ↔ plant conversion is in `plantForm.ts`.
  - **Symbols:** `styles/plantSymbols.ts` gives each category a symbol as SVG paths in a unit circle (radius = half the spread). The library draws them as SVG; the plan will draw them as Konva paths (M6). Months display through `i18n/months.ts` (`formatMonths` → "Jun–Aug"; runs continue over the turn of the year).
- **Design state** (`src/store/projectStore.ts`): a zustand store holding the open project plus its undo history (`past`/`future`). Every edit goes through `update(change, { history?, coalesce? })`. It bumps `updatedAt`, records an undo step, and autosaves after `AUTOSAVE_DELAY_MS` (debounced).
  - Updates sharing a `coalesce` key within 1 s merge into one undo step: text fields, nudges.
  - `history: false` keeps view-ish changes (layer show/lock) out of undo, and undo keeps the current layer state.
  - Commit continuous gestures (drags, transforms) once, on release.
  - `open`/`close` flush pending saves and use a generation counter, so overlapping calls (React StrictMode's double effects) can't clobber each other.
- **Editor** (`src/features/editor/`):
  - **View state** (viewport, selection, tool, cursor, help) is in `src/store/uiStore.ts` and never in the project store.
  - **Commands** (`actions.ts` → `editorActions`) are shared by the toolbar, panels and shortcuts. They read stores via `getState()` and prune the selection to editable items after undo/delete/locking.
  - **Shortcuts:** `shortcuts.ts` `SHORTCUTS` is the single source for key handling and the help dialog. Shortcuts are ignored while typing in form fields.
  - **Canvas:** the Konva canvas (`canvas/GardenCanvas.tsx`) is lazy-loaded. Its world group is transformed by the viewport (`screen = world × scale + offset`; metres in, pixels out).
    - Each item is a group at (0, 0). A drag or Transformer rotate/resize is baked into the item's coordinates on release via the pure ops in `src/model/edit.ts`, then the group is reset.
    - Copy Konva's `getTransform().getMatrix()` before resetting a node: it is reused and mutated in place.
    - Use `strokeScaleEnabled={false}` for pixel-width strokes.
    - Closed shapes that should only be clickable on their line need `fillEnabled={false}`: Konva hits the inside of a closed line even without a fill.
    - Draggable handles must have stable keys and props that don't change during their own drag (render them from committed data, show drafts elsewhere). A key change remounts the node and silently ends the drag.
    - Screen-space overlays (labels, handles, drawing preview) live in a separate layer and convert with `worldToScreen`.
  - **Plot:** the plot is selectable as `PLOT_ID` and belongs to the "existing" layer. Its operations are in `src/model/plot.ts`; corners are labelled A, B, C, …
  - **Drawing tool** (`tool: 'draw-plot'`, `uiStore.drawing`): commands are in `editorActions` (`addDrawingPoint`, `addDrawingSegment`, `finishDrawing`, …). `DrawingPanel` sits below the plan and keeps the focus in its length field. Snapping (`src/geometry/snap.ts`, targets from `canvas/snapTargets.ts`) works in screen-pixel tolerances; Alt disables it. Grid snapping is a toggle (`uiStore.snapToGrid`, toolbar/`G`): off when a design with a visible site plan opens and after importing one, so traced corners land where you click.
  - **Site plan** (`project.background`, model ops in `src/model/background.ts`, maths in `src/geometry/calibration.ts`): selectable as `BACKGROUND_ID`, always on its own; shown/locked via the "background" layer. Pixels map to metres as `offset + R(rotationDeg)·(pixel × metresPerPixel)`; stored rotations are clockwise on screen (like Konva), the panel shows them map-style (anticlockwise positive). It's drawn by `canvas/SitePlan.tsx` in its own Konva layer (dragged and rotated with a Transformer, never resized).
    - **Import** (`siteplan/SitePlanImport.tsx`): owns the hidden file input; `editorActions.importSitePlan()` opens it via `siteplan/picker.ts` (must run inside the click handler). Images are stored as they are; a PDF page is rendered to PNG by `siteplan/pdf.ts` (lazy-loaded pdf.js, page chooser for multi-page PDFs, size capped by `pdfRenderScale`). pdf.js's worker is bundled via `?url`; its fonts, wasm decoders and ICC profiles are served from `<base>pdfjs/` by `scripts/vite-plugin-pdfjs-assets.ts` (dev and build), never from a CDN.
    - **Calibration** (`tool: 'calibrate'`, `uiStore.calibration`): two clicks (world points, not snapped) and a distance in `CalibrationPanel`; `applyCalibration` converts them to image pixels and keeps the line's midpoint in place. The line is stored in image pixels, so it follows the image.
  - **Zoom to fit** (`zoomTo` in actions): records `uiStore.fit`. While the viewport is still the fitted one, `GardenCanvas` re-fits when the plan area changes size (a panel below it opening/closing, a window resize), measuring the container in a layout effect. A click on the plan, pan or zoom ends that. `zoomToFit` uses the site plan's bounds only when the design has nothing else.
  - **Pure maths** is in `src/geometry/` (viewport, grid, bounds, transform, polygon, snap, calibration). Angles are map-style (0° right, 90° up) although y points down. Number display and parsing go through `src/i18n/units.ts` (decimal comma in NL, NBSP before units).
- **Tests:**
  - **Setup:** `src/test/setup.ts` loads `fake-indexeddb/auto` first, then resets IndexedDB, localStorage, the URL hash and the language (`en`) before each test. `src/test/fixtures.ts` has a sample project/asset/plant.
  - **Fake timers:** fake only `setTimeout`/`clearTimeout`/`Date`, never `setImmediate`: fake-indexeddb runs on it.
  - **Canvas in jsdom:** jsdom has no canvas, so component tests that render the editor `vi.mock` the `GardenCanvas` module. The canvas is covered by Playwright.
  - **Locations:** Vitest only picks up `src/**/*.test.{ts,tsx}`. E2E specs live in `tests/e2e/`; each test gets a fresh browser context, so a fresh IndexedDB.
  - **e2e fixture:** the editor e2e tests import `tests/e2e/fixtures/sample.garden.json` and compute screen positions from the zoom-to-fit maths (padding 48 px), using the `plan-area` element's box *after* any panel below the plan has opened (a fitted view re-fits then). Text with units contains NBSP, so regexes need `\s`.
  - **Site plan e2e:** `siteplan.spec.ts` draws its test PNG in the page and builds a tiny PDF in code (no binary fixtures), reads the saved design straight from IndexedDB to map image pixels to the screen, and checks that importing makes no requests outside the app.
  - **Konva hit map:** it refreshes on the next animation frame, so a click immediately after a state change can miss. Retry with `expect.poll`.
- **Deploy:** `.github/workflows/ci.yml` runs verify (lint/typecheck/unit/build) and e2e on every push; on `main` a deploy job publishes `dist/` to GitHub Pages (https://xaveervanderlaan.github.io/garden.designer/). Vite `base` is `/garden.designer/`, so runtime asset URLs must use `import.meta.env.BASE_URL`, not `/`.

## Constraints from the spec

- Privacy and offline: no backend, accounts, analytics or external API/CDN calls. Bundle everything locally (as with pdf.js and its assets). User data stays in the browser (IndexedDB) and moves between devices only via exported `.garden.json` files.
- 2D top-down plan only; metres everywhere in the data model; NL uses a decimal comma, so number inputs must accept both `12,5` and `12.5`.
- Formatting: Prettier with no semicolons, single quotes, width 100; Markdown files are excluded from Prettier.

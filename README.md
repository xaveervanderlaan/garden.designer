# Garden Designer

A browser app to design our garden: draw the plot to scale, lay out hardscape and beds, place plants
from a built-in library, see sun and shade, and plan the vegetable garden. English and Dutch.
Everything is stored locally in the browser; nothing is sent to a server.

- **Live app:** https://xaveervanderlaan.github.io/garden.designer/
- The specification and implementation plan are kept in a separate private repository.

## Using the app

Garden Designer is a 2D top-down planner for a garden: you trace your plot, draw beds, place plants from
a built-in library (or your own), and check the result for overlaps, soil fit and the seasons. Everything
runs in your browser: there is no account and no server, and nothing leaves your device. Once installed
it works offline. Press **?** (or the keyboard button in the toolbar) for all keyboard shortcuts.

### Create a design

On the start page choose **New design**, type a name and press **Create**. Designs are listed with
**Rename**, **Duplicate**, **Export** and **Delete**. The design is saved automatically; the toolbar shows
the save status. Undo and redo cover every edit.

### Import and calibrate the site plan

Use **Import site plan** and pick a PDF, PNG or JPG (a cadastral map, a drawing or an aerial photo). For a
PDF with several pages you choose the page. Then **Calibrate scale**: click both ends of a distance you
know, type the real distance and press Enter. Drag the image (arrow keys for small steps) and turn it
with the round handle to align it, then tick **Lock in place** so it doesn't move while you trace.

### Trace the plot

Choose **Draw plot outline** and click the corners of the plot over the site plan. You can also type
lengths in the panel below the plan. Drag corners afterwards to adjust them. Snapping to the grid and to
existing corners helps; hold Alt to turn snapping off for one click.

### Beds

**Draw ornamental bed** and **Draw vegetable bed** work like the plot outline: click corners, or type
lengths. Moving a bed takes its plants along.

### Plants

Open the library on the left, search or filter it, and open a plant for its details. Then:

- **drag** it onto the plan,
- **Place** it to stamp it as often as you like (Esc stops),
- **Fill bed** to fill a bed in a staggered pattern with the spacing you choose,
- **Plant row** to plant along a line (hedges, vegetable rows).

Missing a plant? Add your own custom plant in the library.

### Structures, surfaces, boundaries and extras

The toolbar has four menus: **Structures** (`S`: house, shed, greenhouse, pergola, carport, raised bed),
**Surfaces** (`T`: terrace, path, lawn, gravel, pond, …), **Boundaries** (`F`: fence, wall, hedge, gate)
and **Water & extras** (`W`: furniture, lighting, compost, rain barrel, …). Pick a kind, then click
the plan to draw it (or **Place at** its default size). In Properties, mark it **Existing** or new, set
the height, and choose a material (surfaces) or a variant (symbols); a hedge is linked to a hedging
plant. For surfaces Properties shows the gross and the net area (minus what lies on top of it).

### Measure, areas, legend and layers

**Measure** (`M`) gives the running length of a line you click; **Keep as dimension** leaves it on the
plan. The **Areas** panel totals paved, green, water, beds and buildings inside the plot, and the
**Legend** lists the styles in use. **Area labels** in **Layers** prints names and areas on the plan.
Every layer (site plan, existing situation, hardscape, beds & plants, vegetables, shadows, measurements,
labels) can be shown or locked.

### Sun and shade

Set the latitude, longitude and north angle in the design settings (gear); the default is the middle of
the Netherlands. The north arrow on the plan turns by dragging or with the arrow keys. **Sun** in the view
bar shows shadows at a date and time: pick a date or 21 Mar/Jun/Sep/Dec, move the time slider or **Play
the day**. The **Sun hours** panel computes how many hours of direct sun each spot gets (one day or the
growing season, **Compute**, then **Recompute** when the design changed) and colours the plan as full sun,
part shade or shade; the limits are in the design settings. A plant in a spot that does not suit it gets
a sun warning (a notice when it is one step off, a warning when it is two).

### Vegetable rows and the calendar

Vegetable and raised beds have a **Row direction** (degrees, or turn it 90°). **Fill bed** plants a
crop in rows with the row and in-row spacing of that crop; each fill continues after the existing rows.
The **Vegetable calendar** (view bar, or the button by the row direction) shows per month what to sow
indoors, sow outdoors, plant out and harvest, for the whole design or one bed.

### Warnings and the planting list

The **Warnings** panel lists plants that overlap too much, stand outside the plot, suit the soil or the
sun badly, or grow over a house, shed, greenhouse, carport, terrace, path, driveway, wall, fence or gate
(red badge, or an amber ring for a notice); clicking one selects the plant. Climbers may grow against
structures, and beds, lawns, ponds, hedges and pergolas never count. The limit for overlaps is the
**Overlap warning (%)** in the design settings, and everything is checked at the size in the viewed year.
The **Planting list** counts plants per species, for the whole design or per bed, which is your
shopping list.

### Growth, seasons and the bloom chart

The view bar above the plan has a **Year** slider (plants at their size after N years, or **Fully grown**)
and a **Month** control (in flower, in leaf, in autumn colour or bare). **Bloom chart** shows which plants
flower in which month, for the whole design or one bed, and can show a month on the plan.

### Export an image or PDF

**Export image or PDF** in the toolbar makes a **PDF for printing** (choose paper, orientation and
scale; you are warned when the plan does not fit, and a scale is suggested) or a **PNG image** (whole
plan or current view, up to a size). Page 1 of the PDF is the plan with a scale bar and north arrow;
page 2 has the legend and the planting list.

### Backups and the phone

**Export** on the start page saves a design as a `.garden.json` file, including its site plan. **Import
file** reads one back as a new design. To move a design to your phone, export it, send the file to the
phone (mail, a cloud drive, a messenger) and import it there. On a phone, designs open in a view-only
viewer: drag to move, pinch to zoom, tap something for its details, and use **Layers** and
**Vegetable calendar**; editing is for a larger screen. Export a backup now and then: the browser's
storage can be cleared, and if it fills up the app warns you and offers a backup.

## Install and offline use

The app is a PWA: after the first visit it works without a connection (in the garden, say), and it
can be installed like an app. In Chrome or Edge, use the install icon in the address bar; on Android,
*Add to Home screen* / *Install app*; on an iPhone or iPad, Safari's *Share → Add to Home Screen*.
When a new version has been deployed, the app shows "A new version of the app is available" with
a **Reload** button; it never updates in the middle of your work by itself. Your designs stay in
the browser's storage either way; export them (`.garden.json`) to move them to another device.

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
| `npm run verify` | Quiet lint, typecheck, unit tests, build and e2e in one go; logs in `.verify/`; run a subset with `npm run verify -- unit e2e` |
| `npm run plants:review` | Review tables of the built-in plant data (written to the private docs folder) |
| `npm run icons` | Render the app icons in `public/icons/` (after changing their design) |

`E2E_ALL_BROWSERS=1` adds Firefox and WebKit to the e2e run (needs their system libraries).

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

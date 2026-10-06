# folklore-map

**Folk Atlas**: folktales from around the world as wisps of light drifting over a globe. Zoom in and the globe
unrolls into a flat map; open a tale and the places where the same tale (or a tale of the same family) was told
light up, joined to it by a constellation.

## Getting started

```sh
git clone --recurse-submodules https://github.com/jansim/folklore-map.git   # or: git submodule update --init
npm ci
npm run build    # = build:world + build:data + build:site, all into dist/
npm run serve    # http://localhost:8000
```

`npm run dev` rebuilds the site whenever a file in `src/` changes and serves it (run `npm run build` once first for
the data). Everything the site needs, from map data to JavaScript libraries, comes from npm: nothing is loaded from a
CDN at build or run time except the Google Fonts stylesheet.

## Data

The tales come from the **Annotated Folktales** (`aft`) in [trilogy](https://github.com/j-hagedorn/trilogy)
by Joshua Hagedorn, seeded from D. L. Ashliman's [Folktexts](https://sites.pitt.edu/~dash/folktexts.html).
trilogy is included as a git submodule in `vendor/trilogy`, pinned to a specific commit.

> **Data license.** trilogy's data is licensed under
> [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). The tale texts, titles and annotations the
> site shows (and the files built from them in `dist/data/`) are derived from it, so they are shared under the
> same license, with credit to trilogy and to D. L. Ashliman's Folktexts, as the site's footer and reading view do.
> The map outlines are from [Natural Earth](https://www.naturalearthdata.com/) (public domain). This repository's
> own code does not have a license yet.

`scripts/build-data.js` (`npm run build:data`) turns trilogy into `dist/data/map.json` and one
`dist/data/tales/<id>.json` per tale, and reports provenances it could not place:

- `vendor/trilogy/data/aft.csv`: 1,518 tales with full text, provenance and ATU tale type. The texts come without
  paragraph breaks, so the build splits them every few sentences.
- `vendor/trilogy/data/atu_df.csv`: the ATU tale-type index: type names, and each type's family
  (e.g. "Supernatural Helpers 500-559").
- `data/atu-kinds.json`: the seven kinds of tale (e.g. "Tales of Magic") by ATU number range. atu_df.csv's own
  `chapter` column files Realistic Tales and Tales of the Stupid Ogre under Religious Tales, so the kinds are kept
  here; the file also names the two families atu_df.csv leaves unnamed (700-749 and 750-779) and one it cuts short.
  The build checks that every family falls within one kind.
- `data/places.json`: our gazetteer that places each provenance on the map. It matches countries, peoples, authors
  and collections (e.g. "Aesop", "Jacob and Wilhelm Grimm", "The Panchatantra") to approximate coordinates.
  The country each place lies in (lit up on the map) is found from its coordinates.
- `data/constellations.json`: a star-constellation drawing for every tale, e.g. a sun and a moon for "Sun, Moon, and
  Talia". Tales share the drawing of their ATU type unless they have their own; drawings are built from ~140 named
  icons (animals, people, things) that they place and scale, in a compact SVG-path-like format described in the
  file's `_comment` and decoded into stars and lines by `src/lib/constellations.js`. The build copies it to
  `dist/data/constellations.json`.

1,498 tales are placed at 98 places; 20 have no usable provenance and are left off the map. Tale ids are row numbers
in `aft.csv`, so they stay stable as long as the submodule commit does. To update to a newer trilogy, run
`git -C vendor/trilogy pull`, rebuild, check the unplaced report and the tests, and commit the submodule bump.

`scripts/build-world.js` (`npm run build:world`) copies the Natural Earth 1:110m countries from the
[world-atlas](https://github.com/topojson/world-atlas) package to `dist/data/world.json`.

## The site

The site's source is in `src/`; `scripts/build-site.js` (`npm run build:site`) bundles it with
[esbuild](https://esbuild.github.io/) into `dist/`. The map is drawn with [d3-geo](https://d3js.org/d3-geo):

- the world starts as a slowly turning globe in an astrolabe ring; zoom out to the globe, in to the flat map and
  beyond (scroll, pinch, the zoom buttons or + and −), drag or use the arrow keys to turn and pan it
- every tale is a wisp near its place. Which wisps show depends on the zoom: they are ranked so that the wisps shown
  at any zoom are spread evenly over the map and never closer than a few dozen pixels (`src/lib/wisps.js`), so
  zooming in reveals more of them, and wisps at the edge of showing slowly fade in and out
- hover a wisp to see the tale's name, click it to open it. The panel shows the tale's type, kind and family, an
  excerpt, the places where the same tale ("Same tale") or a tale of the same family ("Same family") was told, joined
  to it on the map, and more tales from the same place
- "Read the tale" shows the full text in the panel; search finds tales by title, type, ATU number or place, ignoring
  accents (`src/lib/search.js`)
- on phones the panel becomes a bottom sheet
- links: `#germany`, `#germany/238` (a place with a tale open), `#read/238` (reading a tale)

## Tests

```sh
npm test           # unit tests (src/lib) and checks of the built data in dist/data/
npm run test:e2e   # Playwright smoke tests of the built site, on a desktop and a phone viewport
```

Run `npm run build` first; the first time, install a browser for Playwright with `npx playwright install chromium`.

## Performance

The map and the wisps are drawn on canvases (`src/render.js`):

- a backdrop canvas (glow, globe disc, astrolabe ring), redrawn only when the zoom or layout changes
- a map canvas (graticule, land, borders, highlighted countries, coasts), redrawn only when the view moves. Borders
  and coasts are TopoJSON meshes, so every shared border is projected once.
- a wisp canvas (wisps from pre-rendered sprites, the constellation), redrawn every frame at 1x pixel density: the
  wisps are soft glows and look the same, at a quarter of the pixels on a high-density screen

There are no SVG filters, CSS blurs or per-wisp elements. Each wisp on screen has a button in a visually hidden list
(`#wisps`) for keyboards and screen readers; tale names are a few HTML labels. The page draws at up to 60 frames a
second while you turn or zoom (also on 120 Hz screens) and at 30 while the globe only turns and breathes on its own.

`npm run perf` (with the site served at http://localhost:8000) measures frames per second, main-thread time and the
page's own drawing time per frame, on the turning globe and zoomed into the map; `perf/profile.js` lists the
functions that take the most time.

## Deploying

`.github/workflows/pages.yml` runs `npm ci`, `npm run build` and both test suites on every pull request and push. On
pushes to `main` (or a manual run) it then deploys `dist/` to GitHub Pages. One-time setup: in the repository's
Settings → Pages, set **Source** to **GitHub Actions**.

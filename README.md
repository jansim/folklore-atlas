# folklore-map

**Folk Atlas**: folktales from around the world as wisps of light drifting over a globe. Zoom in and the globe
unrolls into a flat map; open a tale and the places where the same tale (or a tale of the same family) was told
light up, joined to it by a constellation.

## Data

The tales come from the **Annotated Folktales** (`aft`) in [trilogy](https://github.com/j-hagedorn/trilogy)
by Joshua Hagedorn (CC BY-SA 4.0), seeded from D. L. Ashliman's
[Folktexts](https://sites.pitt.edu/~dash/folktexts.html). trilogy is included as a git submodule in
`vendor/trilogy`, pinned to a specific commit:

```sh
git clone --recurse-submodules https://github.com/jansim/folklore-map.git
# or, in an existing clone:
git submodule update --init
```

The site's data files in `docs/data/` are generated and not tracked in git. Build them before serving:

```sh
npm run build        # = build:world + build:data
```

`scripts/build-data.js` turns trilogy into the files the site reads:

- `vendor/trilogy/data/aft.csv`: 1,518 tales with full text, provenance and ATU tale type
- `vendor/trilogy/data/atu_df.csv`: the ATU tale-type index (type names). Each type's kind (e.g. "Tales of Magic")
  and family (e.g. "Supernatural Helpers") follow the number ranges of the ATU index.
- `data/places.json`: our gazetteer that places each provenance on the map. It matches countries, peoples, authors
  and collections (e.g. "Aesop", "Jacob and Wilhelm Grimm", "The Panchatantra") to approximate coordinates.
  The country each place lies in (lit up on the map) is found from its coordinates.

```sh
npm run build:data   # writes docs/data/map.json and docs/data/tales/<id>.json, reports provenances it could not place
```

1,498 tales are placed at 98 places; 20 have no usable provenance and are left off the map. Tale ids are row numbers
in `aft.csv`, so they stay stable as long as the submodule commit does. To update to a newer trilogy, run
`git -C vendor/trilogy pull`, rebuild, check the unplaced report, and commit the submodule bump.

## The site

`docs/` is a static site (no build tools) drawn with [d3-geo](https://d3js.org/d3-geo) in the "Wisp Atlas" design:

- the world starts as a slowly turning globe in an astrolabe ring; zoom out to the globe, in to the flat map and
  beyond (scroll, pinch, the zoom buttons or + and −), drag or use the arrow keys to turn and pan it
- each place shows a few of its most widely told tales as drifting wisps; hover to see a tale's name, click to open it
- the panel shows the tale's type, kind and family, an excerpt, the places where the same tale ("Same tale") or a tale
  of the same family ("Same family") was told, joined to it on the map, and more tales from the same place
- "Read the tale" shows the full text in the panel; search finds tales by title, type, ATU number or place
- on phones the panel becomes a bottom sheet
- links: `#germany`, `#germany/238` (a place with a tale open), `#read/238` (reading a tale)

Serve it locally after `npm run build`:

```sh
npm run serve    # http://localhost:8000
```

Because `docs/data/` is not committed, publishing needs a build step. `.github/workflows/pages.yml` does this:
on every push to `main` (or a manual run) it checks out the submodule, runs `npm run build` and deploys `docs/`
to GitHub Pages; on pull requests it only runs the build as a check. One-time setup: in the repository's
Settings → Pages, set **Source** to **GitHub Actions**.

`docs/data/world.json` holds the countries from [Natural Earth](https://www.naturalearthdata.com/) 1:110m
(public domain) as TopoJSON, written by `scripts/build-world.js` (`npm run build:world`), which downloads it from
[world-atlas](https://github.com/topojson/world-atlas).

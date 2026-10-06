# folklore-map

**Wisp Atlas**: a night-sky map of folktales. Every place where tales were told is a star over a dotted-outline
world, shining brighter the more tales it holds, and tales of the same type are joined in constellations.

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
npm run build        # = build:land + build:data
```

`scripts/build-data.js` turns trilogy into the files the site reads:

- `vendor/trilogy/data/aft.csv`: 1,518 tales with full text, provenance and ATU tale type
- `vendor/trilogy/data/atu_df.csv`: the ATU tale-type index (type names and chapters, used as "kinds" of tale)
- `data/places.json`: our gazetteer that places each provenance on the map. It matches countries, peoples, authors
  and collections (e.g. "Aesop", "Jacob and Wilhelm Grimm", "The Panchatantra") to approximate coordinates.

```sh
npm run build:data   # writes docs/data/map.json and docs/data/tales/<id>.json, reports provenances it could not place
```

1,498 tales are placed at 98 places; 20 have no usable provenance and are left off the map. Tale ids are row numbers
in `aft.csv`, so they stay stable as long as the submodule commit does. To update to a newer trilogy, run
`git -C vendor/trilogy pull`, rebuild, check the unplaced report, and commit the submodule bump.

## The site

`docs/` is a static [Leaflet](https://leafletjs.com/) site (no build tools) in the "Night Sky Atlas" design:

- filter by kind of tale (ATU chapter), by tale type, or by text
- open a tale to see its excerpt and its constellation: lines to every other place with a tale of the same type
- "Read the tale" opens the full text in a reader with the place, tale type, source and kindred tales
  (with text-size and read-aloud controls)
- "Follow a falling star" picks a random tale; on phones the tale list becomes a bottom sheet
- links: `#germany`, `#germany/238` (a place with a tale open), `#read/238` (the reader)

Serve it locally after `npm run build`:

```sh
npm run serve    # http://localhost:8000
```

Because `docs/data/` is not committed, publishing needs a build step. `.github/workflows/pages.yml` does this:
on every push to `main` (or a manual run) it checks out the submodule, runs `npm run build` and deploys `docs/`
to GitHub Pages; on pull requests it only runs the build as a check. One-time setup: in the repository's
Settings → Pages, set **Source** to **GitHub Actions**.

`docs/data/land.json` holds the land outlines from [Natural Earth](https://www.naturalearthdata.com/) 1:110m
(public domain), built by `scripts/build-land.js` (`npm run build:land`), which downloads the
[world-atlas](https://github.com/topojson/world-atlas) TopoJSON.

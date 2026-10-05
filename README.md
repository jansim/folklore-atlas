# folklore-map

A map of folktales from the [YASHPEH International Folktales Collection](https://folkmasa.org/yashpeh/mb_yash.php)
(public domain, 2013).

## Map: Wisp Atlas

`docs/` is a static [Leaflet](https://leafletjs.com/) site (no build tools) in the "Night Sky Atlas" style: every place
where tales were told is a star over a dotted-outline world, shining brighter the more tales it holds. Pick a part of
the sky (region chips), click a star or a place in the panel to list its tales, filter by text or book, open a tale's
excerpt and follow the link to its full text, or "Follow a falling star" to a random tale. On phones the tale list
becomes a bottom sheet. Links like `#japan`, `#germany/1093` (a place and an open tale) or `#sky:africa` can be shared.

It can be served directly with GitHub Pages (branch → `/docs`), or locally:

```sh
npm run serve    # http://localhost:8000
```

Story positions come from `data/locations.json`, a hand-made gazetteer mapping each tradition label
(e.g. `"American Indian, Sioux"`) to approximate coordinates and a region. Books or stories whose label is generic or
misleading can be assigned to a place by id. After changing the data or the gazetteer, regenerate the map data:

```sh
npm run build:map    # writes docs/data/map.json and reports unmapped traditions
```

`docs/data/land.json` holds the land outlines from [Natural Earth](https://www.naturalearthdata.com/) 1:110m
(public domain), prepared by `scripts/build-land.js` from the
[world-atlas](https://github.com/topojson/world-atlas) TopoJSON (see the script header to regenerate it).

## Data

`data/` contains the scraped collection:

- `data/books.json` – 96 source books (title, author, publication, short description, source URL, story count)
- `data/stories.json` – 4,268 stories (title, book, tradition, a short excerpt and a link to the full text)

Each story's `tradition` is the culture / region given by the collection (e.g. `"Celtic, Ireland, Scotland, Wales"`),
also split into the `traditions` array.

## Scraper

The scraper is plain Node.js (18+) without dependencies:

```sh
npm run scrape                       # full scrape (~3 min)
node scraper/scrape.js --limit 50    # only the first 50 stories
```

It reads the story list, then every book and story detail page (4 requests in parallel).
Raw pages are cached in `scraper/.cache/` (git-ignored), so reruns are fast; pass `--no-cache` to refetch.

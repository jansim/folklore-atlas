# folklore-map

A map of folktales from the [YASHPEH International Folktales Collection](https://folkmasa.org/yashpeh/mb_yash.php)
(public domain, 2013).

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

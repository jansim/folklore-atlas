#!/usr/bin/env node
// Combines data/stories.json, data/books.json and data/locations.json into the
// compact docs/data/map.json used by the map in docs/.
//
// Usage: node scripts/build-map-data.js

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
const EXCERPT_LENGTH = 240;

const stories = read('data/stories.json');
const books = read('data/books.json');
const { places } = read('data/locations.json');

const byTradition = new Map();
const byBook = new Map();
const byStory = new Map();
for (const place of places) {
  for (const t of place.traditions) byTradition.set(t, place.id);
  for (const b of place.books ?? []) byBook.set(b, place.id);
  for (const id of place.stories ?? []) byStory.set(id, place.id);
}

const shorten = (s) => {
  if (!s || s.length <= EXCERPT_LENGTH) return s;
  return s.slice(0, s.lastIndexOf(' ', EXCERPT_LENGTH)) + '…';
};

const placed = new Map(places.map((p) => [p.id, []]));
const unmapped = new Map();
for (const s of stories) {
  const placeId = byStory.get(s.id) ?? byBook.get(s.bookId) ?? byTradition.get(s.tradition);
  if (!placeId) {
    unmapped.set(s.tradition, (unmapped.get(s.tradition) ?? 0) + 1);
    continue;
  }
  // Compact story tuple: [id, title, bookId, tradition, excerpt]
  placed.get(placeId).push([s.id, s.title, s.bookId, s.tradition, shorten(s.excerpt)]);
}

const out = {
  source: 'https://folkmasa.org/yashpeh/mb_yash.php',
  storyUrl: 'https://folkmasa.org/yashpeh/mb_yashp.php?mishtane=',
  books: Object.fromEntries(books.map((b) => [b.id, { name: b.name, author: b.author }])),
  places: places
    .filter((p) => placed.get(p.id).length)
    .map((p) => ({ id: p.id, name: p.name, lat: p.lat, lng: p.lng, stories: placed.get(p.id) })),
};

const outFile = path.join(ROOT, 'docs/data/map.json');
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(out));

const total = out.places.reduce((n, p) => n + p.stories.length, 0);
console.log(`Placed ${total} of ${stories.length} stories at ${out.places.length} places → docs/data/map.json`);
for (const [t, n] of unmapped) console.log(`  unmapped tradition ${JSON.stringify(t)}: ${n} stories`);

#!/usr/bin/env node
// Builds the map data from the trilogy submodule (vendor/trilogy):
//   - vendor/trilogy/data/aft.csv     Annotated Folktales: tale text, provenance, ATU tale type
//   - vendor/trilogy/data/atu_df.csv  ATU tale type index: names and chapters
//   - data/places.json                our gazetteer: provenance -> map position
//   - docs/data/world.json            country outlines (scripts/build-world.js), to find each place's country
// Writes docs/data/map.json (places, tale list, tale types) and one
// docs/data/tales/<id>.json per tale with its full text.
//
// Usage: node scripts/build-data.js

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const TRILOGY = path.join(ROOT, 'vendor/trilogy/data');
const OUT = path.join(ROOT, 'docs/data');
const EXCERPT_LENGTH = 240;
const PARAGRAPH_LENGTH = 520;

if (!fs.existsSync(path.join(TRILOGY, 'aft.csv'))) {
  console.error('vendor/trilogy is missing. Run: git submodule update --init');
  process.exit(1);
}
if (!fs.existsSync(path.join(OUT, 'world.json'))) {
  console.error('docs/data/world.json is missing. Run: npm run build:world');
  process.exit(1);
}

// Minimal RFC 4180 CSV parser (quoted fields, "" escapes, newlines in quotes).
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') field += c, i++;
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') row.push(field), (field = '');
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field), rows.push(row), (row = []), (field = '');
    } else field += c;
  }
  if (field || row.length) row.push(field), rows.push(row);
  const [header, ...body] = rows;
  return body.filter((r) => r.length > 1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

const readCsv = (file) => parseCsv(fs.readFileSync(path.join(TRILOGY, file), 'utf8'));

// Some fields were stored as UTF-8 read as Latin-1 ("AsbjÃ¸rnsen"); repair those runs.
const fixMojibake = (s) =>
  s.replace(/[Â-ô][\u0080-¿]{1,3}/g, (m) => {
    const fixed = Buffer.from(m, 'latin1').toString('utf8');
    return fixed.includes('�') || fixed.length !== 1 ? m : fixed;
  });
const clean = (s) => (s && s !== 'NA' ? fixMojibake(s).replace(/\s+/g, ' ').trim() : null);

// The texts come without line breaks: break them into paragraphs of a few sentences for reading.
function paragraphs(s) {
  const sentences = s.match(/[^.!?]+(?:[.!?]+["'’”)]*|$)\s*/g) ?? [s];
  const out = [''];
  for (const sentence of sentences) {
    if (out[out.length - 1].length > PARAGRAPH_LENGTH) out.push('');
    out[out.length - 1] += sentence;
  }
  return out.map((p) => p.trim()).filter(Boolean);
}

const excerpt = (s) => (s.length <= EXCERPT_LENGTH ? s : s.slice(0, s.lastIndexOf(' ', EXCERPT_LENGTH)) + '…');

// ---------- Gazetteer ----------

const gazetteer = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/places.json'), 'utf8'));
const placeById = new Map(gazetteer.places.map((p) => [p.id, p]));
const aliases = gazetteer.places.flatMap((p) => p.aliases.map((a) => ({ alias: a, place: p })));

function locate(provenance) {
  if (!provenance) return null;
  if (gazetteer.match[provenance]) return placeById.get(gazetteer.match[provenance]);
  const parts = provenance
    .toLowerCase()
    .split(/[,;/()]|--/)
    .map((s) => s.trim())
    .filter(Boolean);
  const hits = parts.flatMap((part) =>
    aliases.filter(({ alias }) => part === alias || part.startsWith(alias + ' ')).map(({ place }) => place),
  );
  return hits.find((p) => !p.generic) ?? hits[0] ?? null;
}

// ---------- Countries ----------

// Decode the TopoJSON countries into planar [lng, lat] rings, enough to find the country a place lies in.
function topoCountries(topo) {
  const { scale, translate } = topo.transform;
  const arcs = topo.arcs.map((arc) => {
    let x = 0;
    let y = 0;
    return arc.map(([dx, dy]) => [(x += dx) * scale[0] + translate[0], (y += dy) * scale[1] + translate[1]]);
  });
  const ring = (indexes) =>
    indexes.flatMap((i, n) => {
      const points = i < 0 ? arcs[~i].slice().reverse() : arcs[i];
      return n === 0 ? points : points.slice(1);
    });
  return topo.objects.countries.geometries.map((g) => ({
    name: g.properties.name,
    polygons: g.type === 'Polygon' ? [g.arcs.map(ring)] : g.type === 'MultiPolygon' ? g.arcs.map((p) => p.map(ring)) : [],
  }));
}

function inRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const countries = topoCountries(JSON.parse(fs.readFileSync(path.join(OUT, 'world.json'), 'utf8')));
// The country a place lies in or, for a place on a coast or a small island, the nearest one within ~4°.
function countryAt(lng, lat) {
  const inside = countries.find((c) =>
    c.polygons.some(([outer, ...holes]) => inRing([lng, lat], outer) && !holes.some((h) => inRing([lng, lat], h))),
  );
  if (inside) return inside.name;
  let best = null;
  let bestDistance = 16;
  for (const c of countries)
    for (const [outer] of c.polygons)
      for (const [x, y] of outer) {
        const d = ((x - lng) * Math.cos((lat * Math.PI) / 180)) ** 2 + (y - lat) ** 2;
        if (d < bestDistance) (best = c.name), (bestDistance = d);
      }
  return best;
}

// ---------- Tale types ----------

// The kinds and families of tale follow the number ranges of the ATU index (Uther 2004);
// trilogy's own chapter column lumps some of them together.
const KINDS = [
  ['Animal Tales', 1, [[1, 'Wild Animals'], [100, 'Wild Animals and Domestic Animals'], [150, 'Wild Animals and Humans'], [200, 'Domestic Animals'], [220, 'Other Animals and Objects']]],
  ['Tales of Magic', 300, [[300, 'Supernatural Adversaries'], [400, 'Supernatural or Enchanted Relatives'], [460, 'Supernatural Tasks'], [500, 'Supernatural Helpers'], [560, 'Magic Objects'], [650, 'Supernatural Power or Knowledge'], [700, 'Other Tales of the Supernatural']]],
  ['Religious Tales', 750, [[750, 'God Repays and Punishes'], [780, 'The Truth Comes to Light'], [800, 'Heaven'], [810, 'The Devil'], [827, 'Other Religious Tales']]],
  ['Realistic Tales', 850, [[850, 'The Man Marries the Princess'], [870, 'The Woman Marries the Prince'], [880, 'Proofs of Fidelity and Innocence'], [900, 'The Obstinate Wife Learns to Obey'], [910, 'Good Precepts'], [920, 'Clever Acts and Words'], [930, 'Tales of Fate'], [950, 'Robbers and Murderers'], [970, 'Other Realistic Tales']]],
  ['Tales of the Stupid Ogre', 1000, [[1000, 'Labor Contract'], [1030, 'Partnership between Man and Ogre'], [1060, 'Contest between Man and Ogre'], [1115, 'Man Kills or Injures Ogre'], [1145, 'Ogre Frightened by Man'], [1155, 'Man Outwits the Devil'], [1170, 'Souls Saved from the Devil']]],
  ['Anecdotes and Jokes', 1200, [[1200, 'Stories about a Fool'], [1350, 'Stories about Married Couples'], [1440, 'Stories about a Woman'], [1525, 'Stories about a Man'], [1725, 'Jokes about Clergymen and Religious Figures'], [1850, 'Anecdotes about Other Groups of People'], [1875, 'Tall Tales']]],
  ['Formula Tales', 2000, [[2000, 'Cumulative Tales'], [2200, 'Catch Tales'], [2300, 'Other Formula Tales']]],
];
const kinds = KINDS.map(([name]) => name);
const families = KINDS.flatMap(([, , fams], kind) => fams.map(([from, name]) => ({ from, name, kind })));
const familyOf = (atu) => {
  const n = parseInt(atu, 10);
  return families.reduce((found, f, i) => (n >= f.from ? i : found), -1);
};

const types = {};
for (const t of readCsv('atu_df.csv')) {
  types[t.atu_id] = [clean(t.tale_name).replace(/\s*\(previously [^)]*\)\s*/i, ' ').trim(), familyOf(t.atu_id)];
}

// ---------- Tales ----------

const tales = readCsv('aft.csv');
const placed = new Map();
const unplaced = new Map();
fs.rmSync(path.join(OUT, 'tales'), { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'tales'), { recursive: true });

tales.forEach((t, i) => {
  const id = i + 1; // row number in aft.csv; stable for the pinned submodule commit
  const provenance = clean(t.provenance);
  const text = clean(t.text) ?? '';
  const title = clean(t.tale_title) ?? 'Untitled';
  const place = locate(provenance);
  if (!place) {
    unplaced.set(provenance, (unplaced.get(provenance) ?? 0) + 1);
    return;
  }
  if (!placed.has(place.id)) placed.set(place.id, []);
  if (!types[t.atu_id]) types[t.atu_id] = ['Unnamed tale type', familyOf(t.atu_id)];
  // Compact tale tuple: [id, title, atu_id, excerpt]
  placed.get(place.id).push([id, title, t.atu_id, excerpt(text)]);
  const tale = { id, title, atu: t.atu_id, place: place.id, provenance, source: clean(t.source), notes: clean(t.notes), paragraphs: paragraphs(text) };
  fs.writeFileSync(path.join(OUT, 'tales', `${id}.json`), JSON.stringify(tale));
});

const usedTypes = new Set([...placed.values()].flat().map((t) => t[2]));
const out = {
  source: 'https://github.com/j-hagedorn/trilogy',
  kinds,
  // [family name, kind index]
  families: families.map((f) => [f.name, f.kind]),
  // atu id -> [type name, family index]
  types: Object.fromEntries(Object.entries(types).filter(([id]) => usedTypes.has(id))),
  places: gazetteer.places
    .filter((p) => placed.has(p.id))
    .map((p) => ({ id: p.id, name: p.name, lat: p.lat, lng: p.lng, country: p.generic ? null : countryAt(p.lng, p.lat), tales: placed.get(p.id) })),
};
fs.writeFileSync(path.join(OUT, 'map.json'), JSON.stringify(out));

const total = [...placed.values()].reduce((n, l) => n + l.length, 0);
console.log(`Placed ${total} of ${tales.length} tales at ${out.places.length} places (${usedTypes.size} tale types) → docs/data/`);
for (const [p, n] of unplaced) console.log(`  not placed: ${JSON.stringify(p)} (${n})`);
for (const p of gazetteer.places) if (!placed.has(p.id)) console.log(`  unused place: ${p.id}`);
for (const p of out.places) if (!p.country) console.log(`  not in a country: ${p.id}`);

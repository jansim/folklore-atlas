// Checks the data built by `npm run build:world && npm run build:data` in dist/data/.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { before, test } from 'node:test';

const DATA = path.join(import.meta.dirname, '../dist/data');
const read = (file) => JSON.parse(fs.readFileSync(path.join(DATA, file), 'utf8'));
let map;
let gazetteer;

before(() => {
  assert.ok(fs.existsSync(path.join(DATA, 'map.json')), 'dist/data/map.json is missing: run npm run build first');
  map = read('map.json');
  gazetteer = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '../data/places.json'), 'utf8'));
});

const allTales = () => map.places.flatMap((p) => p.tales);

test('most tales are placed', () => {
  assert.ok(allTales().length >= 1490, `only ${allTales().length} tales placed`);
  assert.ok(map.places.length >= 95, `only ${map.places.length} places`);
  assert.equal(new Set(allTales().map((t) => t[0])).size, allTales().length, 'tale ids are unique');
});

test('places have coordinates and, unless generic, a country', () => {
  const generic = new Set(gazetteer.places.filter((p) => p.generic).map((p) => p.id));
  for (const p of map.places) {
    assert.ok(Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180, p.id);
    if (!generic.has(p.id)) assert.ok(p.country, `${p.id} has no country`);
  }
});

test('every tale has a named type in a family and a kind', () => {
  for (const [id, title, atu] of allTales()) {
    const type = map.types[atu];
    assert.ok(type, `tale ${id} (${title}): no type ${atu}`);
    const family = map.families[type[1]];
    assert.ok(family, `ATU ${atu}: no family`);
    assert.ok(map.kinds[family[1]], `ATU ${atu}: no kind`);
  }
});

test('kinds follow the ATU index', () => {
  assert.deepEqual(map.kinds, [
    'Animal Tales',
    'Tales of Magic',
    'Religious Tales',
    'Realistic Tales',
    'Tales of the Stupid Ogre',
    'Anecdotes and Jokes',
    'Formula Tales',
  ]);
  const kindOf = (atu) => map.kinds[map.families[map.types[atu][1]][1]];
  assert.equal(kindOf('510A'), 'Tales of Magic');
  assert.equal(kindOf('875'), 'Realistic Tales');
  assert.equal(kindOf('1137'), 'Tales of the Stupid Ogre');
});

test('every placed tale has its text', () => {
  for (const [id, title, , excerpt] of allTales()) {
    const tale = read(`tales/${id}.json`);
    assert.equal(tale.title, title);
    assert.ok(tale.paragraphs.length > 0 && tale.paragraphs.every((p) => p.length > 0), `tale ${id} has no text`);
    assert.ok(excerpt.length > 0, `tale ${id} has no excerpt`);
  }
});

test('world.json has countries and land', () => {
  const world = read('world.json');
  assert.ok(world.objects.countries.geometries.length > 150);
  assert.ok(world.objects.land);
});

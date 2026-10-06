import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fold, indexTale, searchTales } from '../src/lib/search.js';

const tales = [
  indexTale({ title: 'The Church at Erritsø' }, 'Denmark'),
  indexTale({ title: 'Cinderella' }, 'France', 'atu 510a'),
  indexTale({ title: 'The Little Glass Slipper' }, 'France', 'Cinderella'),
  indexTale({ title: 'Ashey Pelt' }, 'Ireland', 'Cinderella'),
  indexTale({ title: 'Ærø’s Ferryman' }, 'Denmark'),
];
const titles = (q) => searchTales(tales, q)?.map((t) => t.title);

test('fold drops case, accents and special letters', () => {
  assert.equal(fold('Erritsø'), 'erritso');
  assert.equal(fold('Ærø’s Café'), "aero's cafe");
  assert.equal(fold('Straße'), 'strasse');
});

test('search ignores accents and letters like ø', () => {
  assert.deepEqual(titles('erritso'), ['The Church at Erritsø']);
  assert.deepEqual(titles('Erritsø'), ['The Church at Erritsø']);
  assert.deepEqual(titles("aero's"), ['Ærø’s Ferryman']);
});

test('search matches every word, titles first', () => {
  assert.deepEqual(titles('cinderella'), ['Cinderella', 'Ashey Pelt', 'The Little Glass Slipper']);
  assert.deepEqual(titles('cinderella ireland'), ['Ashey Pelt']);
  assert.deepEqual(titles('atu 510a'), ['Cinderella']);
});

test('search needs two characters', () => {
  assert.equal(searchTales(tales, ' c '), null);
});

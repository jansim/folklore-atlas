#!/usr/bin/env node
// Scraper for the YASHPEH International Folktales Collection
// (https://folkmasa.org/yashpeh/mb_yash.php).
//
// 1. Fetches the story list, which groups every story under its book.
// 2. Fetches each book detail page (mb_bookp.php) for bibliographic info.
// 3. Fetches each story detail page (mb_yashp.php) for its "Tradition"
//    (the culture / region the tale comes from) and a short excerpt.
//
// Output: data/books.json and data/stories.json
// Raw HTML is cached in scraper/.cache so interrupted runs can resume.
//
// Usage: node scraper/scrape.js [--limit N] [--concurrency N] [--no-cache]

const fs = require('node:fs/promises');
const path = require('node:path');

const BASE = 'https://folkmasa.org/yashpeh/';
const ROOT = path.join(__dirname, '..');
const CACHE_DIR = path.join(__dirname, '.cache');
const DATA_DIR = path.join(ROOT, 'data');
const EXCERPT_LENGTH = 400;

const args = process.argv.slice(2);
const argValue = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? Number(args[i + 1]) : fallback;
};
const LIMIT = argValue('--limit', Infinity);
const CONCURRENCY = argValue('--concurrency', 4);
const USE_CACHE = !args.includes('--no-cache');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchPage(file) {
  const cacheFile = path.join(CACHE_DIR, file.replace(/[^\w.-]/g, '_') + '.html');
  if (USE_CACHE) {
    try {
      return await fs.readFile(cacheFile, 'utf8');
    } catch {}
  }
  for (let attempt = 1; ; attempt++) {
    try {
      // The site redirect-loops on unusual User-Agent strings, so keep the default one.
      const res = await fetch(BASE + file);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      await fs.mkdir(CACHE_DIR, { recursive: true });
      await fs.writeFile(cacheFile, html);
      return html;
    } catch (err) {
      if (attempt >= 5) throw new Error(`Failed to fetch ${file}: ${err.message}`);
      await sleep(1000 * 2 ** attempt);
    }
  }
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function decode(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return String.fromCodePoint(code);
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

const text = (html) => decode(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

// Contents of each <td> of the detail table that follows `marker`.
function detailCells(html, marker) {
  const start = html.indexOf(marker);
  if (start < 0) return [];
  return html
    .slice(start)
    .split(/<td\b[^>]*>/i)
    .slice(1)
    .map((c) => c.replace(/<\/td>[\s\S]*$/i, ''));
}

function paragraphs(cellHtml) {
  return [...cellHtml.matchAll(/<p\b[^>]*>([\s\S]*?)(?=<p\b|<\/div>|$)/gi)].map((m) => text(m[1])).filter(Boolean);
}

function excerpt(paras) {
  const joined = paras.join(' ');
  if (joined.length <= EXCERPT_LENGTH) return joined;
  return joined.slice(0, joined.lastIndexOf(' ', EXCERPT_LENGTH)) + '…';
}

// The story list: a header table per book, followed by a table of its stories.
function parseStoryList(html) {
  const books = [];
  const re =
    /Book name:([\s\S]*?)<\/td>[\s\S]*?Author:([\s\S]*?)<\/td>[\s\S]*?mb_bookp\.php\?mishtane=(\d+)|mb_yashp\.php\?mishtane=(\d+)/g;
  let book = null;
  for (const m of html.matchAll(re)) {
    if (m[3]) {
      book = { id: Number(m[3]), name: text(m[1]), author: text(m[2]), storyIds: [] };
      books.push(book);
    } else if (book) {
      book.storyIds.push(Number(m[4]));
    }
  }
  // Story titles from the list (used as a fallback).
  const titles = new Map();
  const rowRe = /<td[^>]*>([^]*?)<\/td><td[^>]*>\s*<p[^>]*><span[^>]*>\s*<a href="mb_yashp\.php\?mishtane=(\d+)"/g;
  for (const m of html.matchAll(rowRe)) titles.set(Number(m[2]), text(m[1].split(/<td[^>]*>/i).pop()));
  return { books, titles };
}

function parseBook(html) {
  // Cells: "first story" / "last story" links, then title, author, publication,
  // description (+ preface / notes) and usually a source URL; some are empty.
  const cells = detailCells(html, 'Book No.').filter((c) => text(c) && !/^To (first|last) story/i.test(text(c)));
  const source = cells.map(text).find((t) => /^https?:\/\/\S+$/.test(t)) ?? null;
  const rest = cells.filter((c) => text(c) !== source);
  return {
    publication: rest[2] ? text(rest[2]) : null,
    description: rest[3] ? (paragraphs(rest[3]).find((p) => p.length > 40) ?? text(rest[3])) : null,
    source,
  };
}

function parseStory(html) {
  const cells = detailCells(html, 'Story No.');
  const out = { title: cells[0] ? text(cells[0]) : null, tradition: null, excerpt: null };
  for (const cell of cells.slice(1)) {
    const t = text(cell);
    if (!t || /^Book Name:/i.test(t)) continue;
    if (/^Tradition:/i.test(t)) {
      out.tradition = t.replace(/^Tradition:\s*/i, '') || null;
    } else if (!out.excerpt) {
      const paras = paragraphs(cell);
      out.excerpt = excerpt(paras.length ? paras : [t]);
    }
  }
  return out;
}

async function mapConcurrent(items, fn) {
  const results = new Array(items.length);
  let next = 0;
  let done = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i]);
        if (++done % 100 === 0 || done === items.length) {
          process.stderr.write(`  ${done}/${items.length}\n`);
        }
      }
    }),
  );
  return results;
}

async function main() {
  console.error('Fetching story list…');
  const { books, titles } = parseStoryList(await fetchPage('mb_yash.php'));
  const totalStories = books.reduce((n, b) => n + b.storyIds.length, 0);
  console.error(`Found ${books.length} books, ${totalStories} stories`);

  console.error('Fetching book pages…');
  const bookDetails = await mapConcurrent(books, async (b) => parseBook(await fetchPage(`mb_bookp.php?mishtane=${b.id}`)));

  const storyRefs = books.flatMap((b) => b.storyIds.map((id) => ({ id, book: b }))).slice(0, LIMIT);
  console.error(`Fetching ${storyRefs.length} story pages…`);
  const stories = await mapConcurrent(storyRefs, async ({ id, book }) => {
    const s = parseStory(await fetchPage(`mb_yashp.php?mishtane=${id}`));
    return {
      id,
      title: s.title || titles.get(id) || null,
      bookId: book.id,
      bookName: book.name,
      tradition: s.tradition,
      traditions: s.tradition
        ? s.tradition
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean)
        : [],
      excerpt: s.excerpt,
      url: `${BASE}mb_yashp.php?mishtane=${id}`,
    };
  });

  const booksOut = books.map((b, i) => ({
    id: b.id,
    name: b.name,
    author: b.author,
    ...bookDetails[i],
    storyCount: b.storyIds.length,
    url: `${BASE}mb_bookp.php?mishtane=${b.id}`,
  }));

  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(path.join(DATA_DIR, 'books.json'), JSON.stringify(booksOut, null, 2) + '\n');
  await fs.writeFile(path.join(DATA_DIR, 'stories.json'), JSON.stringify(stories, null, 2) + '\n');
  console.error(`Wrote ${booksOut.length} books and ${stories.length} stories to ${path.relative(ROOT, DATA_DIR)}/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

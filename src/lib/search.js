// Search over tales that ignores case, accents and letters like ø or æ, so "erritso" finds "Erritsø".

const LETTERS = { ø: 'o', æ: 'ae', œ: 'oe', ß: 'ss', đ: 'd', ð: 'd', ł: 'l', þ: 'th', ı: 'i', '‘': "'", '’': "'", '“': '"', '”': '"' };

export const fold = (s) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[øæœßđðłþı‘’“”]/g, (c) => LETTERS[c]);

// Adds the folded text a tale is found by.
export function indexTale(tale, ...fields) {
  tale.titleKey = fold(tale.title);
  tale.searchKey = fold([tale.title, ...fields].join(' '));
  return tale;
}

// Tales matching every word of the query, titles that start with or contain it first.
export function searchTales(tales, query, limit = 40) {
  const q = fold(query.trim());
  if (q.length < 2) return null;
  const terms = q.split(/\s+/);
  const rank = (t) => (t.titleKey.startsWith(q) ? 0 : t.titleKey.includes(q) ? 1 : 2);
  return tales
    .filter((t) => terms.every((term) => t.searchKey.includes(term)))
    .sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title))
    .slice(0, limit);
}

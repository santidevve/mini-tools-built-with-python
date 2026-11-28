import * as gutenberg from "./gutenberg.js";
import * as openlibrary from "./openlibrary.js";
import * as wikisource from "./wikisource.js";
import * as archive from "./archive.js";

const ADAPTERS = [gutenberg, openlibrary, archive, wikisource];

export function detect(base) {
  return ADAPTERS.find((a) => a.detect(base)) || null;
}

export async function search(base, query, opts) {
  const adapter = detect(base);
  if (!adapter) throw new Error(`No adapter for source ${base}`);
  return adapter.search(query, opts);
}

export async function resolve(base, book) {
  const adapter = detect(book.source || base);
  if (adapter && adapter.resolve) {
    const direct = await adapter.resolve(book);
    if (direct) return direct;
  }
  return null;
}
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { AIAgent } from "./agent.js";
import { downloadBook } from "./downloader.js";
import { search as sourceSearch } from "./sources/index.js";

export async function fetchBooks(base, query) {
  // Online-first: adaptador JSON por fuente. Si no hay adaptador, lanza para que
  // el pipeline caiga al scraper Playwright genérico.
  return sourceSearch(base, query);
}

export function allowedHosts(sources) {
  const set = new Set();
  for (const s of sources || []) {
    if (!s.allowed) continue;
    try {
      set.add(new URL(s.base_url).hostname.toLowerCase());
    } catch {
      /* ignore invalid source */
    }
  }
  return set;
}

export function isUrlAllowed(url, sources) {
  try {
    return allowedHosts(sources).has(new URL(url).hostname.toLowerCase());
  } catch {
    return false;
  }
}

export async function captureCover(book, destPath) {
  try {
    if (book.cover_url && /^https?:/i.test(book.cover_url)) {
      await mkdir(path.dirname(destPath), { recursive: true });
      const res = await fetch(book.cover_url, { signal: AbortSignal.timeout(15000) });
      if (res.ok) {
        await writeFile(destPath, Buffer.from(await res.arrayBuffer()));
        return destPath;
      }
    }
  } catch {
    /* fall through to screenshot */
  }
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const url = book.url && /^https?:/i.test(book.url) ? book.url : book.source;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
    await mkdir(path.dirname(destPath), { recursive: true });
    await page.screenshot({ path: destPath, fullPage: false });
    return destPath;
  } catch {
    return null;
  } finally {
    await browser.close();
  }
}

export async function run({ base, outDir, goal, limit, ids, headless, timeout, signal }) {
  const books = await fetchBooks(base, goal);

  let selected;
  if (ids && ids.length) {
    const wanted = new Set(ids);
    selected = books.filter((b) => wanted.has(b.id));
  } else {
    const agent = new AIAgent();
    const chosen = await agent.plan(goal, books);
    const chosenSet = new Set(chosen);
    selected = books.filter((b) => chosenSet.has(b.id));
    if (limit) selected = selected.slice(0, limit);
  }

  console.log(`Selected ${selected.length} book(s) to download.`);

  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  const results = [];
  for (const book of selected) {
    try {
      const file = await downloadBook(context, page, base, book, outDir, timeout, signal);
      results.push({ id: book.id, ok: true, file });
      console.log(`[ok] ${book.id} -> ${file}`);
    } catch (err) {
      results.push({ id: book.id, ok: false, error: String(err) });
      console.error(`[fail] ${book.id}: ${err}`);
    }
  }

  await browser.close();
  return results;
}
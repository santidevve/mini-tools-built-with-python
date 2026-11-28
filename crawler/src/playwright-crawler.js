import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { AIAgent } from "./agent.js";
import { downloadMovie } from "./downloader.js";

export async function fetchMovies(base) {
  const res = await fetch(`${base}/api/movies`);
  if (!res.ok) throw new Error(`Catalog fetch failed: ${res.status}`);
  const data = await res.json();
  return data.movies || [];
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

export async function screenshotMovie(base, movie, destPath) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const url = movie.url && /^https?:/i.test(movie.url) ? movie.url : `${base}/movie/${encodeURIComponent(movie.id)}`;
    await page
      .goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      })
      .catch(() => {});
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
  const movies = await fetchMovies(base);

  let selected;
  if (ids && ids.length) {
    const wanted = new Set(ids);
    selected = movies.filter((m) => wanted.has(m.id));
  } else {
    const agent = new AIAgent();
    const chosen = await agent.plan(goal, movies);
    const chosenSet = new Set(chosen);
    selected = movies.filter((m) => chosenSet.has(m.id));
    if (limit) selected = selected.slice(0, limit);
  }

  console.log(`Selected ${selected.length} movie(s) to download.`);

  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  const results = [];
  for (const movie of selected) {
    try {
      const file = await downloadMovie(context, page, base, movie, outDir, timeout, signal);
      results.push({ id: movie.id, ok: true, file });
      console.log(`[ok] ${movie.id} -> ${file}`);
    } catch (err) {
      results.push({ id: movie.id, ok: false, error: String(err) });
      console.error(`[fail] ${movie.id}: ${err}`);
    }
  }

  await browser.close();
  return results;
}
import { chromium } from "playwright";

function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

function absUrl(base, href) {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

const SEARCH_SELECTOR = [
  'input[type="search"]',
  'input[name*="search" i]',
  'input[placeholder*="search" i]',
  'input[placeholder*="buscar" i]',
  'input[placeholder*="query" i]',
].join(", ");

const SKIP_HREF = /\/(category|tag|page|author|privacy|about|contact|dmca|disclaimer|terms)\b/i;
const SKIP_TEXT = /^(ad|sponsored|download|select quality|your download|fast|recommended|watch|stream)\b/i;
const AD_HOST = /adfractal|doubleclick|googlesyndication|\/ads?\./i;

async function extractItems(page) {
  return page.evaluate(() => {
    const SKIP_HREF = /\/(category|tag|page|author|privacy|about|contact|dmca|disclaimer|terms)\b/i;
    const SKIP_TEXT = /^(ad|sponsored|download|select quality|your download|fast|recommended|watch|stream)\b/i;
    const AD_HOST = /adfractal|doubleclick|googlesyndication|\/ads?\./i;
    const out = [];
    const seen = new Set();
    for (const a of Array.from(document.querySelectorAll("a[href]"))) {
      const href = a.getAttribute("href") || "";
      if (!href || href.startsWith("#") || href.startsWith("javascript")) continue;
      if (SKIP_HREF.test(href) || AD_HOST.test(href)) continue;
      if (a.closest("nav,footer,header,aside")) continue;
      const text = (a.textContent || "").trim().replace(/\s+/g, " ");
      if (text.length < 3 || text.length > 200 || SKIP_TEXT.test(text)) continue;
      if (seen.has(href)) continue;
      seen.add(href);
      const m = text.match(/\b(19|20)\d{2}\b/);
      out.push({ title: text, year: m ? Number(m[0]) : null, href });
    }
    return out.slice(0, 40);
  });
}

/**
 * Generic Playwright scraper for sources that do NOT expose /api/movies.
 * Tries common search-URL patterns, then a search-box fallback, and extracts
 * anchor-based movie candidates (title/year/url). Best-effort.
 */
export async function scrapeMovies(base, query, { timeout = 30000 } = {}) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    let items = [];

    if (query) {
      const q = encodeURIComponent(query);
      const searchUrls = [`${base}/?s=${q}`, `${base}/search?query=${q}`, `${base}/search?q=${q}`];
      for (const url of searchUrls) {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout }).catch(() => {});
        await page.waitForTimeout(2500);
        items = await extractItems(page).catch(() => []);
        if (items.length) break;
      }
      if (!items.length) {
        // Fallback: interact with an on-page search box.
        await page.goto(base, { waitUntil: "domcontentloaded", timeout }).catch(() => {});
        const box = await page.$(SEARCH_SELECTOR);
        if (box) {
          await box.fill(query).catch(() => {});
          await box.press("Enter").catch(() => {});
          await page.waitForTimeout(2500);
          items = await extractItems(page).catch(() => []);
        }
      }
    } else {
      await page.goto(base, { waitUntil: "domcontentloaded", timeout }).catch(() => {});
      await page.waitForTimeout(2000);
      items = await extractItems(page).catch(() => []);
    }

    return items.map((it) => ({
      id: `scrape-${hash(it.href)}`,
      title: it.title,
      year: it.year,
      runtime_min: null,
      license: "Unknown (user source)",
      director: null,
      url: absUrl(base, it.href),
    }));
  } finally {
    await browser.close();
  }
}

const MEDIA_RE = /\.(mp4|mkv|webm|m4v|avi|mov)(\?|#|$)/i;

export function isMediaUrl(url) {
  return MEDIA_RE.test(String(url || ""));
}

/**
 * Opens a detail/post page and tries to resolve a direct media or download link.
 * Returns an absolute URL string, or null if none is found.
 */
export async function resolveDownloadUrl(url, { timeout = 30000 } = {}) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout }).catch(() => {});
    await page.waitForTimeout(2000);
    const found = await page.evaluate(() => {
      const MEDIA = /\.(mp4|mkv|webm|m4v|avi|mov)(\?|#|$)/i;
      const AD_HOST = /adfractal|doubleclick|googlesyndication|ads?\.[a-z]|\/ads?\//i;
      const anchors = Array.from(document.querySelectorAll("a[href]")).filter((a) => !AD_HOST.test(a.href));
      const media = anchors.find((a) => MEDIA.test(a.href));
      if (media) return media.href;
      const dl = anchors.find(
        (a) =>
          /download|descargar|fast download|download now/i.test((a.textContent || "").trim()) &&
          !/how[- ]?to[- ]?download|download[- ]?help|how.*download/i.test(a.href + " " + (a.textContent || ""))
      );
      if (dl && dl.href) return dl.href;
      return null;
    });
    return found || null;
  } catch {
    return null;
  } finally {
    await browser.close();
  }
}
const API = "https://en.wikisource.org/w/api.php";
const UA = { "User-Agent": "OpenBooks/1.1 (local; +https://github.com/santidevve/mini-tools-built-with-python)" };

export function detect(base) {
  return /wikisource\.org/i.test(String(base));
}

export async function search(query, { limit = 24 } = {}) {
  const url =
    `${API}?action=query&list=search&srsearch=${encodeURIComponent(query)}` +
    `&srlimit=${limit}&format=json&origin=*`;
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Wikisource ${res.status}`);
  const data = await res.json();
  return (data?.query?.search || []).map((r) => ({
    id: `wikisource-${String(r.title).replace(/[^a-z0-9]+/gi, "-")}`,
    title: r.title,
    author: null,
    year: null,
    language: "en",
    format: null,
    license: "Public Domain",
    source: "https://en.wikisource.org",
    url: `https://en.wikisource.org/wiki/${encodeURIComponent(String(r.title).replace(/ /g, "_"))}`,
    cover_url: null,
    formats: {},
  }));
}

export function resolve() {
  // Sin enlace directo: el fallback Playwright resuelve EPUB/HTML en la página.
  return null;
}
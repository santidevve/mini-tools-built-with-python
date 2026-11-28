const API = "https://openlibrary.org";
const UA = { "User-Agent": "OpenBooks/1.1 (local; +https://github.com/santidevve/mini-tools-built-with-python)" };

export function detect(base) {
  return /openlibrary\.org/i.test(String(base));
}

function toBook(d) {
  const key = d.key || "";
  const olid = (d.edition_key && d.edition_key[0]) || null;
  return {
    id: `openlibrary-${String(key || d.title).replace(/[^a-z0-9]+/gi, "-")}`,
    title: d.title,
    author: (d.author_name && d.author_name[0]) || null,
    year: d.first_publish_year ?? null,
    language: (d.language && d.language[0]) || null,
    format: null,
    license: "Open",
    source: API,
    url: key ? `${API}${key}` : null,
    cover_url: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : null,
    formats: {},
    olid,
    workKey: key,
  };
}

export async function search(query, { limit = 24 } = {}) {
  const url = `${API}/search.json?q=${encodeURIComponent(query)}&limit=${limit}`;
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`OpenLibrary ${res.status}`);
  const data = await res.json();
  return (data.docs || []).map(toBook);
}

export async function resolve(book) {
  // 1) Edición directa con ocaid (Internet Archive) si la hay.
  if (book.olid) {
    try {
      const res = await fetch(`${API}/books/${book.olid}.json`, { headers: UA, signal: AbortSignal.timeout(15000) });
      if (res.ok) {
        const ed = await res.json();
        if (ed.ocaid) return `https://archive.org/download/${ed.ocaid}`;
      }
    } catch {
      /* continue */
    }
  }
  // 2) Lista de ediciones: preferir una con ocaid; si no, devolver la página de
  //    una edición (HTML) para que el fallback Playwright resuelva EPUB/TXT.
  const workKey = book.workKey || (book.id || "").replace(/^openlibrary-/, "");
  if (workKey) {
    try {
      const res = await fetch(`${API}${workKey}/editions.json?limit=20`, { headers: UA, signal: AbortSignal.timeout(15000) });
      if (res.ok) {
        const data = await res.json();
        const entries = data.entries || [];
        const withOcaid = entries.find((e) => e.ocaid);
        if (withOcaid) return `https://archive.org/download/${withOcaid}`;
        const first = entries[0];
        if (first && first.key) return `${API}${first.key}`;
      }
    } catch {
      /* fall through */
    }
  }
  return null;
}
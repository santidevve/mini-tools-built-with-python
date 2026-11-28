const API = "https://gutendex.com/books";
const UA = { "User-Agent": "OpenBooks/1.1 (local; +https://github.com/santidevve/mini-tools-built-with-python)" };

export function detect(base) {
  return /gutendex\.com|gutenberg\.org/i.test(String(base));
}

function pickFormats(formats = {}) {
  return {
    epub: formats["application/epub+zip"] || null,
    txt: formats["text/plain; charset=utf-8"] || formats["text/plain"] || null,
    html: formats["text/html"] || null,
    pdf: formats["application/pdf"] || null,
  };
}

function toBook(r) {
  const f = pickFormats(r.formats);
  const format = f.epub ? "epub" : f.txt ? "txt" : f.html ? "html" : f.pdf ? "pdf" : null;
  const url = f.epub || f.txt || f.html || f.pdf || null;
  return {
    id: `gutenberg-${r.id}`,
    title: r.title,
    author: (r.authors && r.authors[0] && r.authors[0].name) || null,
    year: r.first_publish_year ?? null,
    language: (r.languages && r.languages[0]) || null,
    format,
    license: "Public Domain",
    source: "https://gutendex.com",
    url,
    cover_url: (r.formats && r.formats["image/jpeg"]) || null,
    formats: f,
  };
}

export async function search(query, { limit = 24 } = {}) {
  const url = `${API}?search=${encodeURIComponent(query)}&page_size=${limit}`;
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Gutendex ${res.status}`);
  const data = await res.json();
  return (data.results || []).map(toBook);
}

export function resolve(book) {
  const f = book.formats || {};
  return f.epub || f.txt || f.html || f.pdf || book.url || null;
}
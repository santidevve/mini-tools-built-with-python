const UA = { "User-Agent": "OpenBooks/1.1 (local; +https://github.com/santidevve/mini-tools-built-with-python)" };

export function detect(base) {
  return /archive\.org/i.test(String(base));
}

function toBook(d) {
  return {
    id: `archive-${d.identifier}`,
    title: d.title || d.identifier,
    author: (d.creator && (Array.isArray(d.creator) ? d.creator[0] : d.creator)) || null,
    year: d.year ? Number(d.year) : null,
    language: (d.language && (Array.isArray(d.language) ? d.language[0] : d.language)) || null,
    format: null,
    license: "Public Domain",
    source: "https://archive.org",
    url: `https://archive.org/details/${d.identifier}`,
    cover_url: `https://archive.org/services/img/${d.identifier}`,
    formats: {},
    identifier: d.identifier,
  };
}

export async function search(query, { limit = 24 } = {}) {
  const q = encodeURIComponent(`${query} AND mediatype:texts`);
  const url =
    `https://archive.org/advancedsearch.php?q=${q}` +
    `&fl[]=identifier&fl[]=title&fl[]=creator&fl[]=year&fl[]=language` +
    `&rows=${limit}&page=1&output=json`;
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Archive.org ${res.status}`);
  const data = await res.json();
  return (data?.response?.docs || []).map(toBook);
}

function pickFile(files = []) {
  const by = (re) => files.find((f) => re.test(f.format || "") || re.test(f.name || ""));
  const epub = by(/epub/i);
  if (epub) return { file: epub, format: "epub" };
  const txt = by(/plain text|text\/plain|\.txt$/i);
  if (txt) return { file: txt, format: "txt" };
  const pdf = by(/pdf/i);
  if (pdf) return { file: pdf, format: "pdf" };
  const html = by(/html/i);
  if (html) return { file: html, format: "html" };
  return null;
}

export async function resolve(book) {
  const id = book.identifier || String(book.id).replace(/^archive-/, "");
  try {
    const res = await fetch(`https://archive.org/metadata/${id}`, { headers: UA, signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    const meta = await res.json();
    const picked = pickFile(meta.files || []);
    if (!picked) return null;
    book.format = picked.format;
    book.formats = book.formats || {};
    book.formats[picked.format] = `https://archive.org/download/${id}/${encodeURIComponent(picked.file.name)}`;
    return book.formats[picked.format];
  } catch {
    return null;
  }
}
const STOPWORDS = new Set([
  "busca","buscame","buscar","encuentra","encontrar","descarga","descargar","download","find","get",
  "the","a","an","of","de","la","el","los","las","un","una","y","por","para","with","and",
  "libro","libros","book","books","novela","novelas",
]);

function normalize(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export class AIAgent {
  constructor(opts = {}) {
    this.model = opts.model || process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
    this.apiKey = opts.apiKey || process.env.GROQ_API_KEY;
    this.endpoint = "https://api.groq.com/openai/v1/chat/completions";
  }

  licenseAllowed(book) {
    const lic = String(book.license || "").toLowerCase();
    // Fuentes añadidas por el usuario (allowlist) pueden devolver licencia desconocida.
    if (!lic || lic.includes("unknown")) return true;
    return /public domain|creative commons|cc0|cc by|cc-by|cc-|open/i.test(lic);
  }

  _heuristicCriteria(goal) {
    const g = String(goal);
    const yearMatch = g.match(/\b(1[5-9]|20)\d{2}\b/);
    const authorMatch = g.match(/\b(?:de|por|by)\s+([A-Z][\p{L}'-]+(?:\s+[A-Z][\p{L}'-]+){0,3})/u);
    const lang = /\b(ingles|ingl[eé]s|english|en)\b/i.test(g)
      ? "en"
      : /\b(espa[nñ]ol|spanish|es)\b/i.test(g)
        ? "es"
        : null;
    const fmt = /\b(epub|pdf|txt|texto|html)\b/i.test(g)
      ? (g.match(/\b(epub|pdf|txt|texto|html)\b/i) || [])[1].toLowerCase()
      : null;
    const words = normalize(g)
      .split(" ")
      .filter((w) => w && !STOPWORDS.has(w) && !/^\d+$/.test(w));
    return {
      title: words.join(" ").slice(0, 60),
      author: authorMatch ? authorMatch[1] : null,
      year: yearMatch ? Number(yearMatch[0]) : null,
      language: lang,
      format: fmt === "texto" ? "txt" : fmt,
      license: /creative commons|\bcc\b/i.test(g) ? "Creative Commons" : null,
    };
  }

  async extract(goal) {
    if (this.apiKey) {
      try {
        const res = await fetch(this.endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
          body: JSON.stringify({
            model: this.model,
            temperature: 0,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: 'Extract book search criteria. Reply ONLY JSON: {"title":string|null,"author":string|null,"year":number|null,"language":string|null,"format":string|null,"license":string|null}.' },
              { role: "user", content: goal },
            ],
          }),
        });
        const data = await res.json();
        const parsed = JSON.parse(data?.choices?.[0]?.message?.content || "{}");
        return { ...this._heuristicCriteria(goal), ...parsed };
      } catch {
        /* fall through */
      }
    }
    return this._heuristicCriteria(goal);
  }

  _heuristicRank(goal, books, criteria) {
    const title = normalize(criteria.title || goal);
    const author = normalize(criteria.author || "");
    const tokens = title.split(" ").filter(Boolean);
    return books
      .map((b) => {
        const hay = normalize(`${b.title} ${b.author || ""}`);
        let overlap = 0;
        for (const t of tokens) if (hay.includes(t)) overlap++;
        const titleScore = tokens.length ? overlap / tokens.length : 0;
        const authorScore = author && normalize(b.author || "").includes(author) ? 1 : 0;
        const yearScore = criteria.year && b.year === criteria.year ? 1 : 0;
        const langScore = criteria.language && b.language === criteria.language ? 1 : 0;
        const licScore = this.licenseAllowed(b) ? 1 : 0;
        const score =
          titleScore * 0.5 + authorScore * 0.2 + yearScore * 0.15 + langScore * 0.1 + licScore * 0.05;
        return {
          ...b,
          score: Number(score.toFixed(3)),
          reasons: { titleScore, authorScore, yearScore, langScore, licScore },
        };
      })
      .filter((b) => b.score > 0.15)
      .sort((a, b) => b.score - a.score);
  }

  async rank(goal, books, criteria) {
    const allowed = books.filter((b) => this.licenseAllowed(b));
    if (this.apiKey) {
      try {
        const sample = allowed.slice(0, 60).map((b) => ({
          id: b.id,
          title: b.title,
          author: b.author,
          year: b.year,
          language: b.language,
          format: b.format,
          license: b.license,
        }));
        const res = await fetch(this.endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
          body: JSON.stringify({
            model: this.model,
            temperature: 0,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: 'Rank the best matching books. Reply ONLY JSON: {"candidates":[{"id":string,"score":number,"reason":string}]} using only ids from the list.' },
              { role: "user", content: JSON.stringify({ goal, criteria, books: sample }) },
            ],
          }),
        });
        const data = await res.json();
        const parsed = JSON.parse(data?.choices?.[0]?.message?.content || "{}");
        if (Array.isArray(parsed.candidates)) {
          const byId = new Map(books.map((b) => [b.id, b]));
          return parsed.candidates
            .map((c) => ({ ...(byId.get(c.id) || {}), score: c.score, reasons: c.reason }))
            .filter((b) => b.id)
            .sort((a, b) => b.score - a.score);
        }
      } catch {
        /* fall through */
      }
    }
    return this._heuristicRank(goal, allowed, criteria);
  }

  async plan(goal, books) {
    const criteria = await this.extract(goal);
    const ranked = await this.rank(goal, books, criteria);
    if (ranked.length) return ranked.slice(0, 5).map((b) => b.id);
    return this._heuristicRank(goal, books, criteria)
      .slice(0, 5)
      .map((b) => b.id);
  }
}
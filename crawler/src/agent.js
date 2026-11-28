const STOPWORDS = new Set([
  "busca","buscame","buscar","encuentra","encontrar","descarga","descargar","download","find","get",
  "the","a","an","of","de","la","el","los","las","un","una","y","por","para","with","and","movie","film","pelicula","pelicula",
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

  licenseAllowed(movie) {
    const lic = String(movie.license || "").toLowerCase();
    // Fuentes añadidas por el usuario (allowlist) pueden devolver licencia desconocida.
    if (!lic || lic.includes("unknown")) return true;
    return /public domain|creative commons|cc0|cc by|cc-by|cc-/i.test(lic);
  }

  _heuristicCriteria(goal) {
    const yearMatch = String(goal).match(/\b(19|20)\d{2}\b/);
    const durMatch = String(goal).match(/(\d{2,3})\s*(?:min|minutos|minutes)/i);
    const words = normalize(goal)
      .split(" ")
      .filter((w) => w && !STOPWORDS.has(w) && !/^\d+$/.test(w));
    return {
      title: words.join(" ").slice(0, 60),
      year: yearMatch ? Number(yearMatch[0]) : null,
      duration_min: durMatch ? Number(durMatch[1]) : null,
      license: /creative commons|\bcc\b/i.test(goal) ? "Creative Commons" : null,
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
              { role: "system", content: 'Extract movie search criteria. Reply ONLY JSON: {"title":string|null,"year":number|null,"duration_min":number|null,"license":string|null}.' },
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

  _heuristicRank(goal, movies, criteria) {
    const title = normalize(criteria.title || goal);
    const tokens = title.split(" ").filter(Boolean);
    return movies
      .map((m) => {
        const hay = normalize(`${m.title} ${m.director}`);
        let overlap = 0;
        for (const t of tokens) if (hay.includes(t)) overlap++;
        const titleScore = tokens.length ? overlap / tokens.length : 0;
        const yearScore = criteria.year && m.year === criteria.year ? 1 : 0;
        const licScore = this.licenseAllowed(m) ? 1 : 0;
        const score = titleScore * 0.65 + yearScore * 0.25 + licScore * 0.1;
        return { ...m, score: Number(score.toFixed(3)), reasons: { titleScore, yearScore, licScore } };
      })
      .filter((m) => m.score > 0.15)
      .sort((a, b) => b.score - a.score);
  }

  async rank(goal, movies, criteria) {
    const allowed = movies.filter((m) => this.licenseAllowed(m));
    if (this.apiKey) {
      try {
        const sample = allowed.slice(0, 60).map((m) => ({ id: m.id, title: m.title, year: m.year, runtime_min: m.runtime_min, license: m.license }));
        const res = await fetch(this.endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
          body: JSON.stringify({
            model: this.model,
            temperature: 0,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: 'Rank the best matching movies. Reply ONLY JSON: {"candidates":[{"id":string,"score":number,"reason":string}]} using only ids from the list.' },
              { role: "user", content: JSON.stringify({ goal, criteria, movies: sample }) },
            ],
          }),
        });
        const data = await res.json();
        const parsed = JSON.parse(data?.choices?.[0]?.message?.content || "{}");
        if (Array.isArray(parsed.candidates)) {
          const byId = new Map(movies.map((m) => [m.id, m]));
          return parsed.candidates
            .map((c) => ({ ...(byId.get(c.id) || {}), score: c.score, reasons: c.reason }))
            .filter((m) => m.id)
            .sort((a, b) => b.score - a.score);
        }
      } catch {
        /* fall through */
      }
    }
    return this._heuristicRank(goal, allowed, criteria);
  }

  async plan(goal, movies) {
    const criteria = await this.extract(goal);
    const ranked = await this.rank(goal, movies, criteria);
    if (ranked.length) return ranked.slice(0, 5).map((m) => m.id);
    return this._heuristicRank(goal, movies, criteria)
      .slice(0, 5)
      .map((m) => m.id);
  }
}
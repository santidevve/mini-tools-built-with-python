import path from "node:path";
import { fileURLToPath } from "node:url";
import { stat } from "node:fs/promises";
import { Store } from "./store.js";
import { AIAgent } from "./agent.js";
import { fetchBooks, captureCover, isUrlAllowed } from "./playwright-crawler.js";
import { scrapeMovies, resolveDownloadUrl, isMediaUrl } from "./scraper.js";
import { resolve as resolveSource, detect as detectSource } from "./sources/index.js";
import { downloadBook } from "./downloader.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(here, "..", "downloads");
const SHOTS_DIR = path.resolve(here, "..", "screenshots");

const TERMINAL = new Set(["done", "error", "cancelled"]);
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

export class Manager {
  constructor({ emit } = {}) {
    this.store = new Store();
    this.agent = new AIAgent();
    this.emit = emit || (() => {});
    this.running = new Set();
    this.controllers = new Map();
    this.lastEmit = new Map();
  }

  get maxParallel() {
    return clamp(Number(this.store.getSettings().maxParallel) || 2, 1, 8);
  }

  broadcast(type, payload) {
    this.emit(type, payload);
  }

  chooseBases() {
    const sources = this.store.getSources().filter((s) => s.allowed);
    const seen = new Set();
    const bases = [];
    for (const s of sources) {
      try {
        const url = new URL(s.base_url).toString().replace(/\/$/, "");
        if (seen.has(url)) continue;
        seen.add(url);
        bases.push(url);
      } catch {
        /* skip invalid source */
      }
    }
    return bases.length ? bases : ["http://127.0.0.1:5000"];
  }

  chooseBase() {
    const bases = this.chooseBases();
    const local = bases.find((b) => /127\.0\.0\.1|localhost/.test(b));
    return local || bases[0];
  }

  createJob({ query, voice } = {}) {
    const job = {
      id: `job-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      query_raw: String(query || "").trim(),
      voice: Boolean(voice),
      status: "queued",
      progress: 0,
      speed: 0,
      eta: null,
      criteria: null,
      candidates: [],
      chosen: null,
      cover: null,
      file_path: null,
      bytes: 0,
      error: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      events: [],
    };
    this.store.addJob(job);
    this.store.addEvent(job.id, "decision", { status: "queued", query: job.query_raw });
    this.broadcast("job.update", this.publicJob(job));
    this.schedule();
    return job;
  }

  publicJob(job) {
    return {
      id: job.id,
      query: job.query_raw,
      voice: job.voice,
      status: job.status,
      progress: job.progress,
      speed: job.speed,
      eta: job.eta,
      criteria: job.criteria,
      candidates: job.candidates,
      chosen: job.chosen,
      cover: job.cover,
      file_path: job.file_path,
      bytes: job.bytes,
      error: job.error,
      created_at: job.created_at,
      updated_at: job.updated_at,
    };
  }

  updateSettings(patch) {
    const settings = this.store.updateSettings(patch);
    this.broadcast("settings.update", settings);
    this.schedule();
    return settings;
  }

  schedule() {
    while (this.running.size < this.maxParallel) {
      const next = this.store.getJobs().find((j) => j.status === "queued");
      if (!next) break;
      this.start(next);
    }
  }

  start(job) {
    this.running.add(job.id);
    const controller = new AbortController();
    this.controllers.set(job.id, controller);
    this.process(job, controller.signal)
      .catch((err) => this.fail(job, err))
      .finally(() => {
        this.running.delete(job.id);
        this.controllers.delete(job.id);
        this.schedule();
      });
  }

  async process(job, signal) {
    // Usuario ya eligió candidato: descargar directo sin rebuscar.
    if (job.preselected) {
      const chosen = job.preselected;
      delete job.preselected;
      await this.download(job, chosen, chosen.source || this.chooseBase(), signal);
      return;
    }

    const bases = this.chooseBases();
    job.status = "searching";
    this.store.addEvent(job.id, "plan", { bases });
    this.touch(job);

    const criteria = await this.agent.extract(job.query_raw);
    job.criteria = criteria;
    this.store.addEvent(job.id, "decision", { criteria });
    this.touch(job);

    const merged = [];
    for (const base of bases) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      let books;
      try {
        books = await fetchBooks(base, job.query_raw);
        this.store.addEvent(job.id, "observation", { base, fetched: books.length, via: "api" });
      } catch (err) {
        // Fuente con adaptador que falla (p. ej. caída/red): no se scrapea, se salta.
        if (detectSource(base)) {
          this.store.addEvent(job.id, "observation", { base, error: String(err?.message || err), via: "api" });
          continue;
        }
        try {
          books = await scrapeMovies(base, job.query_raw);
          this.store.addEvent(job.id, "observation", { base, fetched: books.length, via: "playwright" });
        } catch (e) {
          this.store.addEvent(job.id, "observation", { base, error: String(e?.message || e) });
          continue;
        }
      }
      const ranked = await this.agent.rank(job.query_raw, books, criteria);
      for (const m of ranked) merged.push({ ...m, source: base });
    }

    merged.sort((a, b) => (b.score || 0) - (a.score || 0));
    const seen = new Set();
    job.candidates = merged
      .filter((m) => {
        const key = `${m.id}@${m.source}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 8)
      .map((m) => ({
        id: m.id,
        title: m.title,
        author: m.author || null,
        year: m.year,
        language: m.language || null,
        format: m.format || null,
        license: m.license,
        score: m.score,
        reasons: m.reasons,
        source: m.source,
        url: m.url || null,
      }));
    this.store.addEvent(job.id, "observation", { candidates: job.candidates.length });
    this.touch(job);

    if (job.candidates.length === 0) {
      job.status = "error";
      job.error = "No candidates matched the request on allowed sources.";
      this.store.addEvent(job.id, "decision", { error: job.error });
      this.touch(job);
      return;
    }

    const ambiguous =
      job.candidates.length > 1 &&
      Math.abs(job.candidates[0].score - job.candidates[1].score) < 0.08;

    if (ambiguous && !job.chosen) {
      job.status = "needs_input";
      this.store.addEvent(job.id, "decision", { need_choice: true });
      this.touch(job);
      return;
    }

    const chosen = job.chosen
      ? job.candidates.find((c) => c.id === job.chosen) || job.candidates[0]
      : job.candidates[0];
    job.chosen = chosen.id;
    await this.download(job, chosen, chosen.source || this.chooseBase(), signal);
  }

  async download(job, chosen, base, signal) {
    job.status = "downloading";
    this.store.addEvent(job.id, "decision", { chosen: chosen.id });
    this.touch(job);

    // Resolver el enlace de descarga real (adaptador JSON o fallback Playwright).
    let dlBook = chosen;
    if (chosen.url && !isMediaUrl(chosen.url)) {
      let resolved = await resolveSource(chosen.source || base, chosen).catch(() => null);
      if (resolved && !isMediaUrl(resolved)) {
        const scraped = await resolveDownloadUrl(resolved).catch(() => null);
        if (scraped) resolved = scraped;
      } else if (!resolved) {
        const scraped = await resolveDownloadUrl(chosen.url).catch(() => null);
        if (scraped) resolved = scraped;
      }
      if (!resolved || !isMediaUrl(resolved)) {
        job.status = "error";
        job.error = "No se pudo resolver el enlace de descarga en la fuente.";
        this.store.addEvent(job.id, "decision", { error: job.error, url: chosen.url });
        this.touch(job);
        return;
      }
      dlBook = { ...chosen, url: resolved, format: chosen.format || guessFormat(resolved) };
      this.store.addEvent(job.id, "action", { resolved });
      this.touch(job);
    }

    const coverUrl = chosen.url || chosen.source;
    if (isUrlAllowed(coverUrl, this.store.getSources())) {
      try {
        const cover = await captureCover(chosen, path.join(SHOTS_DIR, job.id, "detail.png"));
        if (cover) {
          job.cover = `/covers/${job.id}/detail.png`;
          this.store.addEvent(job.id, "action", { cover: job.cover });
          this.touch(job);
        }
      } catch {
        /* covers are best-effort */
      }
    }

    const started = Date.now();
    const file = await downloadBook(null, null, base, dlBook, OUT_DIR, this.store.getSettings().idleTimeout || 60000, signal, (loaded, total) => {
      const pct = total ? clamp(Math.floor((loaded / total) * 100), 0, 100) : 0;
      const secs = Math.max(0.001, (Date.now() - started) / 1000);
      const speed = loaded / secs;
      const eta = total && speed > 0 ? Math.round((total - loaded) / speed) : null;
      const changed = pct !== job.progress;
      job.progress = pct;
      job.speed = Math.round(speed);
      job.eta = eta;
      if (changed) this.touch(job, true);
    });

    job.status = "done";
    job.progress = 100;
    job.file_path = file;
    job.bytes = await stat(file).then((s) => s.size).catch(() => 0);
    this.store.addEvent(job.id, "decision", { file, done: true });
    this.touch(job);
    this.broadcast("job.done", { id: job.id, file, chosen: job.chosen });
  }

  fail(job, err) {
    if (signalIsAbort(err)) return;
    job.status = "error";
    job.error = String(err?.message || err);
    this.store.addEvent(job.id, "decision", { error: job.error });
    this.touch(job);
  }

  touch(job, throttle = false) {
    job.updated_at = new Date().toISOString();
    this.store.persist();
    if (throttle) {
      const now = Date.now();
      const last = this.lastEmit.get(job.id) || 0;
      if (now - last < 250) return;
      this.lastEmit.set(job.id, now);
    }
    this.broadcast("job.update", this.publicJob(job));
  }

  pauseJob(id) {
    const job = this.store.getJob(id);
    if (!job || TERMINAL.has(job.status)) return null;
    if (job.status === "downloading" || job.status === "searching") {
      this.controllers.get(id)?.abort();
      job.status = "paused";
      this.store.addEvent(id, "decision", { paused: true });
      this.touch(job);
    } else if (job.status === "queued") {
      job.status = "paused";
      this.touch(job);
    }
    return this.publicJob(job);
  }

  resumeJob(id) {
    const job = this.store.getJob(id);
    if (!job) return null;
    if (job.status === "paused") {
      job.status = job.candidates.length && !job.chosen ? "needs_input" : "queued";
      job.error = null;
      this.store.addEvent(id, "decision", { resumed: true });
      this.touch(job);
      this.schedule();
    }
    return this.publicJob(job);
  }

  cancelJob(id) {
    const job = this.store.getJob(id);
    if (!job) return null;
    this.controllers.get(id)?.abort();
    if (!TERMINAL.has(job.status)) {
      job.status = "cancelled";
      this.store.addEvent(id, "decision", { cancelled: true });
      this.touch(job);
    }
    return this.publicJob(job);
  }

  chooseCandidate(id, candidateId) {
    const job = this.store.getJob(id);
    if (!job) return null;
    const candidate = job.candidates.find((c) => c.id === candidateId);
    if (!candidate) return null;
    job.chosen = candidate.id;
    job.preselected = candidate;
    job.status = "queued";
    this.store.addEvent(id, "decision", { chosen: candidate.id, by: "user" });
    this.touch(job);
    this.schedule();
    return this.publicJob(job);
  }

  getJobs() {
    return this.store.getJobs().map((j) => this.publicJob(j));
  }

  getJob(id) {
    const job = this.store.getJob(id);
    return job ? this.publicJob(job) : null;
  }

  getEvents(id) {
    return this.store.getJob(id)?.events || [];
  }
}

function signalIsAbort(err) {
  return err?.name === "AbortError" || err?.message === "This operation was aborted";
}

function guessFormat(url) {
  const m = String(url).match(/\.(epub|txt|pdf|html?)(?:\?|#|$)/i);
  return m ? m[1].toLowerCase() : null;
}
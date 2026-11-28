import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(here, "..", "data");
const stateFile = path.join(dataDir, "state.json");

const DEFAULT_SOURCES = [
  { id: "archive.org", name: "Internet Archive", base_url: "https://archive.org", allowed: true, kind: "Public Domain & CC" },
  { id: "public-cinema", name: "Public Cinema (local)", base_url: "http://127.0.0.1:5000", allowed: true, kind: "Curated" },
];

function blank() {
  return { jobs: [], sources: DEFAULT_SOURCES, settings: { model: "llama-3.3-70b-versatile", headless: true, maxParallel: 2, idleTimeout: 60000 } };
}

function load() {
  if (!existsSync(stateFile)) return blank();
  try {
    return { ...blank(), ...JSON.parse(readFileSync(stateFile, "utf8")) };
  } catch {
    return blank();
  }
}

function save(state) {
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(stateFile, JSON.stringify(state, null, 2));
}

export class Store {
  constructor() {
    this.state = load();
    this.backfillSourceIds();
  }

  backfillSourceIds() {
    let changed = false;
    this.state.sources = (this.state.sources || []).map((s, i) => {
      if (s && s.id) return s;
      changed = true;
      return { ...s, id: `src-${Date.now()}-${i}` };
    });
    if (changed) this.persist();
  }

  persist() {
    save(this.state);
  }

  getSettings() {
    return this.state.settings;
  }

  updateSettings(patch) {
    this.state.settings = { ...this.state.settings, ...patch };
    this.persist();
    return this.state.settings;
  }

  getSources() {
    return this.state.sources;
  }

  addSource(src) {
    const item = {
      ...src,
      id: src.id || `src-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      allowed: src.allowed !== undefined ? src.allowed : true,
    };
    this.state.sources.push(item);
    this.persist();
    return item;
  }

  removeSource(idOrKey) {
    const before = this.state.sources.length;
    this.state.sources = this.state.sources.filter(
      (s) => s.id !== idOrKey && s.base_url !== idOrKey && s.name !== idOrKey
    );
    this.persist();
    return this.state.sources.length < before;
  }

  getJobs() {
    return this.state.jobs;
  }

  getJob(id) {
    return this.state.jobs.find((j) => j.id === id);
  }

  addJob(job) {
    this.state.jobs.unshift(job);
    this.persist();
    return job;
  }

  updateJob(id, patch) {
    const job = this.getJob(id);
    if (!job) return null;
    Object.assign(job, patch, { updated_at: new Date().toISOString() });
    this.persist();
    return job;
  }

  addEvent(jobId, kind, payload) {
    const job = this.getJob(jobId);
    if (!job) return;
    job.events = job.events || [];
    job.events.push({ ts: new Date().toISOString(), kind, payload });
    if (job.events.length > 200) job.events.shift();
    this.persist();
  }
}
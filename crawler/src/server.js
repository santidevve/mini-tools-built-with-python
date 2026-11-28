import express from "express";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { Manager } from "./pipeline.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "..");
const GUI_DIST = path.resolve(ROOT, "..", "gui", "dist");
const SHOTS_DIR = path.resolve(ROOT, "screenshots");
const PORT = Number(process.env.CRAWLER_PORT || 4310);

const app = express();
app.use(express.json({ limit: "256kb" }));

let wss;
function broadcast(type, payload) {
  if (!wss) return;
  const msg = JSON.stringify({ type, payload });
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(msg);
  }
}

const manager = new Manager({ emit: broadcast });

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    sources: manager.chooseBase(),
    model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
    ai: Boolean(process.env.GROQ_API_KEY),
  });
});

app.post("/jobs", (req, res) => {
  const { query, voice } = req.body || {};
  if (!query || !String(query).trim()) {
    return res.status(400).json({ error: "A book request is required." });
  }
  const job = manager.createJob({ query, voice });
  res.status(201).json(manager.publicJob(job));
});

app.get("/jobs", (_req, res) => res.json(manager.getJobs()));
app.get("/jobs/:id", (req, res) => {
  const job = manager.getJob(req.params.id);
  if (!job) return res.status(404).json({ error: "Job not found." });
  res.json(job);
});
app.get("/jobs/:id/events", (req, res) => {
  const events = manager.getEvents(req.params.id);
  if (!events.length && !manager.getJob(req.params.id)) {
    return res.status(404).json({ error: "Job not found." });
  }
  res.json(events);
});

app.post("/jobs/:id/cancel", (req, res) => {
  const job = manager.cancelJob(req.params.id);
  if (!job) return res.status(404).json({ error: "Job not found." });
  res.json(job);
});
app.post("/jobs/:id/pause", (req, res) => {
  const job = manager.pauseJob(req.params.id);
  if (!job) return res.status(404).json({ error: "Job not found." });
  res.json(job);
});
app.post("/jobs/:id/resume", (req, res) => {
  const job = manager.resumeJob(req.params.id);
  if (!job) return res.status(404).json({ error: "Job not found." });
  res.json(job);
});
app.post("/jobs/:id/choose", (req, res) => {
  const { candidateId } = req.body || {};
  const job = manager.chooseCandidate(req.params.id, candidateId);
  if (!job) return res.status(404).json({ error: "Job or candidate not found." });
  res.json(job);
});

app.get("/sources", (_req, res) => res.json(manager.store.getSources()));
app.post("/sources", (req, res) => {
  const { id, name, base_url, kind } = req.body || {};
  if (!name || !base_url) {
    return res.status(400).json({ error: "A source name and base_url are required." });
  }
  const source = manager.store.addSource({ id, name, base_url, kind });
  res.status(201).json(source);
});
app.delete("/sources/:id", (req, res) => {
  const removed = manager.store.removeSource(req.params.id);
  if (!removed) return res.status(404).json({ error: "Source not found." });
  res.status(204).end();
});

app.get("/settings", (_req, res) => res.json(manager.store.getSettings()));
app.put("/settings", (req, res) => res.json(manager.updateSettings(req.body || {})));

app.use("/covers", express.static(SHOTS_DIR));
app.use(express.static(GUI_DIST));

const server = createServer(app);
wss = new WebSocketServer({ server, path: "/ws" });
wss.on("connection", (ws) => {
  ws.send(JSON.stringify({ type: "snapshot", payload: { jobs: manager.getJobs(), settings: manager.store.getSettings() } }));
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Crawler GUI + API listening on http://127.0.0.1:${PORT}`);
  console.log(`AI: ${process.env.GROQ_API_KEY ? "Groq enabled" : "heuristics only (set GROQ_API_KEY)"}`);
});
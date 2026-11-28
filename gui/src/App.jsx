import { useCallback, useEffect, useRef, useState } from "react";
import { driver } from "driver.js";
import "driver.js/dist/driver.css";

const STATUS_LABEL = {
  queued: "En cola",
  searching: "Buscando",
  needs_input: "Elige una versión",
  downloading: "Descargando",
  paused: "Pausado",
  error: "Error",
  done: "Hecho",
  cancelled: "Cancelado",
};

function fmtBytes(b) {
  if (!b) return "0 B";
  const u = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(u.length - 1, Math.floor(Math.log(b) / Math.log(1024)));
  return `${(b / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
}

function fmtEta(s) {
  if (s == null) return "—";
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

async function api(path, opts) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) throw new Error(`${res.status}`);
  if (res.status === 204) return null;
  return res.json();
}

export default function App() {
  const [tab, setTab] = useState("downloads");
  const [jobs, setJobs] = useState([]);
  const [settings, setSettings] = useState({});
  const [sources, setSources] = useState([]);
  const [query, setQuery] = useState("");
  const [listening, setListening] = useState(false);
  const [selected, setSelected] = useState(null);
  const [health, setHealth] = useState(null);
  const wsRef = useRef(null);

  const refresh = useCallback(async () => {
    try {
      const [j, s, src, h] = await Promise.all([
        api("/jobs"),
        api("/settings"),
        api("/sources"),
        api("/api/health").catch(() => null),
      ]);
      setJobs(j || []);
      setSettings(s || {});
      setSources(src || []);
      setHealth(h);
    } catch {
      /* backend not ready */
    }
  }, []);

  useEffect(() => {
    refresh();
    const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
    wsRef.current = ws;
    ws.onmessage = (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (msg.type === "snapshot") {
        setJobs(msg.payload.jobs || []);
        setSettings(msg.payload.settings || {});
      } else if (msg.type === "job.update" || msg.type === "job.done") {
        const p = msg.payload;
        setJobs((prev) => {
          const idx = prev.findIndex((j) => j.id === p.id);
          if (idx === -1) return [p, ...prev];
          const next = prev.slice();
          next[idx] = { ...next[idx], ...p };
          return next;
        });
      } else if (msg.type === "settings.update") {
        setSettings(msg.payload);
      }
    };
    return () => ws.close();
  }, [refresh]);

  useEffect(() => {
    if (localStorage.getItem("cine-tour-done")) return;
    const t = setTimeout(() => {
      const d = driver({
        showProgress: true,
        steps: [
          { element: "#request-panel", popover: { title: "Pide una película", description: "Escribe o dicta lo que quieres. El agente IA la busca y la descarga." } },
          { element: "#queue-panel", popover: { title: "Cola de descargas", description: "Sigue el progreso, pausa, reanuda o cancela cada trabajo." } },
          { element: "#detail-panel", popover: { title: "Detalle y candidatos", description: "Revisa el trace del agente y elige la versión correcta si hay dudas." } },
        ],
      });
      d.drive();
      localStorage.setItem("cine-tour-done", "1");
    }, 600);
    return () => clearTimeout(t);
  }, []);

  const submit = async () => {
    if (!query.trim()) return;
    await api("/jobs", { method: "POST", body: JSON.stringify({ query, voice: false }) });
    setQuery("");
    refresh();
  };

  const startVoice = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      alert("Tu navegador no soporta dictado por voz. Usa Chrome o Edge.");
      return;
    }
    const rec = new SR();
    rec.lang = "es-ES";
    rec.interimResults = false;
    rec.onstart = () => setListening(true);
    rec.onend = () => setListening(false);
    rec.onresult = (e) => setQuery((q) => (q ? q + " " : "") + e.results[0][0].transcript);
    rec.start();
  };

  const activeJob = jobs.find((j) => j.id === selected) || jobs[0] || null;

  return (
    <div className="app">
      <header className="topbar">
        <h1>🎬 CineDownloader</h1>
        <div className="health">
          {health ? (
            <span className={health.ai ? "pill ok" : "pill warn"}>
              {health.ai ? "IA Groq activa" : "Modo heurístico"}
            </span>
          ) : (
            <span className="pill">Conectando…</span>
          )}
        </div>
        <nav className="tabs">
          {[
            ["downloads", "Descargas"],
            ["history", "Historial"],
            ["sources", "Fuentes"],
            ["settings", "Ajustes"],
          ].map(([id, label]) => (
            <button key={id} className={tab === id ? "tab active" : "tab"} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </nav>
      </header>

      {tab === "downloads" && (
        <main className="grid">
          <section className="col">
            <div id="request-panel" className="card request">
              <div className="row">
                <input
                  className="text"
                  placeholder="Ej: Busca Metropolis de 1927 y descárgala"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submit()}
                />
                <button className="mic" onClick={startVoice} title="Dictar por voz">
                  {listening ? "🔴" : "🎙️"}
                </button>
                <button className="primary" onClick={submit}>
                  Buscar y descargar
                </button>
              </div>
            </div>

            <div id="queue-panel" className="card">
              <h2>Cola</h2>
              {jobs.length === 0 && <p className="muted">Aún no hay trabajos. Pide una película arriba.</p>}
              <ul className="job-list">
                {jobs.map((j) => (
                  <li key={j.id} className={"job " + j.status + (activeJob?.id === j.id ? " sel" : "")} onClick={() => setSelected(j.id)}>
                    <div className="job-head">
                      <span className="badge">{STATUS_LABEL[j.status] || j.status}</span>
                      <span className="q">{j.query}</span>
                    </div>
                    <div className="bar">
                      <div className="fill" style={{ width: `${j.progress || 0}%` }} />
                    </div>
                    <div className="job-meta">
                      <span>{j.progress || 0}%</span>
                      {j.status === "downloading" && (
                        <span>
                          {fmtBytes(j.speed)}/s · ETA {fmtEta(j.eta)}
                        </span>
                      )}
                      {j.error && <span className="err">{j.error}</span>}
                    </div>
                    <div className="actions" onClick={(e) => e.stopPropagation()}>
                      {j.status === "downloading" || j.status === "searching" ? (
                        <button onClick={() => act(j.id, "pause")}>Pausar</button>
                      ) : j.status === "paused" ? (
                        <button onClick={() => act(j.id, "resume")}>Reanudar</button>
                      ) : null}
                      {!["done", "cancelled"].includes(j.status) && (
                        <button className="danger" onClick={() => act(j.id, "cancel")}>
                          Cancelar
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section id="detail-panel" className="col">
            {activeJob ? <Detail job={activeJob} onChoose={(cid) => choose(activeJob.id, cid)} /> : <div className="card muted">Selecciona un trabajo para ver el detalle.</div>}
          </section>
        </main>
      )}

      {tab === "history" && <History jobs={jobs} />}
      {tab === "sources" && <Sources sources={sources} onChanged={refresh} />}
      {tab === "settings" && <Settings settings={settings} onSave={async (patch) => { await api("/settings", { method: "PUT", body: JSON.stringify(patch) }); refresh(); }} />}
    </div>
  );

  async function act(id, action) {
    await api(`/jobs/${id}/${action}`, { method: "POST" });
    refresh();
  }
  async function choose(id, candidateId) {
    await api(`/jobs/${id}/choose`, { method: "POST", body: JSON.stringify({ candidateId }) });
    refresh();
  }
}

function Detail({ job, onChoose }) {
  const [events, setEvents] = useState([]);
  useEffect(() => {
    api(`/jobs/${job.id}/events`)
      .then(setEvents)
      .catch(() => setEvents([]));
  }, [job.id, job.status]);

  return (
    <div className="card detail">
      <h2>Detalle</h2>
      <p className="q">{job.query}</p>
      {job.criteria && (
        <div className="chips">
          {job.criteria.title && <span className="chip">Título: {job.criteria.title}</span>}
          {job.criteria.year && <span className="chip">Año: {job.criteria.year}</span>}
          {job.criteria.duration_min && <span className="chip">≤ {job.criteria.duration_min} min</span>}
        </div>
      )}

      {job.screenshot && <img className="shot" src={job.screenshot} alt="Captura del navegador" />}

      {job.status === "needs_input" && job.candidates.length > 0 && (
        <div className="candidates">
          <h3>¿Cuál es la correcta?</h3>
          {job.candidates.map((c) => (
            <div key={c.id} className="cand">
              <div>
                <strong>{c.title}</strong> {c.year && `(${c.year})`} · {c.runtime_min || "?"} min
              </div>
              <div className="muted">
                {c.license} · score {c.score}
                {c.source ? ` · ${c.source}` : ""}
              </div>
              <button className="primary" onClick={() => onChoose(c.id)}>
                Elegir esta
              </button>
            </div>
          ))}
        </div>
      )}

      {job.status === "done" && job.file_path && <p className="ok-text">✅ Descargado: {job.file_path}</p>}

      <h3>Trace del agente</h3>
      <ul className="trace">
        {events.map((e, i) => (
          <li key={i}>
            <span className="ts">{new Date(e.ts).toLocaleTimeString()}</span>
            <span className="kind">{e.kind}</span>
            <code>{JSON.stringify(e.payload)}</code>
          </li>
        ))}
        {events.length === 0 && <li className="muted">Sin eventos todavía.</li>}
      </ul>
    </div>
  );
}

function History({ jobs }) {
  const done = jobs.filter((j) => ["done", "error", "cancelled"].includes(j.status));
  return (
    <div className="card">
      <h2>Historial</h2>
      <table className="table">
        <thead>
          <tr>
            <th>Petición</th>
            <th>Estado</th>
            <th>Archivo</th>
            <th>Fecha</th>
          </tr>
        </thead>
        <tbody>
          {done.map((j) => (
            <tr key={j.id}>
              <td>{j.query}</td>
              <td>{STATUS_LABEL[j.status]}</td>
              <td className="muted">{j.file_path || "—"}</td>
              <td className="muted">{new Date(j.created_at).toLocaleString()}</td>
            </tr>
          ))}
          {done.length === 0 && (
            <tr>
              <td colSpan="4" className="muted">
                Sin historial.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function Sources({ sources, onChanged }) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const add = async () => {
    if (!name || !url) return;
    await api("/sources", { method: "POST", body: JSON.stringify({ name, base_url: url }) });
    setName("");
    setUrl("");
    onChanged();
  };
  const del = async (id) => {
    await api(`/sources/${id}`, { method: "DELETE" });
    onChanged();
  };
  return (
    <div className="card">
      <h2>Fuentes permitidas</h2>
      <ul className="sources">
        {sources.map((s) => (
          <li key={s.id || s.base_url}>
            <span className="badge">{s.allowed ? "on" : "off"}</span>
            <strong>{s.name}</strong>
            <span className="muted">{s.base_url}</span>
            <button className="danger" onClick={() => del(s.id || s.base_url)}>
              Quitar
            </button>
          </li>
        ))}
      </ul>
      <div className="row">
        <input className="text" placeholder="Nombre" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="text" placeholder="https://fuente.org" value={url} onChange={(e) => setUrl(e.target.value)} />
        <button className="primary" onClick={add}>
          Añadir
        </button>
      </div>
    </div>
  );
}

function Settings({ settings, onSave }) {
  const [form, setForm] = useState(settings);
  useEffect(() => setForm(settings), [settings]);
  return (
    <div className="card">
      <h2>Ajustes</h2>
      <label>
        Modelo Groq
        <input className="text" value={form.model || ""} onChange={(e) => setForm({ ...form, model: e.target.value })} />
      </label>
      <label>
        Paralelismo (descargas simultáneas)
        <input
          className="text"
          type="number"
          min="1"
          max="8"
          value={form.maxParallel ?? 2}
          onChange={(e) => setForm({ ...form, maxParallel: Number(e.target.value) })}
        />
      </label>
      <label>
        Timeout de inactividad (ms)
        <input
          className="text"
          type="number"
          value={form.idleTimeout ?? 60000}
          onChange={(e) => setForm({ ...form, idleTimeout: Number(e.target.value) })}
        />
      </label>
      <label className="check">
        <input type="checkbox" checked={form.headless ?? true} onChange={(e) => setForm({ ...form, headless: e.target.checked })} />
        Navegador headless
      </label>
      <button className="primary" onClick={() => onSave(form)}>
        Guardar
      </button>
    </div>
  );
}
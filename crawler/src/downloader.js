import { createWriteStream } from "node:fs";
import { mkdir, unlink } from "node:fs/promises";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import path from "node:path";

const IDLE_TIMEOUT = Number(process.env.CRAWLER_IDLE_TIMEOUT || 60000);

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function drawBar(loaded, total, width = 28) {
  const pct = total ? Math.min(100, Math.floor((loaded / total) * 100)) : 0;
  const filled = Math.round((width * pct) / 100);
  const bar = "#".repeat(filled) + "-".repeat(width - filled);
  const size = total ? `${formatBytes(loaded)}/${formatBytes(total)}` : formatBytes(loaded);
  process.stdout.write(`\r[${bar}] ${String(pct).padStart(3)}% ${size}`);
  return pct;
}

function safeName(id) {
  return String(id).replace(/[^a-z0-9._-]+/gi, "_").slice(0, 120) || "movie";
}

export async function downloadFromUrl(url, target, timeout, signal, onProgress) {
  await mkdir(path.dirname(target), { recursive: true });
  const idle = new AbortController();
  let idleTimer = setTimeout(() => idle.abort(new Error("idle timeout")), IDLE_TIMEOUT);
  const resetIdle = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => idle.abort(new Error("idle timeout")), IDLE_TIMEOUT);
  };
  const anySignal = signal ? AbortSignal.any([signal, idle.signal]) : idle.signal;

  try {
    const resp = await fetch(url, { redirect: "follow", signal: anySignal });
    if (!resp.ok || !resp.body) throw new Error(`HTTP ${resp.status}`);
    const contentType = resp.headers.get("content-type") || "";
    if (/text\/html/i.test(contentType)) {
      throw new Error("Resolved URL returned HTML, not a media file");
    }

    const total = Number(resp.headers.get("content-length") || 0);
    let loaded = 0;
    let lastDraw = 0;
    let lastPct = -1;

    const progress = new Transform({
      transform(chunk, _enc, cb) {
        loaded += chunk.length;
        resetIdle();
        const now = Date.now();
        const pct = total ? Math.floor((loaded / total) * 100) : -1;
        if (pct !== lastPct && now - lastDraw > 60) {
          lastPct = pct;
          lastDraw = now;
          drawBar(loaded, total);
          if (onProgress) onProgress(loaded, total);
        }
        cb(null, chunk);
      },
    });

    if (!process.env.CRAWLER_SILENT) process.stdout.write(`Downloading ${path.basename(target)}... `);
    await pipeline(Readable.fromWeb(resp.body), progress, createWriteStream(target));
    drawBar(loaded, total);
    process.stdout.write("\n");
    if (onProgress) onProgress(total || loaded, total || loaded);
    return target;
  } catch (err) {
    await unlink(target).catch(() => {});
    throw err;
  } finally {
    clearTimeout(idleTimer);
  }
}

export async function downloadMovie(context, page, base, movie, outDir, timeout, signal, onProgress) {
  const url =
    movie.url && /^https?:/i.test(movie.url)
      ? movie.url
      : `${base}/download/${encodeURIComponent(movie.id)}`;
  const target = path.join(outDir, `${safeName(movie.id)}.mp4`);
  await mkdir(outDir, { recursive: true });

  // For API-style sources, prefer the browser download event when a page is available.
  if (page && !movie.url) {
    try {
      const [download] = await Promise.all([
        page.waitForEvent("download", { timeout: Math.min(timeout, 8000) }),
        page.goto(url, { waitUntil: "commit" }).catch(() => {}),
      ]);
      await download.saveAs(target);
      if (onProgress) onProgress(100, 100);
      return target;
    } catch {
      await page.goto("about:blank").catch(() => {});
    }
  }

  return downloadFromUrl(url, target, timeout, signal, onProgress);
}
import { run } from "./src/playwright-crawler.js";
import { config } from "./src/config.js";

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        out[key] = next;
        i++;
      } else {
        out[key] = "true";
      }
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const base = args.base || config.base;
const goal = args.goal || "Descarga libros abiertos de dominio público";
const limit = args.limit ? Number(args.limit) : config.defaultLimit;
const ids = args.ids
  ? String(args.ids).split(",").map((s) => s.trim()).filter(Boolean)
  : null;

const results = await run({
  base,
  outDir: config.outDir,
  goal,
  limit,
  ids,
  headless: config.headless,
  timeout: config.navTimeout,
});

const ok = results.filter((r) => r.ok).length;
console.log(`\nDone: ${ok}/${results.length} downloaded to ${config.outDir}/`);
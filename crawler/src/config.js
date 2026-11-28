import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(here, "..", ".env");

if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const key = match[1];
    let value = match[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

export const config = {
  base: process.env.CRAWLER_BASE_URL || "http://127.0.0.1:5000",
  outDir: process.env.CRAWLER_OUT_DIR || "downloads",
  defaultLimit: Number(process.env.CRAWLER_LIMIT || 5),
  navTimeout: Number(process.env.CRAWLER_TIMEOUT || 180000),
  headless: true,
};
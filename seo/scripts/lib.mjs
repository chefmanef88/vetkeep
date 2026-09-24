// Shared plumbing for the SEO agent's scripts. No dependencies: Node 22's fetch
// and loadEnvFile are enough, and a script the agent calls every week should
// not break because a package moved.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const SEO_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
export const DATA_DIR = join(SEO_DIR, "data");
const STATE_FILE = join(SEO_DIR, "state.json");

const envFile = join(SEO_DIR, ".env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

export function requireEnv(...names) {
  const missing = names.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    // "Missing" is a result the agent must report, not a crash to work around,
    // so it goes to stdout as data and the exit code says the step did not run.
    console.log(JSON.stringify({ missing, hint: "Set these in seo/.env (see seo/.env.example)." }));
    process.exit(2);
  }
  return Object.fromEntries(names.map((name) => [name, process.env[name]]));
}

export function readState() {
  return JSON.parse(readFileSync(STATE_FILE, "utf8"));
}

export function writeState(state) {
  state.updated = new Date().toISOString();
  writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`);
}

export function saveJson(relativePath, value) {
  const path = join(DATA_DIR, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
  return path;
}

export function saveText(relativePath, text) {
  const path = join(DATA_DIR, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
  return path;
}

export async function request(url, init = {}) {
  const response = await fetch(url, init);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${init.method ?? "GET"} ${url} → ${response.status}: ${text.slice(0, 500)}`);
  }
  return text ? JSON.parse(text) : null;
}

export function isoDay(date) {
  return date.toISOString().slice(0, 10);
}

export function addDays(day, days) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return isoDay(date);
}

export function slug(text) {
  return text
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
}

export function flag(args, name, fallback) {
  const index = args.indexOf(`--${name}`);
  if (index === -1) return fallback;
  const value = args[index + 1];
  args.splice(index, 2);
  return value;
}

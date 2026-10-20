/**
 * Loading .env without dependency or particular Node flag.
 * Capture scripts run outside of the Next runtime, which loads .env everything
 * alone — here you have to do it by hand.
 */
import { appendFileSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

let loaded = false;

/** Parse .env at the root of the repo and fill process.env (without overwriting). */
export function loadEnv() {
  if (loaded) return;
  loaded = true;

  let raw;
  try {
    raw = readFileSync(resolve(ROOT, ".env"), "utf8");
  } catch {
    throw new Error("captures: .env introuvable à la racine du repo minddy.");
  }

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

/** Reads a required variable, or explains precisely what is missing. */
export function requireEnv(name) {
  loadEnv();
  const value = process.env[name];
  if (!value) throw new Error(`captures: variable d'environnement manquante — ${name}`);
  return value;
}

/**
 * Records generated credentials in `.env` without ever printing them. Only
 * keys absent from the file are appended; an existing value is never
 * replaced, so a rerun cannot overwrite a working credential.
 */
export function appendEnvValues(entries) {
  loadEnv();
  const path = resolve(ROOT, ".env");
  const raw = readFileSync(path, "utf8");
  const present = new Set(
    raw.split("\n").map((line) => line.trim().split("=")[0]).filter(Boolean),
  );
  const lines = Object.entries(entries)
    .filter(([key]) => !present.has(key))
    .map(([key, value]) => {
      if (/[\r\n]/.test(value)) throw new Error(`captures: ${key} cannot span several lines.`);
      process.env[key] = value;
      return `${key}=${value}`;
    });
  if (lines.length === 0) return [];
  appendFileSync(path, `${raw.endsWith("\n") || raw === "" ? "" : "\n"}${lines.join("\n")}\n`);
  return lines.map((line) => line.slice(0, line.indexOf("=")));
}

export { ROOT };

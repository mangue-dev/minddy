import { readFile } from "node:fs/promises";

function cookieDomainMatchesHost(domain, host) {
  const normalized = String(domain ?? "").trim().toLowerCase();
  if (!normalized) return false;
  if (!normalized.startsWith(".")) return normalized === host;
  const parent = normalized.slice(1);
  return host === parent || host.endsWith(`.${parent}`);
}

function isSupabaseSessionCookie(name) {
  return /^sb-[a-z0-9]+-auth-token(?:\.\d+)?$/i.test(String(name ?? ""));
}

export function authStateCoversUrl(state, rawUrl) {
  const host = new URL(rawUrl).hostname.toLowerCase();
  return Array.isArray(state?.cookies) && state.cookies.some(
    (cookie) => isSupabaseSessionCookie(cookie?.name) && cookieDomainMatchesHost(cookie?.domain, host),
  );
}

export async function requireAuthStateForUrl(path, rawUrl) {
  let state;
  try {
    state = JSON.parse(await readFile(path, "utf8"));
  } catch {
    throw new Error(`Authenticated captures require a valid Playwright storage state at ${path}.`);
  }

  if (authStateCoversUrl(state, rawUrl)) return;

  const origin = new URL(rawUrl).origin;
  throw new Error(
    `The saved capture session does not contain an authentication cookie for ${origin}. ` +
      `Refresh it first with CAPTURE_BASE_URL=${origin} node captures/lib/session.mjs.`,
  );
}

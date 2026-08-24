import { timingSafeEqual } from "node:crypto";

function httpError(message, status) {
  return Object.assign(new Error(message), { status });
}

/** Build the trusted runner state from a credential-bearing forge URL. */
export function gitRelayConfig(authUrl, controlToken) {
  let upstream;
  try { upstream = new URL(authUrl); }
  catch { throw httpError("Git remote URL is invalid", 400); }
  if (upstream.protocol !== "https:" || !upstream.username || !upstream.password) {
    throw httpError("Git remote must be an authenticated HTTPS URL", 400);
  }
  const username = decodeURIComponent(upstream.username);
  const password = decodeURIComponent(upstream.password);
  const authorization = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
  upstream.username = "";
  upstream.password = "";
  if (!upstream.pathname.endsWith(".git")) {
    throw httpError("Git remote must end in .git", 400);
  }
  return { authorization, controlToken, upstream };
}

/** Authenticate the run-scoped relay URL without comparing secret strings. */
export function authorizedGitRelay(header, token) {
  const encoded = (header || "").replace(/^Basic\s+/i, "");
  let password = "";
  try { password = Buffer.from(encoded, "base64").toString("utf8").split(":").slice(1).join(":"); }
  catch { return false; }
  const supplied = Buffer.from(password);
  const expected = Buffer.from(token);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

/** Resolve only smart-HTTP paths underneath the configured repository. */
export function gitRelayTarget(relay, action, search = "", method = "GET") {
  const requestedPath = action.slice("/git".length);
  const allowed = new Set([
    `GET ${relay.upstream.pathname}/info/refs`,
    `POST ${relay.upstream.pathname}/git-upload-pack`,
    `POST ${relay.upstream.pathname}/git-receive-pack`,
  ]);
  if (!allowed.has(`${method} ${requestedPath}`)) {
    throw httpError("repository path is outside the configured relay", 403);
  }
  const target = new URL(relay.upstream);
  target.pathname = requestedPath;
  target.search = search;
  return target;
}

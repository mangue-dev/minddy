import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer, type ClientRequest, type IncomingHttpHeaders, type OutgoingHttpHeaders } from "node:http";
import { request as requestHttps } from "node:https";
import type { AddressInfo } from "node:net";
import { createNativeRuntime } from "./native-runtime";
import { CODEX_CAPABILITY_DROP_ARGS } from "./native-prototype/controller";
import { exportProfile } from "./native-prototype/profile";

const BACKEND = "https://chatgpt.com/backend-api/codex/responses";
const INVALID_AUTHORIZATION = "Bearer minddy-private-http401-invalid-access";
const HOP_HEADERS = new Set(["host", "connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer", "transfer-encoding", "upgrade"]);
function forwardedHeaders(headers: IncomingHttpHeaders): OutgoingHttpHeaders {
  const nominated = new Set((headers.connection ?? "").split(",").map((name) => name.trim().toLowerCase()));
  return Object.fromEntries(Object.entries(headers).filter(([name]) => !HOP_HEADERS.has(name) && !nominated.has(name)));
}
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
type AuthSnapshot = { access: string; refresh: string; account: string };
type Forward = (headers: OutgoingHttpHeaders, receive: Parameters<typeof requestHttps>[2]) => ClientRequest;

/** Private loopback transport: all recorded 401 statuses must come from upstream. */
export async function startCodexHttp401Relay(options: {
  snapshot(): Promise<AuthSnapshot>;
  forward?: Forward;
}) {
  const statuses: number[] = [];
  let requests = 0; let upgrades = 0; let first: AuthSnapshot | undefined;
  let firstBearer: string | undefined; let bearerChanged = false; let refreshChanged = false;
  let initialBearerMatches = false; let reloadRetriedSameBearer = false;
  const active = new Set<ClientRequest>();
  let accountMatches = false; let bearerMatchesProfile = false; let relayFailed = false; let closing = false;
  const forward: Forward = options.forward ?? ((headers, receive) => requestHttps(BACKEND, { method: "POST", headers }, receive));
  const server = createServer(async (incoming, outgoing) => {
    if (incoming.method !== "POST" || incoming.url !== "/minddy-http401/responses" ||
        typeof incoming.headers.authorization !== "string" || !incoming.headers.authorization.startsWith("Bearer ")) {
      outgoing.writeHead(404).end(); return;
    }
    if (++requests > 16) { outgoing.writeHead(429).end(); return; }
    const sequence = requests;
    try {
      const snapshot = await options.snapshot();
      if (closing || incoming.destroyed || outgoing.destroyed) return;
      const bearer = digest(incoming.headers.authorization.slice(7));
      if (sequence === 1) { first = snapshot; firstBearer = bearer; initialBearerMatches = bearer === snapshot.access; }
      if (sequence === 2 && first) reloadRetriedSameBearer = bearer === firstBearer && snapshot.refresh === first.refresh;
      if (sequence === 3 && first) {
        bearerChanged = bearer !== firstBearer;
        refreshChanged = snapshot.refresh !== first.refresh;
        accountMatches = snapshot.account === first.account;
        bearerMatchesProfile = bearer === snapshot.access;
      }
      const headers = forwardedHeaders(incoming.headers);
      if (sequence <= 2) headers.authorization = INVALID_AUTHORIZATION;
      let intentionallyStopped = false;
      const upstream = forward(headers, (response) => {
        statuses.push(response.statusCode ?? 0);
        outgoing.writeHead(response.statusCode ?? 502, forwardedHeaders(response.headers));
        let bytes = 0;
        response.on("data", (chunk: Buffer) => { if ((bytes += chunk.length) > 8 * 1024 * 1024) { relayFailed = true; response.destroy(); outgoing.destroy(); } });
        response.on("error", () => { if (!intentionallyStopped && !closing) relayFailed = true; outgoing.destroy(); });
        response.pipe(outgoing);
      });
      active.add(upstream); upstream.once("close", () => active.delete(upstream));
      outgoing.once("close", () => { intentionallyStopped = true; upstream.destroy(); });
      upstream.setTimeout(45_000, () => { relayFailed = true; upstream.destroy(); });
      upstream.on("error", () => { if (!intentionallyStopped && !closing) relayFailed = true; outgoing.destroy(); });
      let bytes = 0;
      incoming.on("data", (chunk: Buffer) => { if ((bytes += chunk.length) > 2 * 1024 * 1024) { relayFailed = true; upstream.destroy(); outgoing.destroy(); } });
      incoming.on("aborted", () => upstream.destroy());
      incoming.pipe(upstream);
    } catch { relayFailed = true; outgoing.destroy(); }
  });
  // The published CLI explicitly falls back to HTTP on upgrade-required.
  // This local transport response is never counted as a provider 401.
  server.on("upgrade", (_request, socket) => { upgrades++; socket.end("HTTP/1.1 426 Upgrade Required\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"); });
  server.maxConnections = 4; server.requestTimeout = 60_000; server.headersTimeout = 10_000;
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", () => { server.removeListener("error", reject); resolve(); }); });
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/minddy-http401`;
  return {
    baseUrl,
    proof: () => ({ kind: "codex_http401_relay" as const, officialUpstream: !options.forward, upstreamOrigin: options.forward ? null : "https://chatgpt.com", upstreamStatuses: [...statuses], substitutedAccessRequests: Math.min(requests, 2), websocketFallbacks: upgrades, nativeInitialBearerMatchesSavedProfile: initialBearerMatches, nativeReloadRetriedSameBearer: reloadRetriedSameBearer, nativeRetryBearerChanged: bearerChanged, nativeRefreshTokenChangedAfter401: refreshChanged, nativeRetryBearerMatchesSavedProfile: bearerMatchesProfile, providerAccountMatchesAfter401: accountMatches, relayFailed }),
    close: async () => { closing = true; for (const upstream of active) upstream.destroy(); active.clear(); server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); },
  };
}

/** Published Codex binary and auth manager remain unchanged; OAuth bypasses the relay. */
export async function startCodexHttp401Validation(profileRoot: string) {
  const relay = await startCodexHttp401Relay({ snapshot: async () => {
    const profile = await exportProfile(profileRoot, "codex");
    const auth = JSON.parse(profile.files[0].content);
    if (typeof auth.tokens.account_id !== "string" || !auth.tokens.account_id) throw new Error("Private HTTP 401 fixture requires account identity");
    return { access: digest(auth.tokens.access_token), refresh: digest(auth.tokens.refresh_token), account: digest(auth.tokens.account_id) };
  } });
  const runtime = createNativeRuntime("codex", { spawn: (_engine, args, env, cwd) => spawn("setpriv", [...CODEX_CAPABILITY_DROP_ARGS, "codex", ...args, "-c", `openai_base_url=${JSON.stringify(relay.baseUrl)}`], { env, cwd, detached: true, stdio: "pipe" }) });
  return { runtime, proof: relay.proof, close: relay.close };
}

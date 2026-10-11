import { createHash } from "node:crypto";
import { createServer, request } from "node:http";
import type { AddressInfo } from "node:net";
import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { startCodexHttp401Relay } from "./native-worker-http401-validation";

const disposers: Array<() => Promise<void>> = [];
afterEach(async () => { await Promise.all(disposers.splice(0).map((close) => close())); });
const digest = (value: string) => createHash("sha256").update(value).digest("hex");

describe("private Codex provider HTTP 401 relay", () => {
  it("relays real upstream 401 responses twice, then passes the renewed bearer and body unchanged", async () => {
    const received: { authorization: string | undefined; account: string | string[] | undefined; body: Buffer }[] = [];
    const backend = createServer((incoming, outgoing) => {
      const chunks: Buffer[] = [];
      incoming.on("data", (chunk) => chunks.push(chunk));
      incoming.on("end", () => {
        received.push({ authorization: incoming.headers.authorization, account: incoming.headers["chatgpt-account-id"], body: Buffer.concat(chunks) });
        const rejected = received.length <= 2;
        const body = gzipSync(rejected ? '{"error":"upstream-token-rejected"}' : "data: upstream-stream\n\n");
        outgoing.writeHead(rejected ? 401 : 200, { "content-encoding": "gzip", "content-length": body.length }); outgoing.end(body);
      });
    });
    await new Promise<void>((resolve) => backend.listen(0, "127.0.0.1", resolve));
    disposers.push(async () => { backend.closeAllConnections(); await new Promise<void>((resolve) => backend.close(() => resolve())); });
    let snapshot = 0;
    const relay = await startCodexHttp401Relay({
      snapshot: async () => { const renewed = ++snapshot >= 3; return { access: digest(renewed ? "fixture-renewed" : "fixture-original"), refresh: renewed ? "refresh-after" : "refresh-before", account: "same-account" }; },
      forward: (headers, receive) => request(`http://127.0.0.1:${(backend.address() as AddressInfo).port}/official-responses-fixture`, { method: "POST", headers }, receive),
    }); disposers.push(relay.close);
    const body = gzipSync('{"input":"fixture-request"}');
    for (const sequence of [1, 2, 3]) {
      const result = await fetch(`${relay.baseUrl}/responses`, { method: "POST", headers: { authorization: `Bearer ${sequence < 3 ? "fixture-original" : "fixture-renewed"}`, "chatgpt-account-id": "fixture-account", "content-encoding": "gzip" }, body });
      expect(result.status).toBe(sequence < 3 ? 401 : 200);
      expect(await result.text()).toBe(sequence < 3 ? '{"error":"upstream-token-rejected"}' : "data: upstream-stream\n\n");
    }
    expect(received.map((call) => call.authorization)).toEqual(["Bearer minddy-private-http401-invalid-access", "Bearer minddy-private-http401-invalid-access", "Bearer fixture-renewed"]);
    expect(received.every((call) => call.body.equals(body) && call.account === "fixture-account")).toBe(true);
    expect(relay.proof()).toMatchObject({ officialUpstream: false, upstreamOrigin: null, upstreamStatuses: [401, 401, 200], substitutedAccessRequests: 2, nativeInitialBearerMatchesSavedProfile: true, nativeReloadRetriedSameBearer: true, nativeRetryBearerChanged: true, nativeRefreshTokenChangedAfter401: true, nativeRetryBearerMatchesSavedProfile: true, providerAccountMatchesAfter401: true, relayFailed: false });
    expect(JSON.stringify(relay.proof())).not.toMatch(/fixture-original|fixture-renewed|refresh-before|refresh-after|same-account|upstream-stream/);
  });
  it("does not fabricate a 401 when upstream rejects with another status", async () => {
    const backend = createServer((_incoming, outgoing) => { outgoing.writeHead(403).end("upstream-forbidden"); });
    await new Promise<void>((resolve) => backend.listen(0, "127.0.0.1", resolve));
    disposers.push(async () => { backend.closeAllConnections(); await new Promise<void>((resolve) => backend.close(() => resolve())); });
    const relay = await startCodexHttp401Relay({ snapshot: async () => ({ access: "a", refresh: "r", account: "owner" }), forward: (headers, receive) => request(`http://127.0.0.1:${(backend.address() as AddressInfo).port}`, { method: "POST", headers }, receive) }); disposers.push(relay.close);
    const result = await fetch(`${relay.baseUrl}/responses`, { method: "POST", headers: { authorization: "Bearer fixture-original" }, body: "fixture" });
    expect(result.status).toBe(403); expect(await result.text()).toBe("upstream-forbidden");
    expect(relay.proof().upstreamStatuses).toEqual([403]);
    expect(relay.proof().nativeRefreshTokenChangedAfter401).toBe(false);
    expect((await fetch(`${relay.baseUrl}/other`)).status).toBe(404);
  });
  it("limits the fixture and preserves HTTP fallback independently of provider authentication", async () => {
    const relay = await startCodexHttp401Relay({ snapshot: async () => ({ access: "a", refresh: "r", account: "owner" }), forward: () => { throw new Error("Unexpected upstream request"); } }); disposers.push(relay.close);
    expect((await fetch(`${relay.baseUrl}/responses`, { method: "POST", body: "no-auth" })).status).toBe(404);
    const result = await new Promise<number>((resolve, reject) => {
      const upgrade = request(`${relay.baseUrl}/responses`, { headers: { connection: "upgrade", upgrade: "websocket" } }, (response) => { response.resume(); resolve(response.statusCode ?? 0); });
      upgrade.on("error", reject); upgrade.end();
    });
    expect(result).toBe(426); expect(relay.proof().websocketFallbacks).toBe(1);
    expect(relay.proof().upstreamStatuses).toEqual([]);
    expect(relay.proof().substitutedAccessRequests).toBe(0);
  });
  it("closes an unfinished upstream stream when the private relay stops", async () => {
    let upstreamClosed!: () => void;
    const closed = new Promise<void>((resolve) => { upstreamClosed = resolve; });
    const backend = createServer((_incoming, outgoing) => {
      outgoing.once("close", upstreamClosed);
      outgoing.writeHead(200, { "content-type": "text/event-stream" }); outgoing.write("data: unfinished\n\n");
    });
    await new Promise<void>((resolve) => backend.listen(0, "127.0.0.1", resolve));
    disposers.push(async () => { backend.closeAllConnections(); await new Promise<void>((resolve) => backend.close(() => resolve())); });
    const relay = await startCodexHttp401Relay({ snapshot: async () => ({ access: "a", refresh: "r", account: "owner" }), forward: (headers, receive) => request(`http://127.0.0.1:${(backend.address() as AddressInfo).port}`, { method: "POST", headers }, receive) });
    const response = await fetch(`${relay.baseUrl}/responses`, { method: "POST", headers: { authorization: "Bearer fixture" }, body: "request" });
    const body = response.text().then(() => false, () => true);
    await relay.close(); await closed;
    expect(await body).toBe(true);
    expect(relay.proof().relayFailed).toBe(false);
  });
  it("does not count the native client's completed-turn stream cancellation as a relay failure", async () => {
    let upstreamClosed!: () => void;
    const closed = new Promise<void>((resolve) => { upstreamClosed = resolve; });
    const backend = createServer((_incoming, outgoing) => {
      outgoing.once("close", upstreamClosed);
      outgoing.writeHead(200, { "content-type": "text/event-stream" }); outgoing.write("data: completed\n\n");
    });
    await new Promise<void>((resolve) => backend.listen(0, "127.0.0.1", resolve));
    disposers.push(async () => { backend.closeAllConnections(); await new Promise<void>((resolve) => backend.close(() => resolve())); });
    const relay = await startCodexHttp401Relay({ snapshot: async () => ({ access: "a", refresh: "r", account: "owner" }), forward: (headers, receive) => request(`http://127.0.0.1:${(backend.address() as AddressInfo).port}`, { method: "POST", headers }, receive) }); disposers.push(relay.close);
    const stop = new AbortController();
    const response = await fetch(`${relay.baseUrl}/responses`, { method: "POST", headers: { authorization: "Bearer fixture" }, body: "request", signal: stop.signal });
    const body = response.text().then(() => false, () => true);
    stop.abort(); await closed;
    expect(await body).toBe(true); expect(relay.proof().relayFailed).toBe(false);
  });
  it("does not start upstream forwarding after shutdown during a pending profile snapshot", async () => {
    let finishSnapshot!: (value: { access: string; refresh: string; account: string }) => void;
    let snapshotStarted!: () => void;
    const started = new Promise<void>((resolve) => { snapshotStarted = resolve; });
    const snapshot = new Promise<{ access: string; refresh: string; account: string }>((resolve) => { finishSnapshot = resolve; });
    let forwarded = false;
    const relay = await startCodexHttp401Relay({ snapshot: () => { snapshotStarted(); return snapshot; }, forward: () => { forwarded = true; throw new Error("Unexpected upstream request after shutdown"); } });
    const response = fetch(`${relay.baseUrl}/responses`, { method: "POST", headers: { authorization: "Bearer fixture" }, body: "request" }).then(() => true, () => false);
    await started; await relay.close();
    finishSnapshot({ access: "a", refresh: "r", account: "owner" });
    expect(await response).toBe(false);
    expect(forwarded).toBe(false); expect(relay.proof().relayFailed).toBe(false);
  });
});

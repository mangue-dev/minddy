"use client";

import { hashKey, type QueryClient } from "@tanstack/react-query";
import { HttpResponseError } from "./backend-availability";
import { CLIENT_READ_TIMEOUT_MS, prepareClientSession } from "./client-read";
import { withClientRequestDeadline } from "./client-request-deadline";
import { applyPendingObjectives } from "./optimistic/issue-writes";
import type { MembersResponse, Objective } from "./types";

type Reader = "members" | "objectives";
type Owner = {
  joined: boolean;
  settled: boolean;
  received: boolean;
  signal?: AbortSignal;
  cleanup?: () => void;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
  promise: Promise<unknown>;
};
export const PROJECT_BOOTSTRAP_FRAME_BYTES = 2 * 1024 * 1024;
const readers: Reader[] = ["members", "objectives"];

/** Share only two already admitted query operations; no settled data is cached here. */
export function createProjectBootstrapPair(client: QueryClient, projectId: string) {
  const controller = new AbortController();
  const owners = new Map<Reader, Owner>();
  let started = false, disposed = false;
  const startedAt = Date.now();
  for (const name of readers) {
    let resolve!: Owner["resolve"], reject!: Owner["reject"];
    const promise = new Promise<unknown>((accept, fail) => { resolve = accept; reject = fail; });
    // A canceled operation can disappear before its query function joins.
    void promise.catch(() => {});
    owners.set(name, { joined: false, settled: false, received: false, resolve, reject, promise });
  }
  const settle = (owner: Owner, error: unknown, value?: unknown) => {
    if (owner.settled) return;
    owner.settled = true;
    owner.cleanup?.();
    if (error !== undefined) owner.reject(error);
    else owner.resolve(value);
  };
  const cancel = (owner: Owner, error: unknown) => {
    settle(owner, error);
    if ([...owners.values()].every((entry) => entry.settled)) controller.abort(error);
  };
  const unsubscribe = client.getQueryCache().subscribe((event) => {
    const name = readers.find((reader) => event.query.queryHash === hashKey([reader, projectId]));
    if (name && (event.type === "removed" || (event.type === "updated" && event.action.type === "invalidate"))) {
      cancel(owners.get(name)!, new DOMException("Project read generation changed", "AbortError"));
    }
  });
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    const error = new DOMException("Project bootstrap disposed", "AbortError");
    controller.abort(error);
    for (const owner of owners.values()) settle(owner, error);
    unsubscribe();
  };
  const run = async () => {
    try {
      await withClientRequestDeadline(async (signal) => {
        const account = await prepareClientSession();
        signal.throwIfAborted();
        const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/bootstrap?readers=members,objectives`, {
          signal, cache: "no-store",
        });
        if (!response.ok) throw new HttpResponseError("Project bootstrap failed", response.status);
        if (!response.headers.get("content-type")?.startsWith("application/x-ndjson") || !response.body) {
          throw new Error("Invalid project bootstrap response");
        }
        const stream = response.body.getReader();
        const onAbort = () => { void stream.cancel(signal.reason).catch(() => {}); };
        signal.addEventListener("abort", onAbort, { once: true });
        const decoder = new TextDecoder("utf-8", { fatal: true });
        let buffered = "", bytes = 0;
        try {
          while (true) {
            signal.throwIfAborted();
            const { value, done } = await stream.read();
            signal.throwIfAborted();
            if (done) break;
            bytes += value.byteLength;
            if (bytes > PROJECT_BOOTSTRAP_FRAME_BYTES * 2) throw new Error("Project bootstrap response too large");
            buffered += decoder.decode(value, { stream: true });
            let end: number;
            while ((end = buffered.indexOf("\n")) >= 0) {
              const line = buffered.slice(0, end);
              buffered = buffered.slice(end + 1);
              if (new TextEncoder().encode(line).byteLength > PROJECT_BOOTSTRAP_FRAME_BYTES) throw new Error("Project bootstrap frame too large");
              const frame = JSON.parse(line);
              if (frame?.version !== 1 || !readers.includes(frame.reader) || typeof frame.ok !== "boolean") throw new Error("Invalid project bootstrap frame");
              const owner = owners.get(frame.reader)!;
              if (owner.received) throw new Error("Duplicate project bootstrap frame");
              owner.received = true;
              if (await prepareClientSession() !== account) throw new Error("Local account changed");
              signal.throwIfAborted();
              if (owner.signal?.aborted || owner.settled) continue;
              if (frame.ok) {
                if (!("data" in frame)) throw new Error("Missing project bootstrap data");
                settle(owner, undefined, frame.data);
              } else {
                if (!Number.isInteger(frame.status) || frame.status < 400 || frame.status > 599 || typeof frame.error !== "string") throw new Error("Invalid project bootstrap failure");
                settle(owner, new HttpResponseError(frame.error, frame.status));
              }
            }
            if (new TextEncoder().encode(buffered).byteLength > PROJECT_BOOTSTRAP_FRAME_BYTES) throw new Error("Project bootstrap frame too large");
          }
          buffered += decoder.decode();
          if (buffered.length || readers.some((name) => !owners.get(name)!.received)) throw new Error("Truncated project bootstrap response");
        } finally {
          signal.removeEventListener("abort", onAbort);
          await stream.cancel().catch(() => {});
          stream.releaseLock();
        }
      }, CLIENT_READ_TIMEOUT_MS, controller.signal);
    } catch (error) {
      for (const owner of owners.values()) settle(owner, error);
    } finally {
      unsubscribe();
    }
  };
  const join = (name: Reader, signal?: AbortSignal) => {
    const owner = owners.get(name)!;
    if (owner.joined) throw new Error("Project bootstrap query already joined");
    owner.joined = true;
    owner.signal = signal;
    const abort = () => cancel(owner, signal!.reason ?? new DOMException("Read canceled", "AbortError"));
    if (signal?.aborted) abort();
    else {
      signal?.addEventListener("abort", abort, { once: true });
      owner.cleanup = () => signal?.removeEventListener("abort", abort);
    }
    if (!started && readers.every((reader) => owners.get(reader)!.joined)) {
      started = true;
      void run();
    }
    return owner.promise;
  };
  return {
    members: ({ signal }: { signal?: AbortSignal } = {}) => join("members", signal) as Promise<MembersResponse>,
    objectives: async ({ signal }: { signal?: AbortSignal } = {}) => applyPendingObjectives(
      await join("objectives", signal) as Objective[], startedAt, projectId,
    ),
    dispose,
  };
}

import "server-only";

import { randomBytes, randomUUID } from "node:crypto";
import { APIError } from "@vercel/sandbox";
import type { NativeConnectionMetadata, NativeCredentialProfile, NativeHarness, NativeLoginStatus, NativePrototypeTestResult } from "@/lib/native-agent-prototype";
import { NATIVE_HARNESSES } from "@/lib/native-agent-prototype";
import type { SandboxBilling } from "@/lib/agent-sandbox-config";
import { ensureUsageBudget, recordSandboxUsage } from "@/lib/server/usage";
import { acquireNativeConnection, disconnectNativeConnection, getNativeConnectionLease, getNativeRuntime, listNativeConnections, listNativeCleanupCandidates, loadNativeProfile, releaseNativeConnection, saveNativeProfile, setNativeRuntime, type NativeConnectionLease } from "../native-agent-credentials";
import { assertNativePrototypeAccess, nativePrototypeEnabledFor } from "./access";
import { createNativeAllocation, openNativeAllocation, NATIVE_ALLOCATION_TIMEOUT_MS, type NativeAllocation, type NativeControllerStatus } from "./sandbox";
import { nativePrototypeMcpTool, executeNativePrototypeMcp } from "./mcp";

const LOGIN_TIMEOUT_MS = 10 * 60_000;
const TEST_TIMEOUT_MS = 4 * 60_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Runtime = {
  sandboxId: string; controllerToken: string; attemptId: string; billingRunId: string;
  createdAt: number; expiresAt: number; allocationSeq: number;
  phase: "allocating" | "waiting" | "finalizing" | "testing";
  billing?: SandboxBilling;
};

/** Errors contain stable public codes only; native output never crosses this boundary. */
export class NativePrototypeError extends Error {
  constructor(readonly code: "private_prototype_unavailable" | "connection_busy" | "reconnect_required" | "login_failed" | "login_expired" | "profile_invalid" | "test_failed" | "subscription_unavailable") { super(code); }
}

function runtime(value: Record<string, unknown> | null): Runtime | null {
  if (value === null) return null;
  const item = value as Runtime;
  if (!/^minddy-native-[0-9a-f-]{36}$/.test(item.sandboxId) ||
      !UUID.test(item.attemptId) || !UUID.test(item.billingRunId) || !/^[A-Za-z0-9_-]{43}$/.test(item.controllerToken) ||
      !Number.isFinite(item.createdAt) || !Number.isFinite(item.expiresAt) ||
      item.expiresAt <= item.createdAt || item.expiresAt - item.createdAt > NATIVE_ALLOCATION_TIMEOUT_MS ||
      ![0, 1, 2].includes(item.allocationSeq) ||
      !["allocating", "waiting", "finalizing", "testing"].includes(item.phase)) {
    throw new NativePrototypeError("profile_invalid");
  }
  return item;
}

async function charge(lease: NativeConnectionLease, descriptor: Runtime, allocation: NativeAllocation | null) {
  const billing = allocation?.billing ?? descriptor.billing;
  if (!billing) return;
  await recordSandboxUsage({ runId: descriptor.billingRunId, seq: descriptor.allocationSeq,
    billTo: { userId: lease.userId }, projectId: null,
    durationMs: Math.max(0, Math.min(Date.now(), descriptor.createdAt + NATIVE_ALLOCATION_TIMEOUT_MS) - descriptor.createdAt),
    usdPerMinute: billing.usdPerMinute });
}

async function stop(lease: NativeConnectionLease, descriptor: Runtime | null, known?: NativeAllocation) {
  if (!descriptor) return;
  let allocation = known ?? null;
  try {
    allocation ??= await openNativeAllocation(descriptor.sandboxId, descriptor.controllerToken);
    await allocation.destroy();
  } catch (error) {
    // Only a typed provider 404 proves that this named allocation is absent.
    if (!(error instanceof APIError && error.response.status === 404) || descriptor.phase === "allocating") throw error;
  }
  await charge(lease, descriptor, allocation);
}

async function claim(userId: string, engine: NativeHarness, kind: "login" | "test") {
  assertNativePrototypeAccess(userId);
  const metadata = (await listNativeConnections(userId)).find((item) => item.engine === engine);
  if (metadata?.stopRequired) throw new NativePrototypeError("reconnect_required");
  if (metadata?.busy) throw new NativePrototypeError("connection_busy");
  if (kind === "test" && metadata?.status !== "connected") throw new NativePrototypeError("reconnect_required");
  await ensureUsageBudget(userId);
  try { return await acquireNativeConnection(userId, engine, kind); }
  catch { throw new NativePrototypeError("connection_busy"); }
}

async function allocate(lease: NativeConnectionLease, attemptId: string, seq: number) {
  await ensureUsageBudget(lease.userId);
  const createdAt = Date.now();
  const descriptor: Runtime = {
    sandboxId: `minddy-native-${randomUUID()}`, controllerToken: randomBytes(32).toString("base64url"),
    attemptId, billingRunId: lease.leaseId, createdAt, expiresAt: createdAt + NATIVE_ALLOCATION_TIMEOUT_MS,
    allocationSeq: seq, phase: "allocating",
  };
  // Persist the name before creation. A late creator must pass the fence again
  // before importing credentials or starting the provider's login process.
  await setNativeRuntime(lease, descriptor);
  let allocation: NativeAllocation | undefined;
  try {
    allocation = await createNativeAllocation(descriptor.sandboxId, descriptor.controllerToken, lease.engine, async (created) => {
      allocation = created;
      descriptor.billing = created.billing;
      // SDK creation has settled. Save this fact before any login/profile use.
      descriptor.phase = lease.kind === "login" ? "waiting" : "testing";
      await setNativeRuntime(lease, descriptor);
    });
    descriptor.billing = allocation.billing;
    descriptor.phase = lease.kind === "login" ? "waiting" : "testing";
    await setNativeRuntime(lease, descriptor);
    return { descriptor, allocation };
  } catch (error) {
    if (allocation) {
      await stop(lease, descriptor, allocation);
      const current = await getNativeConnectionLease(lease.userId, lease.engine);
      if (current?.kind === "stop") {
        const pending = runtime(await getNativeRuntime(current));
        if (pending?.sandboxId === descriptor.sandboxId) await releaseNativeConnection(current, { stopped: true });
      }
    }
    throw error;
  }
}

function publicLogin(attemptId: string, status: NativeControllerStatus): NativeLoginStatus {
  const result: NativeLoginStatus = { attemptId, status: "waiting" };
  if (status.verificationUrl) {
    const url = new URL(status.verificationUrl);
    const hosts = status.engine === "codex" ? ["auth.openai.com"] : ["claude.ai", "platform.claude.com", "console.anthropic.com"];
    if (url.protocol !== "https:" || !hosts.includes(url.hostname) || url.username || url.password || url.port || url.href.length > 8192) throw new NativePrototypeError("login_failed");
    result.verificationUrl = url.href;
  }
  if (status.userCode && /^[A-Za-z0-9 -]{1,64}$/.test(status.userCode)) result.userCode = status.userCode;
  result.requiresCode = status.engine === "claude_code" && !!result.verificationUrl;
  return result;
}

export async function nativeConnectionMetadata(userId: string): Promise<{ enabled: boolean; connections: NativeConnectionMetadata[] }> {
  if (!nativePrototypeEnabledFor(userId)) return { enabled: false, connections: [] };
  const stored = await listNativeConnections(userId);
  const connections: NativeConnectionMetadata[] = [];
  for (const engine of NATIVE_HARNESSES) {
    const item = stored.find((value) => value.engine === engine);
    const entry: NativeConnectionMetadata = { engine, status: item?.status ?? "disconnected", updatedAt: item?.updatedAt ?? null };
    if (item?.stopRequired) entry.status = "reconnect_required";
    else if (item?.busy) {
      const lease = await getNativeConnectionLease(userId, engine);
      entry.status = lease?.kind === "login" ? "connecting" : "busy";
      if (lease?.kind === "login") {
        const active = runtime(await getNativeRuntime(lease));
        if (active) entry.attemptId = active.attemptId;
      }
    }
    connections.push(entry);
  }
  return { enabled: true, connections };
}

export async function startNativeLogin(userId: string, engine: NativeHarness): Promise<NativeLoginStatus> {
  const lease = await claim(userId, engine, "login");
  const attemptId = randomUUID();
  let known: { allocation: NativeAllocation; descriptor: Runtime } | undefined;
  try {
    known = await allocate(lease, attemptId, 0);
    const { allocation } = known;
    await getNativeRuntime(lease, { execution: true });
    const status = await allocation.request("/login/start", { engine });
    if (status.phase === "failed" || status.phase === "cancelled") throw new NativePrototypeError("login_failed");
    return publicLogin(attemptId, status);
  } catch {
    if (known) await stop(lease, known.descriptor, known.allocation);
    await cleanupLease(lease);
    throw new NativePrototypeError("login_failed");
  }
}

async function cleanupLease(lease: NativeConnectionLease) {
  // Do not reclaim or release a different writer's lease after disconnect.
  const current = await getNativeConnectionLease(lease.userId, lease.engine);
  if (!current || current.leaseId !== lease.leaseId || current.generation !== lease.generation) return;
  const active = runtime(await getNativeRuntime(current));
  await stop(current, active);
  await releaseNativeConnection(current, { stopped: true });
}

async function loginAttempt(userId: string, engine: NativeHarness, attemptId: string) {
  assertNativePrototypeAccess(userId);
  if (!UUID.test(attemptId)) throw new NativePrototypeError("login_failed");
  const lease = await getNativeConnectionLease(userId, engine);
  if (!lease || lease.kind !== "login") return null;
  const active = runtime(await getNativeRuntime(lease));
  if (!active || active.attemptId !== attemptId) throw new NativePrototypeError("login_failed");
  if (Date.now() - active.createdAt > LOGIN_TIMEOUT_MS || Date.parse(lease.leaseExpiresAt) <= Date.now()) {
    await cleanupLease(lease);
    throw new NativePrototypeError("login_expired");
  }
  return { lease, active };
}

export async function pollNativeLogin(userId: string, engine: NativeHarness, attemptId: string): Promise<NativeLoginStatus> {
  const attempt = await loginAttempt(userId, engine, attemptId);
  if (!attempt) {
    const connected = (await listNativeConnections(userId)).some((item) => item.engine === engine && item.status === "connected" && !item.busy);
    return { attemptId, status: connected ? "connected" : "failed", ...(connected ? {} : { errorCode: "login_failed" }) };
  }
  const { lease, active } = attempt;
  if (active.phase === "allocating" || active.phase === "finalizing") return { attemptId, status: "waiting" };
  const allocation = await openNativeAllocation(active.sandboxId, active.controllerToken);
  const status = await allocation.request("/status");
  if (status.phase === "failed" || status.phase === "cancelled") {
    await cleanupLease(lease);
    return { attemptId, status: "failed", errorCode: "login_failed" };
  }
  if (!status.authenticated) return publicLogin(attemptId, status);
  active.phase = "finalizing";
  try { await setNativeRuntime(lease, active); }
  catch {
    const current = await getNativeConnectionLease(userId, engine);
    if (current?.leaseId === lease.leaseId && current.generation === lease.generation) return { attemptId, status: "waiting" };
    await stop(lease, active, allocation);
    return { attemptId, status: "failed", errorCode: "login_failed" };
  }
  try {
    const profile = await allocation.request<NativeCredentialProfile>("/profile/export", { engine });
    await saveNativeProfile(lease, profile);
    await stop(lease, active, allocation);
    await releaseNativeConnection(lease, { stopped: true });
    return { attemptId, status: "connected" };
  } catch {
    // A partial native auth exchange may have rotated the profile; require a
    // fresh connection instead of keeping an uncertain earlier credential.
    await stop(lease, active, allocation);
    const current = await getNativeConnectionLease(userId, engine);
    if (current?.leaseId === lease.leaseId && current.generation === lease.generation) await disconnectNativePrototype(userId, engine, lease);
    throw new NativePrototypeError("login_failed");
  }
}

export async function submitNativeLoginCode(userId: string, engine: NativeHarness, attemptId: string, code: string) {
  if (engine !== "claude_code" || typeof code !== "string" || !/^[A-Za-z0-9_#=.+:/-]{1,2048}$/.test(code)) throw new NativePrototypeError("login_failed");
  const attempt = await loginAttempt(userId, engine, attemptId);
  if (!attempt || attempt.active.phase !== "waiting") throw new NativePrototypeError("login_failed");
  const allocation = await openNativeAllocation(attempt.active.sandboxId, attempt.active.controllerToken);
  await getNativeRuntime(attempt.lease, { execution: true });
  await allocation.request("/login/code", { code });
  return pollNativeLogin(userId, engine, attemptId);
}

export async function cancelNativeLogin(userId: string, engine: NativeHarness, attemptId: string) {
  const attempt = await loginAttempt(userId, engine, attemptId);
  if (attempt) await disconnectNativePrototype(userId, engine, attempt.lease);
}

/** Disconnect fences writers before stopping the SDK allocation, and is retryable. */
export async function disconnectNativePrototype(userId: string, engine: NativeHarness, expected?: NativeConnectionLease) {
  const result = await disconnectNativeConnection(userId, engine, expected);
  if (!result.lease) return;
  await stop(result.lease, runtime(result.runtime));
  await releaseNativeConnection(result.lease, { stopped: true });
}

/** Account erasure must stop private previews even after the feature is disabled. */
export async function eraseNativePrototypeAccount(userId: string) {
  for (const item of await listNativeConnections(userId)) await disconnectNativePrototype(userId, item.engine);
}

/** Bounded cron cleanup remains active when the private preview is disabled. */
export async function reapNativePrototypeConnections() {
  const summary = { stopped: 0, pending: 0 };
  const deadline = Date.now() + 30_000;
  for (const candidate of await listNativeCleanupCandidates(8)) {
    if (Date.now() >= deadline) break;
    try {
      const lease = await getNativeConnectionLease(candidate.userId, candidate.engine);
      if (!lease || (lease.kind !== "stop" && Date.parse(lease.leaseExpiresAt) > Date.now())) continue;
      await disconnectNativePrototype(candidate.userId, candidate.engine, lease);
      summary.stopped++;
    } catch { summary.pending++; }
  }
  return summary;
}

function renewalChanged(before: NativeCredentialProfile, after: NativeCredentialProfile) {
  const field = before.engine === "codex" ? "tokens" : "claudeAiOauth";
  const first = JSON.parse(before.files[0].content)[field];
  const second = JSON.parse(after.files[0].content)[field];
  return first && second && JSON.stringify(first) !== JSON.stringify(second);
}

export async function testNativeConnection(userId: string, engine: NativeHarness): Promise<NativePrototypeTestResult> {
  const lease = await claim(userId, engine, "test");
  const result: NativePrototypeTestResult = { engine, passed: false, allocations: [], refreshObserved: false };
  const deadline = Date.now() + TEST_TIMEOUT_MS;
  let profile: NativeCredentialProfile | null = null;
  let active: Runtime | null = null;
  let allocation: NativeAllocation | undefined;
  let imported = false;
  let stage = "profile_load";
  try {
    profile = await loadNativeProfile(lease);
    if (!profile) throw new NativePrototypeError("reconnect_required");
    for (const seq of [1, 2]) {
      if (Date.now() >= deadline) throw new NativePrototypeError("test_failed");
      if (seq === 2) {
        stage = "profile_load";
        // Prove durable write-back by decrypting the saved profile after the
        // first allocation is destroyed, rather than reusing its memory copy.
        profile = await loadNativeProfile(lease);
        if (!profile) throw new NativePrototypeError("reconnect_required");
      }
      stage = "allocation";
      ({ descriptor: active, allocation } = await allocate(lease, randomUUID(), seq));
      const item = { id: allocation.name, authenticated: false, mcpVerified: false, destroyed: false };
      result.allocations.push(item);
      await getNativeRuntime(lease, { execution: true });
      stage = "profile_import";
      await allocation.request("/profile/import", { profile });
      imported = true;
      await getNativeRuntime(lease, { execution: true });
      stage = "auth_check";
      const auth = await allocation.request("/auth/check", { engine });
      if (!auth.authenticated) throw new NativePrototypeError("reconnect_required");
      item.authenticated = true;
      const marker = `MINDDY_NATIVE_${randomUUID().replaceAll("-", "").toUpperCase()}`;
      const nativePrototypeTool = nativePrototypeMcpTool();
      await getNativeRuntime(lease, { execution: true });
      stage = "smoke_start";
      await allocation.request("/smoke", { engine, tools: [nativePrototypeTool], requiredTool: nativePrototypeTool.name, marker });
      let acknowledged = false;
      let calls = 0;
      while (Date.now() < deadline) {
        stage = "smoke_poll";
        const state = await allocation.request("/status");
        for (const call of state.pendingTools ?? []) {
          if (++calls > 8 || call.name !== nativePrototypeTool.name) throw new NativePrototypeError("test_failed");
          // Re-read the fenced runtime before each owner-scoped tool execution.
          await getNativeRuntime(lease, { execution: true });
          assertNativePrototypeAccess(userId);
          stage = "minddy_tool";
          const toolResult = await executeNativePrototypeMcp(call.args, userId);
          await allocation.request("/tool-result", { id: call.id, result: toolResult });
          acknowledged ||= toolResult.isError !== true;
        }
        if (state.phase === "completed") {
          item.mcpVerified = acknowledged && state.toolObserved === true && state.markerObserved === true;
          break;
        }
        if (["failed", "cancelled"].includes(state.phase)) break;
        await new Promise((resolve) => setTimeout(resolve, 1_000));
      }
      if (!item.mcpVerified) throw new NativePrototypeError("test_failed");
      stage = "profile_export";
      const updated = await allocation.request<NativeCredentialProfile>("/profile/export", { engine });
      result.refreshObserved ||= !!renewalChanged(profile, updated);
      await saveNativeProfile(lease, updated);
      profile = updated;
      imported = false;
      stage = "allocation_stop";
      await stop(lease, active, allocation);
      item.destroyed = true;
      allocation = undefined;
      active = null;
      await setNativeRuntime(lease, null);
    }
    await releaseNativeConnection(lease, { stopped: true });
    result.passed = result.allocations.length === 2 && result.allocations[0].id !== result.allocations[1].id && result.allocations.every((item) => item.authenticated && item.mcpVerified && item.destroyed);
    return result;
  } catch {
    // Fixed stage labels locate integration failures without logging native
    // output, auth material, tool results or account identifiers.
    console.error("[native-prototype] test failed", { engine, stage });
    if (allocation) {
      try {
        const state = await allocation.request<{ diagnostics?: Record<string, unknown>; mcpDiagnostics?: Record<string, unknown> }>("/status");
        const counters = Object.fromEntries(Object.entries({ ...state.diagnostics, ...state.mcpDiagnostics })
          .filter(([key, value]) => ["rpcErrorCode", "httpStatus", "receivedEvents", "initialized", "listed", "calls", "completed", "unsupportedMethods", "registeredTools", "mcpToolRegistered"].includes(key)
            && (typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 1_000_000))));
        console.error("[native-prototype] native counters", counters);
        const labels = Object.fromEntries(Object.entries(state.diagnostics ?? {}).filter(([key, value]) =>
          ["rpcMethod", "notification", "mcpStartupStatus", "turnStatus", "itemType", "itemStatus", "errorCode", "callbackMethod"].includes(key)
          && typeof value === "string" && ["initialize", "account/read", "thread/start", "turn/start", "mcpServerStatus/list", "error", "thread/started", "turn/started", "turn/completed", "item/started", "item/completed", "mcpServer/startupStatus/updated", "mcpServer/event/stream/notification", "item/mcpToolCall/progress", "account/login/completed", "starting", "ready", "failed", "cancelled", "completed", "interrupted", "inProgress", "mcpToolCall", "agentMessage", "userMessage", "reasoning", "commandExecution", "fileChange", "webSearch", "plan", "dynamicToolCall", "contextWindowExceeded", "sessionBudgetExceeded", "usageLimitExceeded", "rateLimitExceeded", "flexUnavailable", "serverOverloaded", "cyberPolicy", "misalignmentPolicyViolation", "tooManyDenials", "internalServerError", "unauthorized", "badRequest", "threadRollbackFailed", "sandboxError", "other", "httpConnectionFailed", "responseStreamConnectionFailed", "responseStreamDisconnected", "responseTooManyFailedAttempts", "activeTurnNotSteerable", "item/commandExecution/requestApproval", "item/fileChange/requestApproval", "item/tool/requestUserInput", "mcpServer/elicitation/request", "item/tool/call", "unsupported"].includes(value)));
        console.error("[native-prototype] native labels", labels);
      } catch { /* Cleanup remains mandatory when diagnostics are unavailable. */ }
    }
    // Always stop our own allocation, including when a concurrent disconnect
    // changed the lease. Never release the newer stop-only generation.
    if (allocation && active) {
      if (imported) {
        try {
          const updated = await allocation.request<NativeCredentialProfile>("/profile/export", { engine });
          await saveNativeProfile(lease, updated);
          imported = false;
        } catch { /* A lost fence must not resurrect a disconnected profile. */ }
      }
      await stop(lease, active, allocation);
      const last = result.allocations.at(-1);
      if (last) last.destroyed = true;
    }
    if (imported) {
      const current = await getNativeConnectionLease(userId, engine);
      if (current?.leaseId === lease.leaseId && current.generation === lease.generation) await disconnectNativePrototype(userId, engine, lease);
    }
    else await cleanupLease(lease);
    result.errorCode = "test_failed";
    return result;
  }
}

"use client";

import type {
  NativeConnectionMetadata,
  NativeLoginStatus,
  NativePrototypeTestResult,
} from "./native-agent-prototype";

type NativeEngine = NativeConnectionMetadata["engine"];

export const NATIVE_REQUEST_ERRORS = [
  "private_prototype_unavailable", "connection_busy", "reconnect_required",
  "login_failed", "login_expired", "profile_invalid", "test_failed",
  "subscription_unavailable",
] as const;

export type NativeRequestErrorCode = (typeof NATIVE_REQUEST_ERRORS)[number];

export function safeNativeErrorCode(value: unknown): NativeRequestErrorCode | null {
  return typeof value === "string"
    && (NATIVE_REQUEST_ERRORS as readonly string[]).includes(value)
    ? value as NativeRequestErrorCode : null;
}

export class NativePrototypeRequestError extends Error {
  constructor(readonly code: NativeRequestErrorCode | null) {
    super("Native agent request failed");
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/account/agent-connections${path}`, {
    ...init,
    cache: "no-store",
    credentials: "same-origin",
  });
  // Error responses and native transcripts must never reach UI notifications.
  if (!response.ok) {
    const data: unknown = await response.json().catch(() => null);
    const code = typeof data === "object" && data !== null && "errorCode" in data
      ? safeNativeErrorCode(data.errorCode) : null;
    throw new NativePrototypeRequestError(code);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function fetchNativeConnections(signal?: AbortSignal) {
  return request<{ enabled: boolean; connections: NativeConnectionMetadata[] }>(
    "", { signal },
  );
}

export function startNativeLogin(engine: NativeEngine) {
  return request<NativeLoginStatus>(`/${engine}/login`, { method: "POST" });
}

export function readNativeLogin(
  engine: NativeEngine, attemptId: string, signal?: AbortSignal,
) {
  return request<NativeLoginStatus>(
    `/${engine}/login/${encodeURIComponent(attemptId)}`, { signal },
  );
}

export function submitNativeLoginCode(
  engine: NativeEngine, attemptId: string, code: string,
) {
  return request<NativeLoginStatus>(
    `/${engine}/login/${encodeURIComponent(attemptId)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    },
  );
}

export async function cancelNativeLogin(engine: NativeEngine, attemptId: string) {
  await request<void>(`/${engine}/login/${encodeURIComponent(attemptId)}`, {
    method: "DELETE", keepalive: true,
  });
}

export async function disconnectNativeConnection(engine: NativeEngine) {
  await request<void>(`/${engine}`, { method: "DELETE" });
}

export function testNativeConnection(engine: NativeEngine) {
  return request<NativePrototypeTestResult>(`/${engine}/test`, { method: "POST" });
}

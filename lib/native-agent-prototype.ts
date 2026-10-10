/** Private hosted CLI validation, separate from the production worker engine. */
export const NATIVE_HARNESSES = ["codex", "claude_code"] as const;
export type NativeHarness = (typeof NATIVE_HARNESSES)[number];

export function isNativeHarness(value: unknown): value is NativeHarness {
  return value === "codex" || value === "claude_code";
}

/** Only the native CLI reads and renews this opaque authentication profile. */
export type NativeCredentialProfile = {
  version: 1;
  engine: NativeHarness;
  files: Array<{ path: string; content: string }>;
};

export type NativeConnectionMetadata = {
  engine: NativeHarness;
  status: "disconnected" | "connecting" | "connected" | "busy" | "reconnect_required";
  updatedAt: string | null;
  attemptId?: string;
};

export type NativeLoginStatus = {
  attemptId: string;
  status: "waiting" | "connected" | "failed" | "expired";
  verificationUrl?: string;
  userCode?: string;
  requiresCode?: boolean;
  errorCode?: string;
};

export type NativePrototypeTestResult = {
  engine: NativeHarness;
  passed: boolean;
  allocations: Array<{
    id: string;
    authenticated: boolean;
    mcpVerified: boolean;
    destroyed: boolean;
  }>;
  /** False means renewal was not observed, even when both cold turns succeed. */
  refreshObserved: boolean;
  errorCode?: string;
};

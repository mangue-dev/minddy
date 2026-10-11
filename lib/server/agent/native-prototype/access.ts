import "server-only";

/** Both switches are server-only; a client flag never grants access. */
export function nativePrototypeEnabledFor(userId: string): boolean {
  return process.env.MINDDY_NATIVE_AGENT_PROTOTYPE === "true" &&
    (process.env.MINDDY_NATIVE_AGENT_PROTOTYPE_USER_IDS ?? "")
      .split(",").map((id) => id.trim()).filter(Boolean).includes(userId);
}

export function assertNativePrototypeAccess(userId: string): void {
  if (!nativePrototypeEnabledFor(userId)) {
    throw new Error("private_prototype_unavailable");
  }
}

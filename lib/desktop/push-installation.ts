/** Local identity that links two successive tokens from the same installation. */
export function isPushInstallationId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)
  );
}

/** An opt-in must have been written explicitly; first launch = off. */
export function nativePushAllowedFromStored(value: unknown): boolean {
  return typeof value === "string" && value.trim() === "1";
}

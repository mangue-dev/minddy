/** Identité locale qui relie deux tokens successifs de la même installation. */
export function isPushInstallationId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)
  );
}

/** Un opt-in doit avoir été écrit explicitement ; premier lancement = éteint. */
export function nativePushAllowedFromStored(value: unknown): boolean {
  return typeof value === "string" && value.trim() === "1";
}

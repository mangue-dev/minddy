import "server-only";

/** Staging opt-in while the application-wide repository conversion is unfinished. */
export function isContentEncryptionEnabled(): boolean {
  return process.env.MINDDY_CONTENT_ENCRYPTION_ENABLED === "true";
}

import "server-only";

/** Enable all content domains and maintenance with one server-side switch. */
export function isContentEncryptionEnabled(): boolean {
  return process.env.MINDDY_CONTENT_ENCRYPTION_ENABLED === "true";
}

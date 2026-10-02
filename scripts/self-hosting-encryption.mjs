import { randomBytes } from "node:crypto";

export function encryptionChoice(value) {
  if (value !== "enabled" && value !== "disabled") {
    throw new Error("--encryption must be enabled or disabled.");
  }
  return value;
}

/** Default new installations to encryption; never silently change a saved choice. */
export function encryptionEnvironment(existing = {}, choice, { readOnly = false } = {}) {
  const saved = existing.MINDDY_CONTENT_ENCRYPTION_ENABLED;
  if (saved !== undefined && saved !== "true" && saved !== "false") {
    throw new Error("MINDDY_CONTENT_ENCRYPTION_ENABLED must be true or false.");
  }
  const selected = choice === undefined ? undefined : encryptionChoice(choice) === "enabled";
  const hasExistingConfig = Object.keys(existing).length > 0;
  const enabled = selected ?? (saved === undefined ? !hasExistingConfig : saved === "true");
  if (hasExistingConfig && selected !== undefined && enabled !== (saved === "true")) {
    throw new Error("The encryption choice differs from the existing environment. Preserve MINDDY_DATA_ROOT_KEY and explicitly update MINDDY_CONTENT_ENCRYPTION_ENABLED before rerunning; the installer will not replace saved settings.");
  }
  const root = existing.MINDDY_DATA_ROOT_KEY;
  if (root && !/^[a-fA-F0-9]{64}$/.test(root)) {
    throw new Error("MINDDY_DATA_ROOT_KEY must contain exactly 64 hexadecimal characters.");
  }
  if (!root && (saved !== undefined || (readOnly && enabled))) {
    throw new Error("MINDDY_DATA_ROOT_KEY is missing. Recover the original root key before continuing; generating a replacement can make encrypted content unreadable.");
  }
  return {
    MINDDY_CONTENT_ENCRYPTION_ENABLED: String(enabled),
    MINDDY_DATA_ROOT_KEY: root || (readOnly ? "" : randomBytes(32).toString("hex")),
  };
}

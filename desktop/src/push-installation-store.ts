import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  isPushInstallationId,
  nativePushAllowedFromStored,
} from "@/lib/desktop/push-installation";

/**
 * Stable identity of the APNs INSTALLATION (MIN-356), distinct from the token that
 * Apple can run. It is only used to postpone the switch and
 * remove the old token during a rotation; it is neither a secret nor a
 * authorization.
 */
let cached: string | null = null;

export async function pushInstallationId(userData: string): Promise<string> {
  if (cached) return cached;
  const file = path.join(userData, "push-installation-id");
  try {
    const value = (await readFile(file, "utf8")).trim();
    if (isPushInstallationId(value)) {
      return (cached = value);
    }
  } catch {
    // First launch: the file does not yet exist.
  }
  const value = randomUUID();
  await mkdir(userData, { recursive: true });
  await writeFile(file, `${value}\n`, { mode: 0o600 });
  cached = value;
  return value;
}

/** Native opt-in survives launches; absent means never asked. */
export async function nativePushAllowed(userData: string): Promise<boolean> {
  try {
    return nativePushAllowedFromStored(
      await readFile(path.join(userData, "push-enabled"), "utf8")
    );
  } catch {
    return false;
  }
}

export async function setNativePushAllowed(
  userData: string,
  allowed: boolean
): Promise<void> {
  await mkdir(userData, { recursive: true });
  await writeFile(path.join(userData, "push-enabled"), allowed ? "1\n" : "0\n", {
    mode: 0o600,
  });
}

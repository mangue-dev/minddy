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
const installations = new Map<string, Promise<string>>();

export function pushInstallationId(userData: string): Promise<string> {
  const directory = path.resolve(userData);
  const pending = installations.get(directory);
  if (pending) return pending;
  // Cache before the first asynchronous file read completes. Concurrent renderer
  // registrations must agree on the identity that is actually persisted.
  const installation = readOrCreateInstallation(directory).catch(error => {
    installations.delete(directory);
    throw error;
  });
  installations.set(directory, installation);
  return installation;
}

async function readOrCreateInstallation(userData: string): Promise<string> {
  const file = path.join(userData, "push-installation-id");
  try {
    const value = (await readFile(file, "utf8")).trim();
    if (isPushInstallationId(value)) {
      return value;
    }
  } catch {
    // First launch: the file does not yet exist.
  }
  const value = randomUUID();
  await mkdir(userData, { recursive: true });
  await writeFile(file, `${value}\n`, { mode: 0o600 });
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

/** Persist the user's decision before native cleanup can block or fail. */
export async function disableNativePush(
  userData: string,
  unregister: () => void | Promise<unknown>,
): Promise<void> {
  await setNativePushAllowed(userData, false);
  await unregister();
}

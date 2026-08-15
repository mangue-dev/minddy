import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  isPushInstallationId,
  nativePushAllowedFromStored,
} from "@/lib/desktop/push-installation";

/**
 * Identité stable de l'INSTALLATION APNs (MIN-356), distincte du token que
 * Apple peut faire tourner. Elle sert uniquement à reporter l'interrupteur et
 * retirer l'ancien token lors d'une rotation ; ce n'est ni un secret ni une
 * autorisation.
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
    // Premier lancement : le fichier n'existe pas encore.
  }
  const value = randomUUID();
  await mkdir(userData, { recursive: true });
  await writeFile(file, `${value}\n`, { mode: 0o600 });
  cached = value;
  return value;
}

/** L'opt-in natif survit aux lancements ; absent signifie jamais demandé. */
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

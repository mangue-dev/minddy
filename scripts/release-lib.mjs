import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?$/;

export function assertVersion(version) {
  if (!VERSION_PATTERN.test(version)) {
    throw new Error(`invalid SemVer version: ${version}`);
  }
  return version;
}

export async function sha256(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

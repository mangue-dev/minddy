import "server-only";

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { OPENCODE_VERSION } from "./vm/opencode-version";
import { VM_PROTOCOL_VERSION } from "./vm/protocol";

/**
 * The bundled worker harness used by managed and self-hosted server sandboxes.
 *
 * `.agent-vm/main.js` is produced by `prebuild` and `predev`, then included in
 * server functions through `outputFileTracingIncludes`. `vm-launch.ts` writes
 * these bytes into the allocated sandbox. Desktop clients do not download or
 * execute this bundle.
 */

/**
 * Where the bundle is read, on the function side. It is read by PATH, therefore invisible to the
 * import tracer of Next: it is `outputFileTracingIncludes` which prevents it from
 * missing in production, and nothing else.
 */
const LOCAL_BUNDLE_PATH = path.join(process.cwd(), ".agent-vm", "main.js");

/** Metadata retained for build verification and diagnostics. */
export interface HarnessManifest {
  /** `VM_PROTOCOL_VERSION` — harness and job must speak the same. */
  protocolVersion: number;
  /** The pinned opencode version, so the machine knows what to install. */
  opencodeVersion: string;
  /** The fingerprint of the bundle, in lowercase hexadecimal. */
  sha256: string;
  /** Its size, so that a truncated download can be seen without hashing. */
  bytes: number;
}

/**
 * The bundle is the same for all runs of a deployment: read and hash it once
 * per server process.
 */
let cached: Promise<{ source: string; manifest: HarnessManifest }> | null = null;

function readBundle(): Promise<{ source: string; manifest: HarnessManifest }> {
  return readFile(LOCAL_BUNDLE_PATH, "utf8").then(
    (source) => ({
      source,
      manifest: {
        protocolVersion: VM_PROTOCOL_VERSION,
        opencodeVersion: OPENCODE_VERSION,
        sha256: createHash("sha256").update(source, "utf8").digest("hex"),
        // The length in BYTES, not in characters: the bundle is ASCII in
        // practical, but a `Buffer.byteLength` costs the same and doesn't lie
        // the day a non-ASCII literal enters it.
        bytes: Buffer.byteLength(source, "utf8"),
      },
    }),
    (err: Error) => {
      cached = null;
      throw new Error(
        `agent VM bundle missing at ${LOCAL_BUNDLE_PATH} — run \`npm run build:agent-vm\` (it is wired as \`prebuild\`): ${err.message}`,
      );
    },
  );
}

function load(): Promise<{ source: string; manifest: HarnessManifest }> {
  // In development, `build:agent-vm` rewrites this file without reloading the
  // moduleNext. Keeping the promise cached therefore executed the old one
  // harness for hours and made any local benchmark misleading.
  if (process.env.NODE_ENV === "development") return readBundle();
  cached ??= readBundle();
  return cached;
}

/** The harness bytes. RISE if the bundle is missing — cf. the message above. */
export async function harnessBundleSource(): Promise<string> {
  return (await load()).source;
}

/** The manifest of the harness that this deployment serves. UP with the same message. */
export async function harnessBundleManifest(): Promise<HarnessManifest> {
  return (await load()).manifest;
}

/**
 * Forgets what is cached. **Reserved for testing**: in production the bundle
 * of a function instance does not change, and this is precisely what the
 * cache relies on.
 */
export function forgetHarnessBundleCache(): void {
  cached = null;
}

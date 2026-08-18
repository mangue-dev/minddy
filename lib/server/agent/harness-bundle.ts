import "server-only";

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { OPENCODE_VERSION } from "./vm/opencode-version";
import { VM_PROTOCOL_VERSION } from "./vm/protocol";

/**
 * THE HARNESS BUNDLE, AND ITS IMPRINT (MIN-293).
 *
 * `.agent-vm/main.js` is produced by `prebuild`/`predev`
 * ([scripts/build-agent-vm.mjs](../../../scripts/build-agent-vm.mjs)) and embedded
 * in functions by `outputFileTracingIncludes` (next.config.mjs). It had
 * so far **one** drive, [vm-launch.ts](vm-launch.ts), which writes it to the
 * microVM. It now has a second one: the user's machine, which DOWNLOADS it.
 *
 * ─────────────────────── ──────────────────────── ──────────────────────────────
 * WHY DOES IT DOWNLOAD RATHER THAN EMBARK IN THE APP
 *
 * Two reasons, and the second is the hardest to repair if you make a mistake.
 *
 * 1. **The contract is typed and it moves** ([vm/protocol.ts](vm/protocol.ts)) as a resolved issue.
 * 2. **Embarking it would make it enter the repost imprint**
 * ([scripts/desktop-fingerprint.mjs](../../../scripts/desktop-fingerprint.mjs)) :
 * a move of `protocol.ts` would cost a notarization and 120 MB
 * downloaded by everyone, for a 280 KB file.
 *
 * ─────────────────────── ──────────────────────── ──────────────────────────────
 * FINGERPRINT IS NOT A TRANSPORT PRECAUTION
 *
 * TLS already guarantees that what we download is what we served. What
 * the fingerprint keeps is the file **once placed on the disk**: it is the
 * only code not signed by Apple that the app executes, it lives under `userData`, and it
 * is **writable by the model under the same UID** — a trick that rewritten
 * would capture in the next round the local execution lease, the key of the “en
 * memory” model and the `authUrl` of the repository.
 *
 * Hence the form: a MANIFEST separated from the bytes. The launcher asks for the
 * manifest every round (2 lines of JSON), rehashes the file it has on the
 * disk, and only forks if the two match — cf.
 * [lib/desktop/harness-bundle.ts](../../desktop/harness-bundle.ts).
 *
 * `protocolVersion` and `opencodeVersion` travel in the same manifest because
 * they decide in the same place and read each other at the same time: a shell
 * which discovered the protocol disagreement after the fork would only have the
 * log to say it.
 */

/**
 * Where the bundle is read, on the function side. It is read by PATH, therefore invisible to the
 * import tracer of Next: it is `outputFileTracingIncludes` which prevents it from
 * missing in production, and nothing else.
 */
const LOCAL_BUNDLE_PATH = path.join(process.cwd(), ".agent-vm", "main.js");

/** What the machine receives BEFORE the bytes, and who decides whether it requests them. */
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
 * The bundle is the same for all runs of a deployment: we read it ONE time
 * per function instance, and we hash once too. An invocation that serves
 * five launches does not reread 280 KB five times — this was already the rule in
 * `vm-launch.ts`, it is even more valuable now that a public route can
 * be called on each turn of each machine.
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

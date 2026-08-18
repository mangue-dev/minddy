/**
 * THE HARNESS ON THE MACHINE (MIN-293) — the half that is decided without a disc.
 *
 * ## Ce que ce fichier garde
 *
 * `.agent-vm/main.js` is **the only code not signed by Apple that the desktop app
 * executes**, and it lives under `userData`, that is to say in a folder
 * **writable by the model under the same UID** — a trick that rewrites it
 * would capture, in the next round, the local execution lease, the model key and
 * the `authUrl` of the repository.
 *
 * Hence the rule, and it is not negotiable: **the imprint is verified on the
 * file from the disk, just before the fork.** Not when downloading — at
 * download, TLS has already done the work and the file has not yet had the
 * time to be rewritten. What we check is not what we received, it is what
 * that we are about to execute.
 *
 * ## Why is it downloaded and not embedded
 *
 * The contract between the harness and the control plane is typed and it moves
 * ([vm/protocol.ts](../server/agent/vm/protocol.ts)). An app installed ago
 * two months should not play a trick with a two month harness. And
 * embedding it would bring it into the repost imprint
 * ([desktop-fingerprint.mjs](../../scripts/desktop-fingerprint.mjs)) : un
 * movement of `protocol.ts` would cost a notarization and 120 MB downloaded
 * by everyone, for a 280 KB file.
 *
 * ## The bundle FOLLOWS THE ACTIVE ORIGIN
 *
 * It is requested at the origin of the channel (`desktopOriginForChannel`), never at a
 * constant. A shell in preview which would play a trick with the harness of
 * production would cause the typed contract to diverge **silently**: both
 * `protocol.ts` files are not the same, and nothing in the job would say so.
 * This is also what makes development work against `localhost`.
 *
 * ## Storage, and what the file name means
 *
 * One file per fingerprint, under `<userData>/harness/`. The name BEARS the imprint,
 * which gives two free properties: two simultaneous runs on bundles
 * different (channel switch in full turn) do not work on it, and the
 * housekeeping is done by comparing names, without reading a byte.
 *
 * Decisions here, `fs` and `fetch` in [desktop/src/launcher.ts](../../desktop/src/launcher.ts) —
 * `vitest` ne collecte pas `desktop/src/`
 * ([local-surface-coverage.test.ts](../server/agent/local-surface-coverage.test.ts)).
 */

/** The bundles folder, under `userData`. */
export const HARNESS_DIR_NAME = "harness";

/** The path, under `userData`, of the manifest served by the active origin. */
export const HARNESS_MANIFEST_PATH = "/api/desktop/harness";

/** And that of bytes. */
export const HARNESS_BUNDLE_PATH = "/api/desktop/harness/bundle";

/**
 * Ceiling of what we agree to download. The bundle is ~280 KB and its
 * own build refuses beyond 4 MB
 * ([build-agent-vm.mjs](../../scripts/build-agent-vm.mjs)): beyond this
 * ceiling here, it is no longer our file, and there is nothing to do with it.
 */
export const HARNESS_MAX_BYTES = 8 * 1024 * 1024;

/** The manifest, as the active origin serves. */
export interface HarnessManifest {
  readonly protocolVersion: number;
  readonly opencodeVersion: string;
  /** Lowercase hexadecimal fingerprint of the bundle. */
  readonly sha256: string;
  readonly bytes: number;
}

/**
 * Why the machine cannot perform harness.
 *
 * - `manifest_unreachable` — the originator did not respond, or refused. It is also
 * the case of an expired session: the manifest is authenticated;
 * - `manifest_invalid` — she answered something other than a manifesto. A portal
 * captive, enterprise proxy, HTML error page;
 * - `protocol_mismatch` — **the only refusal that does not come from a breakdown**: this
 * version of the app knows a contract that the deployment no longer serves, or
 * the opposite. It's better to say it here than to let `parseVmJob`
 * discover after the fork, where there is only one newspaper to talk about it;
 * - `download_failed` — the manifest was good, the bytes were not;
 * - `fingerprint_mismatch` — **the refusal that counts.** The bytes on the disk do not
 * are not those originally announced. On a download it's a
 * network incident; just before a fork, someone rewrote the
 * harness, and we don't execute it.
 */
export type HarnessRefusal =
  | "manifest_unreachable"
  | "manifest_invalid"
  | "protocol_mismatch"
  | "download_failed"
  | "fingerprint_mismatch";

/** The file name of a bundle. The imprint IS the name (see header). */
export function harnessBundleFileName(sha256: string): string {
  return `main-${sha256.slice(0, 32)}.js`;
}

/**
 * The manifest reread what the origin responded — or `null`.
 *
 * Everything is checked, including what “cannot” be false: this JSON decides
 * of the code that we are going to execute, and it arrives via the network. A footprint that
 * would not 64 hexadecimal characters cannot be compared to a hash, and
 * comparing it anyway would make `false` — that is to say a refusal, but for the
 * wrong reason, and the user would read "the harness has been modified".
 */
export function parseHarnessManifest(raw: unknown): HarnessManifest | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { protocolVersion, opencodeVersion, sha256, bytes } = raw as Record<string, unknown>;
  if (typeof protocolVersion !== "number" || !Number.isInteger(protocolVersion)) return null;
  if (typeof opencodeVersion !== "string" || !opencodeVersion.trim()) return null;
  if (typeof sha256 !== "string" || !/^[0-9a-f]{64}$/.test(sha256)) return null;
  if (typeof bytes !== "number" || !Number.isInteger(bytes) || bytes <= 0) return null;
  if (bytes > HARNESS_MAX_BYTES) return null;
  return { protocolVersion, opencodeVersion, sha256, bytes };
}

/** What the shell found on the disk for this manifest. */
export interface CachedBundle {
  /** The RECALCULATED fingerprint of the file, never the one we noted. */
  readonly sha256: string;
  readonly bytes: number;
}

export type BundleDecision =
  | { readonly action: "reuse" }
  | { readonly action: "download" }
  | { readonly action: "refuse"; readonly reason: HarnessRefusal };

/**
 * SHOULD YOU DOWNLOAD THIS BUNDLE?
 *
 * `cached` is what we **rehashed** on the disk, not what we thought
 * having put. That's all the difference: a note taken when downloading would say
 * only what we wrote, and the file could have been rewritten since.
 *
 * `expectedProtocol` is the `VM_PROTOCOL_VERSION` that THIS version of the app
 * knows. She doesn't use it herself — it's the harness that will refuse a
 * job from another version — but she knows how to read it, and refusal is better here.
 */
export function bundleDecision(
  manifest: HarnessManifest,
  cached: CachedBundle | null,
  expectedProtocol: number,
): BundleDecision {
  if (manifest.protocolVersion !== expectedProtocol) {
    return { action: "refuse", reason: "protocol_mismatch" };
  }
  if (cached && cached.sha256 === manifest.sha256 && cached.bytes === manifest.bytes) {
    return { action: "reuse" };
  }
  return { action: "download" };
}

/**
 * ARE THE BYTES RECEIVED THOSE WE EXPECTED?
 *
 * Size first, not by optimization: a truncated answer is the case
 * ordinary (network cut, proxy), and its diagnosis is not the same as a
 * diverging footprint. Confusing the two would read “the harness was
 * modified” to someone whose wifi has failed.
 */
export function verifyDownload(
  received: { sha256: string; bytes: number },
  manifest: HarnessManifest,
): { ok: true } | { ok: false; reason: HarnessRefusal } {
  if (received.bytes !== manifest.bytes) return { ok: false, reason: "download_failed" };
  if (received.sha256 !== manifest.sha256) return { ok: false, reason: "fingerprint_mismatch" };
  return { ok: true };
}

/**
 * THE LAST CHECK, the one that takes place a hair's breadth from `fork`.
 *
 * Separated from `verifyDownload` although the comparison is the same, because it
 * that they PROVE is not the same thing and that their diagnosis should not
 * neither is being. Here, a divergence is never a network incident: the
 * file was written by us, checked by us, and something changed it
 * in the meantime. We don't try again, we don't redownload — we refuse.
 */
export function verifyBeforeFork(
  onDisk: CachedBundle | null,
  manifest: HarnessManifest,
): { ok: true } | { ok: false; reason: HarnessRefusal } {
  if (!onDisk) return { ok: false, reason: "download_failed" };
  if (onDisk.bytes !== manifest.bytes || onDisk.sha256 !== manifest.sha256) {
    return { ok: false, reason: "fingerprint_mismatch" };
  }
  return { ok: true };
}

/**
 * Bundles to DELETE: all except the one we just selected.
 *
 * The function does not touch anything, it names — same pattern as `pruneRunLogs`
 * ([run-log.ts](run-log.ts)). One bundle per imprint would otherwise accumulate to
 * every deployment, and 280 KB per deployment ends up being seen.
 *
 * ⚠ **Cleaning is done AFTER the fork, never before**: a second round can
 * turn on an older bundle (channel toggle, or simply a turn
 * started before deployment). Delete under his feet the file that
 * `utilityProcess` already loaded wouldn't kill it — the mapping survives
 * the `unlink` — but a restart would have nothing left to read.
 */
export function staleBundles(files: readonly string[], keep: string): string[] {
  return files.filter((name) => name !== keep && /^main-[0-9a-f]{32}\.js$/.test(name));
}

/**
 * The sentence from the newspaper, in English like the rest of the native surfaces.
 *
 * It's here and not in the shell for the same reason as the whole file:
 * that's what someone will read in their diagnostic report when a lap has failed
 * never started, and a sentence is reread in a test.
 */
export function harnessRefusalMessage(reason: HarnessRefusal, origin: string): string {
  switch (reason) {
    case "manifest_unreachable":
      return `Could not reach ${origin} to fetch the agent harness — check your connection, and that you are still signed in.`;
    case "manifest_invalid":
      return `${origin} answered something that is not a harness manifest. A captive portal or a corporate proxy is the usual cause.`;
    case "protocol_mismatch":
      return `This version of minddy speaks a different harness protocol than ${origin}. Update the app, or switch back to the stable channel.`;
    case "download_failed":
      return `The agent harness downloaded from ${origin} was incomplete.`;
    case "fingerprint_mismatch":
      return `The agent harness on this Mac does not match what ${origin} published, so it was not run. It has been discarded and will be downloaded again.`;
  }
}

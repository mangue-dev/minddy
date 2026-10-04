import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Local mitigation for GHSA-ch52-4w7c-c8xp until an official fixed release exists.
// Keep the real package version and the complete dependency audit blocking.
// References: kornelski/http-cache-semantics PRs #58 and #60 (BSD-2-Clause).
export const ORIGINAL_SHA256 = "01b7d66c854b2fe53ac05c98feb6e0d64722ab8898a778e2d2426a8b468d178f";
const digest = (source) => createHash("sha256").update(source).digest("hex");

const replacements = [
  [
    "        // In all circumstances, a cache MUST NOT ignore the must-revalidate directive\n        if (this._rescc['must-revalidate']) {",
    "        // Request directives cannot override response reuse restrictions.\n        if (this._requiresRevalidation() || this._rescc['must-revalidate']) {",
  ],
  [
    "        if (this.stale()) {\n",
    "        if (this.stale()) {\n            if (this._forbidsStale()) {\n                return this._evaluateRequestMissResult(req);\n            }\n",
  ],
  [
    "    /**\n     * Possibly outdated value of applicable max-age (or heuristic equivalent) in seconds.\n",
    `    // Separate security restrictions from ordinary expiration. They also
    // apply to deserialized policies and to stale fallback paths.
    _requiresRevalidation() {
        return !!(
            !this.storable() ||
            this._rescc['no-cache'] ||
            (this._resHeaders.vary &&
                this._resHeaders.vary.split(',').some(field => field.trim() === '*')) ||
            (this._isShared &&
                (this._rescc['proxy-revalidate'] ||
                    (this._resHeaders['set-cookie'] &&
                        !this._rescc.public && !this._rescc.immutable)))
        );
    }

    _forbidsStale() {
        return !!(this._rescc['must-revalidate'] ||
            (this._isShared && this._rescc['s-maxage'] !== undefined));
    }

    /**
     * Possibly outdated value of applicable max-age (or heuristic equivalent) in seconds.
`,
  ],
  [
    "    maxAge() {\n",
    "    maxAge() {\n        if (this._requiresRevalidation()) return 0;\n",
  ],
  [
    "    timeToLive() {\n        const age = this.maxAge() - this.age();",
    "    timeToLive() {\n        if (this._requiresRevalidation()) return 0;\n        const age = this.maxAge() - this.age();\n        if (this._forbidsStale()) return Math.round(Math.max(0, age) * 1000);",
  ],
  [
    "        return this.maxAge() + toNumberOrZero(this._rescc['stale-if-error']) > this.age();",
    "        return !this._requiresRevalidation() &&\n            (!this.stale() || !this._forbidsStale()) &&\n            this.maxAge() + toNumberOrZero(this._rescc['stale-if-error']) > this.age();",
  ],
  [
    "        return swr > 0 && this.maxAge() + swr > this.age();",
    "        return !this._requiresRevalidation() && !this._forbidsStale() &&\n            swr > 0 && this.maxAge() + swr > this.age();",
  ],
  [
    "        if (this._useStaleIfError() && isErrorResponse(response)) {",
    `        const requestCC = parseCacheControl(request.headers['cache-control']);
        if (this._requestMatches(request, true) &&
            !requestCC['no-cache'] && !/no-cache/.test(request.headers.pragma) &&
            this._useStaleIfError() && isErrorResponse(response)) {`,
  ],
];

export function mitigateSource(original) {
  if (digest(original) !== ORIGINAL_SHA256) {
    throw new Error("Unexpected http-cache-semantics source; review the mitigation before installing.");
  }
  let patched = original;
  for (const [before, after] of replacements) {
    if (patched.split(before).length !== 2) throw new Error("Security patch anchor is not unique.");
    patched = patched.replace(before, after);
  }
  return patched;
}

export async function patchDesktopHttpCache(desktopRoot) {
  const lock = JSON.parse(await readFile(path.join(desktopRoot, "package-lock.json"), "utf8"));
  const targets = Object.entries(lock.packages).filter(([name]) =>
    /(?:^|\/)node_modules\/http-cache-semantics$/.test(name));
  if (!targets.length) throw new Error("Advisory dependency changed; remove or review the local mitigation.");
  // Validate every copy before changing any file. Unexpected upgrades fail closed.
  const changes = [];
  for (const [name, entry] of targets) {
    const directory = path.join(desktopRoot, name);
    const pkg = JSON.parse(await readFile(path.join(directory, "package.json"), "utf8"));
    if (entry.version !== "4.2.0" || pkg.name !== "http-cache-semantics" || pkg.version !== "4.2.0") {
      throw new Error("Advisory dependency version changed; review the local mitigation.");
    }
    const filename = path.join(directory, "index.js");
    const source = await readFile(filename, "utf8");
    // The patched digest is pinned alongside the pristine npm source digest.
    if (digest(source) === PATCHED_SHA256) continue;
    const patched = mitigateSource(source);
    if (digest(patched) !== PATCHED_SHA256) throw new Error("Security patch digest mismatch.");
    changes.push({ filename, patched });
  }
  for (const { filename, patched } of changes) await writeFile(filename, patched);
  console.log(`[desktop security] Verified GHSA-ch52-4w7c-c8xp mitigation in ${targets.length} package(s); npm audit remains authoritative.`);
}

export const PATCHED_SHA256 = "534ce153e727c3f23c04da877572a9a59f47ca1b793e2f82da91715b7e881fb1";
const script = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === script) {
  await patchDesktopHttpCache(path.resolve(path.dirname(script), "../desktop"));
}

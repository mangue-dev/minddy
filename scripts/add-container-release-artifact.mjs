#!/usr/bin/env node

import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertVersion, sha256 } from "./release-lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const version = assertVersion(process.env.RELEASE_VERSION ?? packageJson.version);
const args = process.argv.slice(2);
if (args[0] === "--") args.shift();
const [image, digest, outputArg] = args;
const output = path.resolve(outputArg ?? path.join(root, ".release"));

if (!image || !/^ghcr\.io\/[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/.test(image)) {
  throw new Error("Expected a lowercase GHCR image name such as ghcr.io/owner/minddy");
}
if (!digest || !/^sha256:[a-f0-9]{64}$/.test(digest)) {
  throw new Error("Expected an OCI sha256 digest");
}

const manifestPath = path.join(output, "release-manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
if (manifest.release?.version !== version || manifest.release?.tag !== `v${version}`) {
  throw new Error("Release manifest does not match the requested version");
}

const tag = `v${version}`;
const reference = `${image}@${digest}`;
const identityName = `minddy-v${version}-container.txt`;
const signatureIdentity = process.env.COSIGN_CERTIFICATE_IDENTITY?.trim()
  || "https://github.com/mangue-dev/minddy/.github/workflows/release.yml@refs/heads/production";
const signatureIssuer = process.env.COSIGN_CERTIFICATE_ISSUER?.trim()
  || "https://token.actions.githubusercontent.com";
manifest.container = {
  image,
  tag: `${image}:${tag}`,
  digest,
  reference,
  platforms: ["linux/amd64", "linux/arm64"],
  sbom: {
    format: "SPDX",
    location: "OCI referrer attached to the image digest",
  },
  provenance: {
    format: "SLSA",
    location: "OCI attestation attached to the image digest",
  },
  signature: {
    type: "keyless Sigstore",
    identity: signatureIdentity,
    issuer: signatureIssuer,
  },
};
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

const identity = [
  `image=${image}`,
  `tag=${image}:${tag}`,
  `digest=${digest}`,
  `reference=${reference}`,
  "platforms=linux/amd64,linux/arm64",
  "sbom=SPDX OCI referrer",
  "provenance=SLSA OCI attestation",
  "signature=keyless Sigstore",
  `signature-identity=${signatureIdentity}`,
  `signature-issuer=${signatureIssuer}`,
  "",
].join("\n");
await writeFile(path.join(output, identityName), identity);

const checksumFiles = (await readdir(output))
  .filter((name) => name !== "SHA256SUMS")
  .sort();
const checksums = [];
for (const name of checksumFiles) {
  checksums.push(`${await sha256(path.join(output, name))}  ${name}`);
}
await writeFile(path.join(output, "SHA256SUMS"), `${checksums.join("\n")}\n`);

console.log(`Container release identity for ${reference} added to ${output}`);

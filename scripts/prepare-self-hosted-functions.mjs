#!/usr/bin/env node
/** Compile the pinned upstream main function without runtime registry access. */
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

export function bundleInputs(supabaseDir, root = ROOT) {
  const pin = JSON.parse(readFileSync(join(root, "deploy/self-hosted/functions-bundle.json"), "utf8"));
  const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
  const matrix = JSON.parse(readFileSync(join(root, "deploy/self-hosted/compatibility.json"), "utf8"));
  const upstream = matrix.entries.find((entry) => entry.minddyRelease === version)?.supabase.completeOfficial;
  if (!upstream) throw new Error("The release has no official Supabase compatibility pin.");
  const functionsDir = realpathSync(join(supabaseDir, "docker/volumes/functions"));
  const compose = readFileSync(join(supabaseDir, "docker/docker-compose.yml"), "utf8");
  if (digest(compose) !== upstream.dockerComposeSha256 ||
      digest(readFileSync(join(functionsDir, "main/index.ts"))) !== pin.upstreamMainSha256) {
    throw new Error("Official Supabase Compose or main function differs from the verified release pin.");
  }
  const image = /^  functions:\s*\n[\s\S]*?^    image:\s*(\S+)/m.exec(compose)?.[1];
  if (!/^supabase\/edge-runtime:v[\d.]+$/.test(image ?? "")) throw new Error("The pinned Edge Runtime image is missing.");
  const require = createRequire(join(root, "package.json"));
  const joseDir = dirname(dirname(dirname(realpathSync(require.resolve("jose")))));
  const jose = JSON.parse(readFileSync(join(joseDir, "package.json"), "utf8"));
  if (jose.name !== "jose" || jose.version !== pin.joseVersion) {
    throw new Error(`Install the frozen dependencies: the offline function bundle requires jose ${pin.joseVersion}.`);
  }
  return { pin, functionsDir, joseDir, image };
}

function runDocker(args) {
  const result = spawnSync("docker", args, { encoding: "utf8" });
  if (result.error || result.status !== 0) {
    throw new Error(`Offline function compilation failed: ${result.error?.message || result.stderr || result.stdout}`);
  }
}

export function prepareFunctionsBundle({ supabaseDir, envFile, dryRun = false, root = ROOT, run = runDocker }) {
  const inputs = bundleInputs(supabaseDir, root);
  const output = `${resolve(envFile)}.functions`;
  console.log("→ compile the official Supabase main function with locked dependencies (network disabled).");
  if (dryRun) return output;
  const staging = mkdtempSync(`${resolve(envFile)}.functions-build-`);
  try {
    const input = join(staging, "input");
    const compiled = join(staging, "compiled");
    mkdirSync(input);
    mkdirSync(compiled);
    cpSync(inputs.joseDir, join(input, "vendor/jose"), { recursive: true });
    writeFileSync(join(input, "index.ts"), readFileSync(join(inputs.functionsDir, "main/index.ts")));
    writeFileSync(join(input, "deno.json"), JSON.stringify({ imports: {
      [inputs.pin.importSpecifier]: "./vendor/jose/dist/webapi/index.js",
    } }));
    run([
      "run", "--rm", "--pull", "never", "--network", "none", "--read-only", "--cap-drop", "ALL",
      "--user", `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`,
      "--security-opt", "no-new-privileges:true", "--tmpfs", "/tmp",
      "--env", "DENO_DIR=/tmp/deno",
      "--mount", `type=bind,src=${input},dst=/input,readonly`,
      "--mount", `type=bind,src=${compiled},dst=/output`,
      "--entrypoint", "edge-runtime", inputs.image,
      "bundle", "--entrypoint", "/input/index.ts",
      "--output", "/output/main.eszip", "--checksum", "sha256", "--timeout", "60",
    ]);
    const checksum = digest(readFileSync(join(compiled, "main.eszip")));
    mkdirSync(output, { recursive: true, mode: 0o700 });
    renameSync(join(compiled, "main.eszip"), join(output, "main.eszip"));
    writeFileSync(join(output, "identity.json"), `${JSON.stringify({ ...inputs.pin, image: inputs.image, sha256: checksum }, null, 2)}\n`);
    return output;
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = process.argv.slice(2);
    const value = (name) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };
    const supabaseDir = value("--supabase-dir");
    const envFile = value("--env-file");
    if (!supabaseDir || !envFile) throw new Error("Usage: node scripts/prepare-self-hosted-functions.mjs --supabase-dir <checkout> --env-file <protected-file>");
    prepareFunctionsBundle({ supabaseDir, envFile });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

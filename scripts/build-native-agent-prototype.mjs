import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
await mkdir(path.join(root, ".agent-vm"), { recursive: true });
const result = await build({
  entryPoints: ["lib/server/agent/vm/native-prototype/main.ts"],
  outfile: ".agent-vm/native-prototype.js",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node24",
  metafile: true,
  logLevel: "info",
});
if (Object.keys(result.metafile.inputs).some((name) =>
  /supabase|encryption\/(registry|local-key-wrapper)|api-auth/.test(name))) {
  throw new Error("Native controller bundle includes a server credential dependency");
}

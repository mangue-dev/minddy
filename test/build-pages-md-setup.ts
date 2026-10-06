import { execFileSync } from "node:child_process";
import path from "node:path";

// Rebuild the shipped projection artifact once per run. Projection tests must
// exercise its bundling decisions, including on a clean checkout (MIN-295).
export default function setup(): void {
  const repo = path.resolve(import.meta.dirname, "..");
  execFileSync(
    process.execPath,
    [path.join(repo, "scripts", "build-pages-md.mjs")],
    { cwd: repo, stdio: "inherit" }
  );
}

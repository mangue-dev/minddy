import { execFileSync } from "node:child_process";
import path from "node:path";

/**
 * The page projection bundle, built BEFORE the sequel (MIN-295).
 *
 * `lib/server/pages-projection.ts` no longer loads `lib/pages-markdown.ts` by a
 * import: it `require()` the bundle esbuild by its path, and refuses to fall back on anything else. Without this hook, any test that passes through the
 * projection would fall on "bundle not found".
 *
 * Constructing it here rather than assuming it is present has a second effect, which is
 * the real one: the sequel plays THE ACTUALLY DELIVERED ARTIFACT, not the source it is from
 *shot. That's the whole lesson of the ticket — a runtime test can't tell anything about a build override. The bundle comes out in about a hundred milliseconds.
 */
export default function setup(): void {
  const repo = path.resolve(import.meta.dirname, "..");
  execFileSync(
    process.execPath,
    [path.join(repo, "scripts", "build-pages-md.mjs")],
    { cwd: repo, stdio: "inherit" }
  );
}

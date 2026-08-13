import { execFileSync } from "node:child_process";
import path from "node:path";

/**
 * Le bundle de la projection des pages, construit AVANT la suite (MIN-295).
 *
 * `lib/server/pages-projection.ts` ne charge plus `lib/pages-markdown.ts` par un
 * import : il `require()` le bundle esbuild par son chemin, et refuse de se
 * rabattre sur autre chose. Sans ce crochet, tout test qui traverse la
 * projection tomberait sur « bundle introuvable ».
 *
 * Le construire ici plutôt que de le supposer présent a un second effet, qui est
 * le vrai : la suite joue L'ARTEFACT RÉELLEMENT LIVRÉ, pas le source dont il est
 * tiré. C'est toute la leçon du ticket — un test de runtime ne peut rien dire
 * d'une substitution de build. Le bundle sort en une centaine de millisecondes.
 */
export default function setup(): void {
  const repo = path.resolve(import.meta.dirname, "..");
  execFileSync(
    process.execPath,
    [path.join(repo, "scripts", "build-pages-md.mjs")],
    { cwd: repo, stdio: "inherit" }
  );
}

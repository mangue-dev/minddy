import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/** `git <args>` dans le dépôt, ou `null` si la commande échoue (pas un dépôt,
 * tag absent, historique tronqué…). Jamais de throw : cette mesure est un
 * confort d'affichage, elle n'a pas à faire échouer un build. */
function git(args) {
  try {
    return execFileSync("git", args, {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Le nombre de commits entre la version courante et HEAD — c'est-à-dire le
 * nombre de fois où le code a bougé depuis le dernier `npm run deploy`.
 *
 * Le résultat sépare preview et production tout seul, sans rien connaître de
 * l'environnement : `deploy.sh` tague `v<version>` sur `main` puis fusionne
 * dans `production`, donc la prod est POSÉE sur le tag (→ 0) tandis que `main`
 * s'en éloigne d'un commit à chaque push (→ 1, 2, 3…). C'est l'historique du
 * commit construit qui répond, pas `VERCEL_ENV`.
 *
 * **Sur Vercel, ça demande `VERCEL_DEEP_CLONE=1` dans les variables du projet**
 * (preview ET production) : le clone de build est sinon un `--depth=10`, où
 * ni le tag ni le commit de bump ne sont joignables au-delà de dix commits.
 * Sans la variable, la mesure retombe à 0 et l'app affiche la version nue —
 * le même écran qu'avant cette fonctionnalité, jamais un compte faux.
 *
 * @param {string} [version] version lue dans package.json par défaut
 * @returns {number} 0 quand l'historique ne permet pas de conclure
 */
export function commitsSinceVersion(version) {
  const v =
    version ??
    JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")).version;
  if (!v) return 0;

  // Le tag de release d'abord : c'est lui que `deploy.sh` pose, et il dit
  // exactement « la version déployée ».
  let base = git(["rev-parse", "--verify", "--quiet", `refs/tags/v${v}`]);

  // Sans tag — un clone qui n'a pas récupéré les tags, un dépôt fraîchement
  // forké — le commit de bump dit la même chose : c'est celui qui a introduit
  // ce numéro de version dans package.json, et `deploy.sh` le tague dans la
  // foulée. Les deux mesures coïncident donc toujours.
  if (!base) {
    base = git([
      "log",
      "-1",
      "--format=%H",
      `-S"version": "${v}"`,
      "--",
      "package.json",
    ]);
  }
  if (!base) return 0;

  const count = git(["rev-list", "--count", `${base}..HEAD`]);
  const parsed = Number(count);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * LA COQUILLE, CONTRE LE SERVEUR DE DÉV (`npm run desktop:dev`).
 *
 * L'app de bureau n'embarque aucune UI : elle charge une origine distante. La
 * développer, c'est donc lui donner une AUTRE origine — celle de `next dev` —
 * et c'est tout ce que fait ce script. `MINDDY_DESKTOP_ORIGIN` existe pour ça
 * (lib/desktop/config.ts) ; en production l'origine est en dur, une app dont on
 * peut détourner l'origine par une variable d'environnement est une app dont on
 * peut détourner l'écran de connexion.
 *
 * **Le serveur de dév n'est PAS lancé ici**, et c'est délibéré : il vit
 * généralement déjà dans un autre terminal, et en démarrer un second sur un port
 * déjà pris échouerait de la façon la plus confuse possible. On l'attend, en le
 * disant.
 *
 * Ce que ça ne fait pas non plus : recharger la coquille quand on touche à
 * `desktop/src/` ou à `lib/desktop/`. Ces fichiers-là sont bundlés au démarrage
 * — ⌘Q et on relance. La PAGE, elle, se recharge comme dans un navigateur
 * (⌘R) : c'est le serveur de dév qui la sert, HMR compris.
 */

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(dir, "..");

const port = process.env.PORT ?? "3000";
const origin = process.env.MINDDY_DESKTOP_ORIGIN ?? `http://localhost:${port}`;

/** Le serveur répond-il ? N'importe quel statut vaut oui — une redirection vers
 *  `/login` est une réponse, et c'est même la plus probable au premier essai. */
async function serverIsUp() {
  try {
    await fetch(origin, { redirect: "manual", signal: AbortSignal.timeout(2000) });
    return true;
  } catch {
    return false;
  }
}

async function waitForServer() {
  if (await serverIsUp()) return;
  console.log(`[desktop:dev] ${origin} ne répond pas — lance \`npm run dev\` à côté.`);
  console.log("[desktop:dev] j'attends…");
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    if (await serverIsUp()) return;
  }
}

/** Lance une commande et rend son code de sortie. */
function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", ...options });
    child.on("error", reject);
    child.on("exit", (code, signal) => resolve(signal ? 1 : code ?? 0));
  });
}

await waitForServer();
console.log(`[desktop:dev] serveur trouvé sur ${origin}`);

const built = await run(process.execPath, [path.join(dir, "build-desktop.mjs")], {
  cwd: repo,
});
if (built !== 0) process.exit(built);

const electron = path.join(repo, "desktop", "node_modules", ".bin", "electron");
if (!existsSync(electron)) {
  console.error(
    "[desktop:dev] electron est absent — `npm --prefix desktop install` d'abord."
  );
  process.exit(1);
}

console.log(`[desktop:dev] ouverture de la fenêtre sur ${origin}`);
console.log(
  "[desktop:dev] profil séparé de l'app installée (« minddy-dev ») : les deux" +
    " tournent côte à côte, et il faut se connecter une fois ici."
);

/**
 * ⚠ `ELECTRON_RUN_AS_NODE` est RETIRÉ, et il faut le savoir avant de le
 * découvrir. Quand il vaut `1`, le binaire d'Electron se comporte en simple
 * Node : il exécute le fichier, `require("electron")` ne rend rien, et la
 * fenêtre meurt sur `Cannot read properties of undefined (reading 'setName')`
 * — une erreur qui ne parle de rien de ce qu'on vient de changer.
 *
 * Et il est déjà posé chez nous : **VS Code le met dans l'environnement de tout
 * ce qu'il lance**, terminal intégré compris. Lancé depuis un terminal ordinaire
 * le script marchait, depuis l'éditeur non — la pire forme d'échec.
 */
const env = { ...process.env, MINDDY_DESKTOP_ORIGIN: origin };
delete env.ELECTRON_RUN_AS_NODE;

process.exit(
  await run(electron, ["."], { cwd: path.join(repo, "desktop"), env })
);

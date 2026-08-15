import "server-only";

import { harnessBundleSource } from "./harness-bundle";
import { assertUsableLayout } from "./harness-layout";
import { vmBundlePath, vmJobPath, type VmJob } from "./vm/protocol";
import type { Sandbox } from "./sandbox";

/**
 * LE DÉMARRAGE DE LA BOUCLE DANS LA MICROVM (MIN-224) — le dernier geste de la
 * fonction avant qu'elle ne rende la main.
 *
 * Trois écritures et un lancement : le bundle du harness, le job du tour, puis
 * `node main.js` en `detached: true`. La fonction ne l'attend PAS ; elle persiste
 * l'identifiant de la commande et retourne. À partir de là, la conversation vit
 * dans la VM, et la fonction n'existe plus que comme plan de contrôle.
 *
 * PAS DE `timeoutMs` SUR LA COMMANDE, et c'est délibéré. Le SDK le fait respecter
 * à l'exec, y compris sur une commande détachée : en poser un plafonnerait le
 * tour, ce que la migration existe précisément pour supprimer. Le plafond du tour
 * est celui que la boucle se donne (`VM_TURN_SOFT_DEADLINE_MS`), parce qu'une
 * boucle qui s'arrête écrit son checkpoint — là où une commande tuée par la
 * plateforme ne laisse rien.
 *
 * TOUT VIT HORS DU DÉPÔT. Le harness et le modèle partagent désormais le
 * même disque : sans ça, le `git add -A` de fin de tour emporterait le bundle ET
 * le job — donc l'historique complet de la conversation — dans un commit du dépôt
 * de l'utilisateur, puis dans sa pull request.
 */

/**
 * OÙ LE BUNDLE SE LIT, ET POURQUOI PLUS ICI (MIN-293).
 *
 * La lecture mémoïsée et son message d'erreur vivaient dans ce fichier, qui en
 * était le seul lecteur. Il y en a un second depuis que la machine de
 * l'utilisateur le télécharge, et il a besoin d'une chose de plus : l'EMPREINTE.
 * Les deux sont donc rassemblés dans [harness-bundle.ts](harness-bundle.ts) —
 * une seule lecture, un seul cache, un seul message quand `npm run build:agent-vm`
 * n'a pas tourné. Deux copies auraient fini par servir deux bundles différents à
 * la microVM et au Mac, ce qui est exactement le genre d'écart qui ne se voit
 * qu'en production.
 */

/**
 * Écrit le harness dans la microVM et lance le tour. Rend l'identifiant de la
 * commande, à persister sur la ligne du run : c'est lui, et lui seul, qui
 * permettra au chien de garde de constater que le process est mort — un constat,
 * pas une présomption après vingt minutes de silence.
 *
 * LÈVE si l'un des trois gestes échoue. L'appelant traite ça comme une erreur
 * d'amorçage : la session reste reprennable, avec l'erreur visible. Un run qu'on
 * croirait lancé alors que rien ne tourne serait bien pire — il resterait
 * `running` jusqu'à ce que quelqu'un s'en aperçoive.
 */
export async function startVmLoop(
  sandbox: Sandbox,
  /**
   * Le job SANS `bootstrapMs` : ce champ appartient à cette fonction, et à elle
   * seule. L'appelant ne peut donc ni l'oublier ni en inventer un — c'est ici
   * qu'on sait ce que l'amorçage a duré, parce que c'est ici qu'il se termine.
   */
  job: Omit<VmJob, "bootstrapMs">,
  /**
   * Quand la fonction a commencé à travailler sur ce tour (`callStart`). Sert à
   * mesurer l'amorçage, que la boucle ajoutera à son propre wall-clock : la
   * microVM tournait déjà pendant qu'on la réveillait (cf. `VmJob.bootstrapMs`).
   */
  callStartMs: number,
): Promise<string> {
  /**
   * LE LAYOUT EST CONTRÔLÉ D'ABORD, avant même de lire le bundle (MIN-354). Le
   * harness le refuse aussi (`parseVmJob`), mais seulement une fois la microVM
   * réveillée et le dépôt cloné : le dire ici fait échouer l'amorçage — quelque
   * chose que la fonction journalise et dont la session se reprend — plutôt
   * qu'un tour lancé pour rien. Et `repoDir` est la racine de sécurité des
   * garde-fous d'écriture : elle se contrôle là où on l'écrit.
   */
  assertUsableLayout(job.layout);

  const bundle = await harnessBundleSource();

  /**
   * LES CHEMINS VIENNENT DU JOB, et c'est lui qui les porte parce que c'est lui
   * que le harness lira. Trois écritures et un lancement au même endroit : si le
   * layout change, rien ici ne peut se désynchroniser de ce que le harness croit.
   */
  const { harnessDir } = job.layout;
  const bundlePath = vmBundlePath(job.layout);
  const jobPath = vmJobPath(job.layout);

  await sandbox.mkDir(harnessDir).catch(() => {});
  await sandbox.writeFiles([{ path: bundlePath, content: bundle }]);

  /**
   * DEUX ÉCRITURES ET PAS UNE, et c'est le prix de la mesure. Le job doit porter
   * la durée de l'amorçage, donc il ne peut être sérialisé qu'APRÈS ce qui la
   * compose — le réveil de la microVM, le clone, et les 280 Ko de bundle
   * ci-dessus. Un seul `writeFiles` obligerait à figer le chiffre avant sa plus
   * grosse part.
   *
   * L'aller-retour de plus coûte ~200 ms sur un amorçage qui se compte en
   * secondes (~22 s à froid). Ce qui reste hors de la mesure — cette écriture-ci
   * et le lancement — se compte en centaines de millisecondes, et on le
   * SOUS-facture : c'est le bon sens de l'erreur.
   */
  const withBootstrap: VmJob = { ...job, bootstrapMs: Date.now() - callStartMs };
  // Le job porte l'historique de la conversation : c'est le plus gros des deux,
  // et c'est pour lui que `harnessDir` est hors du dépôt.
  await sandbox.writeFiles([{ path: jobPath, content: JSON.stringify(withBootstrap) }]);

  const command = await sandbox.runCommand({
    cmd: "node",
    // Le chemin du job en ARGUMENT : c'est la seule chose que le harness ne peut
    // pas apprendre du job lui-même (cf. `vmJobPath`).
    args: [bundlePath, jobPath],
    cwd: harnessDir,
    detached: true,
  });
  return command.cmdId;
}

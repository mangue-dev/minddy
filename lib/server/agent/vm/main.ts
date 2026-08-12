import { readFile } from "node:fs/promises";

import { createControlPlaneClient } from "./control-plane-client";
import { localHost } from "./local-host";
import { opencodeSupervisorDeps } from "./opencode-host";
import { OPENCODE_PORT, runOpencodeTurn } from "./supervisor";
import { runVmTurn } from "./turn";
import { VM_JOB_PATH, type VmJob, type VmTurnReport } from "./protocol";

/**
 * L'ENTRÉE DU HARNESS DANS LA MICROVM (MIN-224) — le point que la fonction lance
 * en `detached: true` avant de rendre la main.
 *
 * `node /vercel/sandbox/harness/main.js`, et c'est tout. Le bundle est écrit par
 * `writeFiles` au démarrage du tour, à côté de son job ; les deux vivent HORS de
 * `REPO_DIR`, pour que le `git add -A` de fin de tour ne les emporte jamais dans
 * un commit du dépôt de l'utilisateur (cf. `HARNESS_DIR`).
 *
 * CE QUE CE FICHIER GARANTIT, et c'est sa seule vraie raison d'être : **le tour
 * rend TOUJOURS un rapport**. La fonction a rendu la main, personne ne l'attend,
 * et un process qui meurt sans parler laisse un run `running` que seul le chien
 * de garde finira par constater mort — plusieurs minutes plus tard, sur le
 * dernier checkpoint périodique, avec du travail perdu entre les deux. D'où le
 * `try` global, et le rapport minimal qu'il rend quand tout le reste a échoué.
 *
 * Le process ne détient AUCUN secret. Le firewall pose la clé du modèle après la
 * sortie de la VM, et le plan de contrôle prouve l'identité du run par un OIDC de
 * la plateforme : `env | grep -i key` ne rend rien ici, et c'est mesuré
 * (docs/orchestrateur-process-long.md §1).
 */

/**
 * L'AIGUILLAGE DES DEUX MOTEURS (MIN-286) — sur `job.engine`, et rien d'autre.
 *
 * Le drapeau a été gelé sur la ligne du run au lancement
 * ([engine-flag.ts](../engine-flag.ts)) : ce qui est lu ici est donc ce qui a été
 * décidé au premier tour de la conversation, jamais l'état courant d'`app_config`.
 * C'est ce qui fait qu'une session ne change pas de moteur en cours de vie — les
 * deux gardent leur mémoire dans deux champs différents du checkpoint.
 *
 * Un job `opencode` SANS `opencodeInput` est une faute de la fonction, pas une
 * variante : on lève plutôt que de poster un tour vide, et le `try` de `main`
 * transforme cela en rapport d'erreur — c'est-à-dire en quelque chose qui se voit.
 */
async function runOpencodeTurnHere(
  job: VmJob,
  cp: ReturnType<typeof createControlPlaneClient>,
  host: ReturnType<typeof localHost>,
): Promise<VmTurnReport> {
  if (!job.opencodeInput) throw new Error("engine=opencode job carries no opencodeInput");
  return await runOpencodeTurn(job, job.opencodeInput, cp, host, {
    ...opencodeSupervisorDeps(OPENCODE_PORT),
  });
}

async function main(): Promise<void> {
  const job = JSON.parse(await readFile(VM_JOB_PATH, "utf8")) as VmJob;
  const cp = createControlPlaneClient(job.appOrigin);
  const host = localHost();
  const startedAt = Date.now();

  let report: VmTurnReport;
  try {
    report = job.engine === "opencode" ? await runOpencodeTurnHere(job, cp, host) : await runVmTurn(job, cp, host);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[agent-vm] turn crashed:", message);
    await cp.emit("error", { message }).catch(() => {});
    /**
     * LE RAPPORT DE SECOURS, et il ne porte AUCUN checkpoint. `runVmTurn` a levé,
     * donc son historique est dans un état qu'on n'a aucune raison de croire
     * cohérent — un `tool_call` sans son `tool_result` casserait le tour suivant
     * au round-trip. Et il n'y a pas de « checkpoint du début » à lui opposer :
     * `job.messages` EST le tableau que la boucle mute en place, pas une copie.
     *
     * Le dernier checkpoint PÉRIODIQUE, lui, a été écrit à une frontière de round
     * sûre. La fonction le garde tel quel (cf. `VmTurnReport.checkpoint`) : ce
     * rapport-ci ne le remplace pas, il dit seulement que le tour est fini et
     * pourquoi.
     */
    report = {
      status: "error",
      errorMessage: message.slice(0, 1000),
      costUsd: 0,
      checkpointDropped: [],
      checkpointBytes: 0,
      pushed: null,
      workBranch: job.workBranch,
      // Même règle que la sortie saine : l'amorçage a coûté de la microVM, et un
      // tour qui lève ne doit pas être l'occasion de ne pas le facturer.
      sandboxMs: job.bootstrapMs + (Date.now() - startedAt),
    };
  }

  await cp.reportTurn(report);
}

main().then(
  () => process.exit(0),
  (err) => {
    // On n'arrive ici que si le RAPPORT lui-même n'est pas passé — plan de
    // contrôle injoignable, ou job illisible. Rien à sauver depuis la VM : le
    // chien de garde constatera le décès et mettra la session au repos sur son
    // dernier checkpoint. Le code de sortie non nul est ce qu'il lira.
    console.error("[agent-vm] fatal:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  },
);

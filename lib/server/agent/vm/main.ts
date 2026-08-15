import { readFile } from "node:fs/promises";

import { cloudLayout } from "../harness-layout";
import { createControlPlaneClient } from "./control-plane-client";
import { reservePort } from "./free-port";
import { localHost } from "./local-host";
import { opencodeSupervisorDeps } from "./opencode-host";
import { runOpencodeTurn } from "./supervisor";
import { parseVmJob, vmJobPath, type VmJob, type VmTurnReport } from "./protocol";

/**
 * L'ENTRÉE DU HARNESS (MIN-224) — le point que le lanceur démarre en
 * `detached: true` avant de rendre la main.
 *
 * `node main.js <chemin du job>`, et c'est tout. Le bundle est écrit au démarrage
 * du tour, à côté de son job ; les deux vivent HORS du dépôt, pour que le
 * `git add -A` de fin de tour ne les emporte jamais dans un commit du dépôt de
 * l'utilisateur (cf. `HarnessLayout.harnessDir`).
 *
 * LE CHEMIN DU JOB VIENT DE L'ARGUMENT, PAS D'UNE CONSTANTE (MIN-354), et c'est
 * la seule chose que ce process apprend d'ailleurs que du job lui-même : tout le
 * reste — dépôt, sorties de tools, harness, opencode — est DANS le job. L'œuf et
 * la poule se dénouent là, et nulle part ailleurs.
 *
 * CE QUE CE FICHIER GARANTIT, et c'est sa seule vraie raison d'être : **le tour
 * rend TOUJOURS un rapport**. La fonction a rendu la main, personne ne l'attend,
 * et un process qui meurt sans parler laisse un run `running` que seul le chien
 * de garde finira par constater mort — plusieurs minutes plus tard, sur le
 * dernier checkpoint périodique, avec du travail perdu entre les deux. D'où le
 * `try` global, et le rapport minimal qu'il rend quand tout le reste a échoué.
 *
 * DANS UNE MICROVM, le process ne détient AUCUN secret. Le firewall pose la clé du
 * modèle après la sortie de la VM, et le plan de contrôle prouve l'identité du run
 * par un OIDC de la plateforme : `env | grep -i key` ne rend rien ici, et c'est
 * mesuré (docs/orchestrateur-process-long.md §1).
 *
 * SUR LA MACHINE DE L'UTILISATEUR, CETTE PHRASE CESSE D'ÊTRE VRAIE (MIN-355,
 * MIN-357), et il vaut mieux l'écrire que la laisser se périmer. Il n'y a pas de
 * firewall, donc ce process détient DEUX choses :
 *
 * 1. **un jeton d'exécution locale** (`controlToken`), porté par le job et posé
 *    sur chacun de ses appels au plan de contrôle. Il est lisible par ce que le
 *    tour exécute ; ce qui le rend tenable n'est pas une cachette, c'est ce qu'il
 *    N'OUVRE PAS — voir `handleControlPlaneRequest` et
 *    [local-exec-token.ts](../local-exec-token.ts) ;
 * 2. **la clé du modèle**, qui n'est PAS dans le job : elle est demandée au
 *    démarrage du tour (`/llm-key`) et ne vit que dans la mémoire du proxy LLM
 *    ([llm-proxy.ts](llm-proxy.ts)), donc hors de l'environnement du serveur
 *    opencode, que le modèle lit par un simple `env`. Elle est toujours mintée à
 *    plafond dur : c'est le plafond, et lui seul, qui borne ce qu'un modèle
 *    hostile peut en faire.
 */

/**
 * IL N'Y A PLUS QU'UN MOTEUR (MIN-286) — opencode, et l'aiguillage du job a
 * disparu avec la boucle maison.
 *
 * Un job SANS `opencodeInput` est une faute de la fonction, pas une variante : on
 * lève plutôt que de poster un tour vide, et le `try` de `main` transforme cela en
 * rapport d'erreur — c'est-à-dire en quelque chose qui se voit.
 */
async function runOpencodeTurnHere(
  job: VmJob,
  cp: ReturnType<typeof createControlPlaneClient>,
  host: ReturnType<typeof localHost>,
): Promise<VmTurnReport> {
  if (!job.opencodeInput) throw new Error("job carries no opencodeInput");
  /**
   * LE PORT D'OPENCODE, DEMANDÉ AU SYSTÈME (MIN-354) — 4096 en dur tant que la
   * microVM était à nous seuls, réservé ici depuis qu'une machine peut porter
   * deux runs (cf. [free-port.ts](free-port.ts)). Le pont de tools, lui, écoute
   * sur un port éphémère de lui-même et rend son URL.
   */
  const opencodePort = await reservePort();
  return await runOpencodeTurn(job, job.opencodeInput, cp, host, {
    ...opencodeSupervisorDeps({ port: opencodePort, layout: job.layout }),
    opencodePort,
  });
}

/**
 * Où lire le job. L'argument du lanceur fait foi ; le repli est le chemin de la
 * microVM, le seul monde où il n'y a jamais eu qu'une racine possible.
 */
function jobPathFromArgv(): string {
  const given = process.argv[2]?.trim();
  return given || vmJobPath(cloudLayout());
}

async function main(): Promise<void> {
  /**
   * LE JOB EST LU BRUT, PUIS VALIDÉ DANS LE `try` (MIN-354) — et pas avant.
   *
   * Le refus d'un contrat inconnu (`parseVmJob`) est une fin de tour comme une
   * autre : il doit sortir par le même rapport que le reste, sinon un harness
   * périmé laisse un run `running` que seul le chien de garde finira par
   * constater mort. Seul `appOrigin` est lu hors validation, parce qu'il faut
   * bien une adresse pour dire qu'on refuse — c'est le champ le plus ancien du
   * contrat, et le seul dont on ne puisse rien faire d'autre.
   *
   * DEPUIS MIN-355, IL Y EN A UN SECOND, et pour la même raison exactement : sur
   * la machine de l'utilisateur, une adresse ne suffit pas à parler, il faut aussi
   * le jeton. Le lire hors validation est ce qui garde vraie la promesse de ce
   * fichier — le tour rend TOUJOURS un rapport, y compris quand ce rapport dit
   * « je refuse ce job ».
   */
  const raw = JSON.parse(await readFile(jobPathFromArgv(), "utf8")) as {
    appOrigin?: string;
    controlToken?: string;
  };
  const cp = createControlPlaneClient(
    raw.appOrigin ?? "",
    // Un getter, parce que le jeton dure quinze minutes et un tour des heures :
    // c'est ici que le renouvellement se branchera (MIN-294), sans toucher au
    // client. Aujourd'hui il rend toujours ce que le job portait.
    () => raw.controlToken ?? null,
  );
  const startedAt = Date.now();

  let job: VmJob | null = null;
  let report: VmTurnReport;
  try {
    job = parseVmJob(raw);
    report = await runOpencodeTurnHere(job, cp, localHost(job.layout));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[agent-vm] turn crashed:", message);
    await cp.emit("error", { message }).catch(() => {});
    /**
     * LE RAPPORT DE SECOURS, et il ne porte AUCUN checkpoint. Le superviseur a
     * levé, donc on n'a aucune raison de croire son pointeur de journal à jour —
     * et un pointeur en avance sur ce qui a été écrit ferait repartir le tour
     * suivant d'une session qu'il ne peut pas rejouer.
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
      // `null` quand c'est le JOB qui a été refusé : rien de lui n'est digne de
      // confiance, pas même la branche de travail.
      workBranch: job?.workBranch ?? "",
      // Même règle que la sortie saine : l'amorçage a coûté de la microVM, et un
      // tour qui lève ne doit pas être l'occasion de ne pas le facturer.
      sandboxMs: (job?.bootstrapMs ?? 0) + (Date.now() - startedAt),
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

import {
  newVerificationSink,
  noteVerificationCommand,
  noteVerificationStale,
  type VerificationSink,
} from "../diagnostics";
import {
  gateCreatePr,
  gateWritePlan,
  makeDeliveryGate,
  type DeliveryGate,
  type DeliveryGateDeps,
} from "../delivery-gate";
import { newPlanWriteSink, watchPlanWrites } from "../plan-closure";
import { turnDiffStat, turnTouchedPaths, type RepoHost } from "../repo-host";
import type { PlatformToolHandler } from "../agent-contract";

/**
 * LES RÈGLES DE LIVRAISON, TENUES AU-DESSUS D'OPENCODE (MIN-286, lot 2, tâche 14).
 *
 * Ce que le harness vérifie n'a pas changé d'une ligne : la porte de livraison
 * ([delivery-gate.ts](../delivery-gate.ts)), l'auto-relecture du diff
 * ([self-review.ts](../self-review.ts)), la clôture du plan
 * ([plan-closure.ts](../plan-closure.ts)) et les diagnostics
 * ([diagnostics.ts](../diagnostics.ts)) sont les MÊMES fonctions, avec leurs
 * tests inchangés. Ce module est le câblage : il leur donne, dans le monde
 * d'opencode, les trois faits qu'elles lisaient dans nos tools.
 *
 * | Ce que la règle lit | Où le harness maison le prenait | Où on le prend ici |
 * | --- | --- | --- |
 * | `editedPaths` | le tool `edit_file` / `write_file` / `apply_patch` | la **demande de permission** `edit`, autorisée (`metadata.filepath`) |
 * | `verification` (le modèle a-t-il testé ?) | le code de sortie de `run_command` | `state.metadata.exit` du tool `bash` |
 * | `planWrites` | `watchPlanWrites` sur les tools ticket | le même `watchPlanWrites`, posé sur le passe-plat du pont |
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI ICI, ET PAS EN PLUGIN OPENCODE COMME LE PLAN L'ANNONÇAIT
 *
 * Le cadrage disait « réimplantés en plugin opencode
 * (`tool.execute.before/after`, `session.idle`) ». Deux choses mesurées depuis
 * l'ont rendu inutile, et coûteux :
 *
 * - **les tools qui déclenchent les règles passent DÉJÀ par nous.**
 *   `write_issue_plan` et `create_pr` sont des tools de domaine : ils arrivent au
 *   pont ([tool-bridge.ts](tool-bridge.ts)), qui est exactement le
 *   `tool.execute.after` qu'un plugin aurait offert, sans second processus ni
 *   second vocabulaire ;
 * - **les deux faits qui viennent des tools INTÉGRÉS (édition, shell) arrivent
 *   sur le flux `/event`**, que le superviseur lit déjà — la permission pour
 *   l'un, le part du tool pour l'autre.
 *
 * Un plugin aurait donc ajouté un troisième endroit où le harness parle au
 * modèle, dans un fichier généré tournant *dans* opencode, sans rien rendre que
 * ces deux chemins ne rendent. La règle du chantier tient : **on ne redéclare
 * jamais ce que la seule source dit déjà.**
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ON ASSUME, ET QUI SE VOIT
 *
 * 1. **L'édition est notée à l'AUTORISATION, pas à l'exécution.** Une écriture
 *    autorisée puis ratée (disque plein, `oldString` introuvable) laisse son
 *    chemin dans `editedPaths` : le tour paie un type-check qu'il n'avait pas à
 *    payer. C'est le sens prudent — l'inverse (rater une édition réelle) rendrait
 *    la porte muette sur le code qui part chez un humain.
 * 2. **Le shell ne remplit le registre de vérification que si son code de sortie
 *    est LISIBLE** (`metadata.exit`, un nombre — la source d'opencode le pose sur
 *    chaque commande, `null` sur un abandon ou un timeout). Sans lui, on ne
 *    conclut rien, et la porte relance la suite entière : un faux « c'est vert »
 *    ferait TAIRE le harness sur un tour que personne n'a vérifié (`diagnostics.ts`).
 */

/** Ce qu'un tool rend au pont, la voix du harness comprise. */
export interface DeliveryToolOutcome {
  result: unknown;
  success: boolean;
  /**
   * Ce que le harness a de LONG à dire sur cet appel. Le pont le colle APRÈS le
   * résultat, dans le texte que le tool rend au modèle : chez opencode un
   * résultat de tool EST du texte, il n'y a pas de message `user` à insérer
   * après le round comme la boucle maison le faisait.
   */
  followUp?: string;
}

/** Un tool que le superviseur exécute lui-même — `create_pr` aujourd'hui. */
export type DeliveryTool = (args: Record<string, unknown>) => Promise<DeliveryToolOutcome>;

/**
 * Chemins d'édition gardés au checkpoint. La même valeur que
 * [turn.ts](turn.ts) : ce qu'on garde sert à mettre en tête les erreurs de
 * typage du tour, pas à tenir un journal.
 */
export const CHECKPOINT_EDITED_PATHS_MAX = 200;

export interface OpencodeDeliveryDeps {
  host: RepoHost;
  emit: DeliveryGateDeps["emit"];
  /** Baseline du diff du tour (`lastFilesSha` du checkpoint, ou la tête d'origine). */
  filesFromSha: string;
  /** Fichiers édités par les tours PRÉCÉDENTS, tels que le checkpoint les porte. */
  editedPaths?: readonly string[];
  /** Graine du verrou « le dépôt a été touché » — vient du checkpoint. */
  repoTouched?: boolean;
  /**
   * LE PÉRIMÈTRE DU TOUR en mode dépôt courant (MIN-358) — cf.
   * `DeliveryGateDeps.scopePaths`. Absent en mode clone.
   *
   * C'est le superviseur qui le calcule, parce que lui seul a l'instantané pris
   * au DÉBUT du tour ; ce module lui rend en échange les éditions de ce tour
   * (`turnEditedPaths`), qui en sont l'autre moitié.
   */
  scopePaths?: () => Promise<readonly string[]>;
  /** Ce qu'il reste de budget mural au tour, pour que la porte se taise à temps. */
  remainingMs: () => number;
}

export interface OpencodeDelivery {
  /**
   * Le passe-plat des tools de domaine, enveloppé : il note le plan écrit
   * (`watchPlanWrites`) et rend le contrôle du plan en `followUp`
   * (`gateWritePlan`).
   */
  wrapDomainTool(handler: PlatformToolHandler): PlatformToolHandler;
  /** `create_pr`, enveloppé de sa porte : le premier appel d'un tour qui a édité
   *  rend les contrôles au lieu de pousser (`gateCreatePr`). */
  wrapCreatePr(handler: DeliveryTool): DeliveryTool;
  /** Une écriture vient d'être AUTORISÉE — chemin absolu ou relatif au dépôt. */
  noteEdit(filepath: string): void;
  /** Une commande du modèle s'est terminée, avec son code de sortie. */
  noteShell(command: string, exit: number): void;
  /** Note les éditions en attente comme « dépôt touché », avant le push. */
  noteEdits(): void;
  /**
   * REGARDE L'ARBRE DE TRAVAIL, et ouvre la porte s'il a bougé. Le seul moyen de
   * voir ce qui n'est passé par aucun tool d'écriture (cf. `noteRepoTouched`).
   */
  probeRepoTouched(): Promise<void>;
  repoTouched(): boolean;
  /** Ce que le checkpoint doit porter — capé, et vide quand il n'y a rien. */
  checkpointEditedPaths(): string[];
  /**
   * LES ÉDITIONS DE CE TOUR-CI, sans celles qu'il a héritées du checkpoint
   * (MIN-358) — la moitié « tools » du périmètre du tour.
   *
   * La distinction ne servait à rien tant que le dépôt était à nous. Elle décide
   * de tout en mode dépôt courant : après un tour, le travail de l'agent reste
   * « modifié » dans l'arbre de travail (nos commits vivent sur une ref, pas sur
   * le HEAD de l'utilisateur), donc le confondre avec le sien ferait passer
   * chaque fichier de l'agent pour du travail humain emporté.
   */
  turnEditedPaths(): string[];
}

export function makeOpencodeDelivery(deps: OpencodeDeliveryDeps): OpencodeDelivery {
  const editedPaths = new Set<string>(deps.editedPaths ?? []);
  /**
   * Le journal d'attribution ne se vide jamais pendant le run. `editedPaths`
   * est une file de travail pour le type-check et la porte la consomme ; le
   * réutiliser pour le diff ferait perdre l'identité des fichiers juste après
   * leur vérification. Surtout, seuls `noteEdit` et le checkpoint alimentent ce
   * journal : le delta global de Git ne peut pas savoir quel agent a écrit.
   */
  const attributedPaths = new Set<string>(deps.editedPaths ?? []);
  /** Les éditions de CE tour (cf. `turnEditedPaths`). `editedPaths`, lui, part du
   *  checkpoint ET se vide à chaque type-check : ni l'un ni l'autre ne peut dire
   *  ce que le tour courant a écrit. */
  const turnEdited = new Set<string>();
  const planWrites = newPlanWriteSink();
  const verification: VerificationSink = newVerificationSink();

  const gate: DeliveryGate = makeDeliveryGate({
    host: deps.host,
    emit: deps.emit,
    editedPaths,
    planWrites,
    verification,
    filesFromSha: deps.filesFromSha,
    repoTouched: deps.repoTouched ?? false,
    ...(deps.scopePaths ? { scopePaths: deps.scopePaths } : {}),
    logPrefix: "[supervisor]",
  });

  /**
   * CE QUE LE SHELL A FAIT AU DÉPÔT, LU DANS LE DÉPÔT (MIN-286).
   *
   * Sous opencode, supprimer et renommer sont des commandes, pas des tools : ni
   * `rm`, ni `mv`, ni `sed -i`, ni un codemod ne passent par une demande de
   * permission `edit`, donc rien ne remplissait `editedPaths` — et un tour qui ne
   * faisait QUE ça franchissait la porte de livraison sans un contrôle, alors que
   * la boucle maison le voyait par ses tools `delete_file` / `move_file`.
   *
   * Deux gestes, et ils ne disent pas la même chose : les fichiers encore là
   * entrent dans `editedPaths` (c'est ce que le type-check ciblé doit regarder),
   * et le verrou se pose dès que l'arbre diffère — une suppression ne laisse aucun
   * chemin à noter, mais elle compte autant.
   *
   * Best-effort de bout en bout : une lecture de git en panne ne doit jamais
   * empêcher un tour de livrer.
   */
  const probeRepoTouched = async (): Promise<void> => {
    // Un tour qui a édité par ses tools n'a rien à apprendre de git : `noteEdits`
    // latche déjà, et remplacer sa liste par le diff ENTIER du tour élargirait le
    // type-check ciblé à tout ce qui a changé depuis le premier tour. Le sondage
    // est un RECOURS, pour le seul cas où l'on n'a rien d'autre.
    if (gate.repoTouched() || editedPaths.size > 0) return;
    // Le périmètre du tour BORNE le sondage en mode dépôt courant (MIN-358) :
    // sans lui, le WIP de l'utilisateur ferait dire à un tour purement
    // conversationnel qu'il a touché au dépôt, et lui ferait payer un type-check
    // et une suite de tests sur des fichiers dont il n'a jamais entendu parler.
    const scope = await deps.scopePaths?.().catch(() => undefined);
    const stat = await turnDiffStat(deps.host, deps.filesFromSha, scope).catch(() => null);
    if (!stat) return;
    if (stat.files.length === 0 && stat.untracked === 0 && stat.lines === 0) return;
    /**
     * LA LISTE COMPLÈTE, et pas celle de `turnDiffStat` : elle EXCLUT les
     * suppressions et ne compte les fichiers neufs qu'en nombre. Un tour qui n'a
     * fait que `rm lib/x.ts` laissait donc `editedPaths` vide — et le type-check
     * de fin de tour se tait sur une liste vide (`delivery-gate.ts`), alors que
     * c'est exactement le changement qui casse le typage ailleurs. La boucle
     * maison, elle, notait le chemin supprimé (`delete_file` → `noteEdited`).
     */
    for (const path of await turnTouchedPaths(deps.host, deps.filesFromSha, scope)) {
      editedPaths.add(path);
    }
    for (const path of stat.files) editedPaths.add(path);
    /**
     * …ET CE QUE LE MODÈLE AVAIT VÉRIFIÉ NE VAUT PLUS. Même règle que
     * `noteEdit` : un `npm test` vert lancé AVANT ces changements ne dit rien
     * d'eux, et le laisser debout ferait TAIRE la porte de livraison sur un tour
     * dont personne n'a vu le code tourner. La boucle maison périmait de même,
     * depuis ses tools d'édition et de suppression.
     */
    noteVerificationStale(verification);
    gate.noteRepoTouched();
  };

  return {
    wrapDomainTool: (handler) =>
      gateWritePlan(watchPlanWrites(handler, planWrites), gate, deps.remainingMs),

    wrapCreatePr: (handler) => {
      const gated = gateCreatePr(handler, gate, deps.remainingMs);
      // Sondé AVANT la porte : c'est elle qui décide de rendre les contrôles ou
      // de pousser, et elle décide sur `repoTouched`.
      return async (args) => {
        await probeRepoTouched();
        return await gated(args);
      };
    },

    probeRepoTouched,

    noteEdit(filepath: string) {
      const relative = repoRelative(deps.host.layout.repoDir, filepath);
      if (!relative) return;
      editedPaths.add(relative);
      attributedPaths.add(relative);
      turnEdited.add(relative);
      // Toute édition périme ce que le modèle avait vérifié : vert AVANT la
      // dernière édition ne veut rien dire (`diagnostics.ts`).
      noteVerificationStale(verification);
    },

    noteShell(command: string, exit: number) {
      noteVerificationCommand(verification, command, exit);
    },

    noteEdits: () => gate.noteEdits(),
    repoTouched: () => gate.repoTouched(),
    checkpointEditedPaths: () => [...attributedPaths].slice(-CHECKPOINT_EDITED_PATHS_MAX),
    turnEditedPaths: () => [...turnEdited],
  };
}

/**
 * Le chemin RELATIF au dépôt, ou `""` si le chemin n'est pas dedans.
 *
 * `metadata.filepath` d'opencode est ABSOLU (mesuré, cf.
 * [opencode-permissions.ts](opencode-permissions.ts)) là où le type-check et le
 * mode ciblé du runner de tests parlent en chemins de dépôt. Ce qui sort du
 * dépôt n'est pas noté : la permission le refusera de toute façon, et un
 * `/etc/passwd` en tête d'un bloc d'erreurs de typage n'aiderait personne.
 */
export function repoRelative(repoDir: string, filepath: string): string {
  const trimmed = filepath.trim();
  if (!trimmed) return "";
  if (!trimmed.startsWith("/")) return trimmed.replace(/^\.\//, "");
  if (trimmed === repoDir) return "";
  return trimmed.startsWith(`${repoDir}/`) ? trimmed.slice(repoDir.length + 1) : "";
}

import {
  layoutForRoot,
  layoutForCurrentRepo,
  runScopedRoot,
  type HarnessLayout,
} from "@/lib/server/agent/harness-layout";

/**
 * UN TOUR QUI JOUE SUR CETTE MACHINE (MIN-293) — la moitié qui se décide sans
 * disque.
 *
 * ## L'invariant de partage, et tout ce fichier en découle
 *
 * **Le serveur possède tout ce qui concerne le RUN ; la machine possède tout ce
 * qui concerne le DISQUE.** Le serveur ne connaît aucun chemin de cet
 * ordinateur — un chemin de home ne veut rien dire ailleurs que sur la machine
 * qui le porte, et le ranger côté base le publierait, faux, à tous les membres du
 * projet ([local-repo.ts](local-repo.ts)). L'app, symétriquement, ne fabrique
 * aucun champ de job : le modèle, l'ancrage, le budget, l'`authUrl`, le journal
 * d'opencode et le bail sont des décisions qu'elle n'a pas les moyens de prendre.
 *
 * Le contrat qui les relie est donc exactement un `VmJob` **amputé de son
 * `layout`** — le seul champ qui parle de disque — et de son `bootstrapMs`, qui
 * mesure un compute de microVM qui n'existe pas ici.
 *
 * ## Quatre champs que la machine pose, et deux qu'elle RÉÉCRIT
 *
 * `layout` et `bootstrapMs` sont les siens par construction. Les deux autres sont
 * des valeurs que le serveur a mises et qu'elle remplace, et ce ne sont pas des
 * exceptions à l'invariant — ce sont des faits de disque déguisés en champs de run :
 *
 * - **`appOrigin`** : le serveur le résout par `agentControlOrigin()`, qui
 *   retombe sur la production hors Vercel. Une coquille en preview ou en dév
 *   parlerait alors à `www.minddy.app` avec un bail signé ailleurs. La règle est
 *   plus simple que n'importe quel arbitrage : **la machine ne parle qu'à
 *   l'origine qui lui a donné son travail.** Elle sait laquelle, c'est celle du
 *   canal actif ; le serveur, lui, ne sait pas d'où on l'appelle.
 * - **`repoMode`** : le serveur ne sait produire qu'un `clone` — c'est lui qui
 *   crée la microVM et clone dedans. Le mode `current` (décision D2 : l'agent
 *   travaille dans le dépôt que l'humain a déjà) appartient à qui OUVRE ce dépôt,
 *   et c'est la machine. Posé en VALEUR, jamais déduit : un job muet joué comme
 *   un clone ferait un `git add -A` et un `git checkout -b` dans le checkout de
 *   quelqu'un.
 *
 * Et `bootstrapMs` vaut zéro, pas « ce que le téléchargement a coûté » :
 * `billableSandboxMs` ([vm-rest.ts](../server/agent/vm-rest.ts)) borne déjà côté
 * serveur, et facturer des minutes de Mac reviendrait à faire payer une machine
 * que l'utilisateur a lui-même fournie.
 *
 * ## Le layout : le dépôt est ailleurs, tout le reste est sous la racine du run
 *
 * `layoutForCurrentRepo` ([harness-layout.ts](../server/agent/harness-layout.ts))
 * dit la règle : le harness, ses sorties de tools et son `.tsbuildinfo` ne sont
 * JAMAIS dans le dépôt — sinon ils apparaîtraient dans le `git status` de
 * l'utilisateur et dans le périmètre du tour. La racine du run, elle, est un
 * dossier par identifiant : deux tickets lancés à la suite sur le même poste
 * partageraient sinon le job, la base SQLite d'opencode et les sorties de tools.
 *
 * ## Pourquoi le job n'est PAS typé `VmJob` ici
 *
 * On aimerait l'importer — c'est le contrat, il est vérifié par le compilateur,
 * et c'est toute la valeur de [vm/protocol.ts](../server/agent/vm/protocol.ts).
 * Mais ce fichier-là type-importe `../runs`, qui est `server-only` : le suivre
 * ferait entrer la moitié du serveur dans le type-check de la coquille, qui n'a
 * ni `global.d.ts` ni les mêmes réglages, et qui tombe alors sur une quarantaine
 * de fichiers n'ayant rien à voir avec elle (mesuré).
 *
 * La coquille ne LIT donc du job que les quatre champs dont elle se sert, et
 * **fait suivre le reste sans y toucher** — ce qui est exactement l'invariant
 * ci-dessus, écrit une seconde fois par les types. La vérification de contrat,
 * elle, n'est pas perdue : elle vit dans
 * [local-turn.test.ts](local-turn.test.ts), qui tourne sous le tsconfig racine et
 * affirme que ce que `assignmentToJob` produit satisfait bien `VmJob`. C'est le
 * seul endroit où les deux graphes ont le droit de se rencontrer.
 *
 * Décisions ici, `fork` et `fs` dans
 * [desktop/src/launcher.ts](../../desktop/src/launcher.ts).
 */

/**
 * CE QUE LA MACHINE LIT DU JOB — quatre champs, et le reste voyage tel quel.
 *
 * L'index signature n'est pas un renoncement : elle DIT que tout le reste du job
 * est opaque pour la coquille, et elle refuse par construction qu'un champ de plus
 * y soit lu sans être déclaré ici.
 */
export interface AssignedJob {
  /** Doit être celui du harness qu'on va exécuter (cf. `bundleDecision`). */
  readonly protocolVersion: number;
  readonly runId: string;
  /** Le bail. Sa présence EST ce qui fait d'un job un job local (`isLocalJob`). */
  readonly controlToken: string;
  /** L'URL de push, token de forge compris — un secret du journal. */
  readonly authUrl?: string;
  /** Référence lisible du run (`MIN-293`), pour nommer le tour dans la boîte du ⌘Q. */
  readonly commitRef?: string;
  readonly [key: string]: unknown;
}

/** Le job COMPLET, tel que le harness le lira. Les trois champs de la machine
 *  s'ajoutent aux siens ; le reste est intact. */
export interface LocalJob extends AssignedJob {
  readonly layout: HarnessLayout;
  readonly appOrigin: string;
  readonly repoMode: "clone" | "current";
  readonly bootstrapMs: 0;
}

/** Le dossier des runs, sous `userData`. */
export const LOCAL_RUNS_DIR_NAME = "agent-runs";

/** Et celui où opencode est installé — propre à la MACHINE, pas au run. */
export const LOCAL_OPENCODE_DIR_NAME = "opencode";

/**
 * CE QUE LE SERVEUR REMET À LA MACHINE.
 *
 * `job` porte déjà le bail (`controlToken`) : un job local est, par définition,
 * un job qui porte un jeton — c'est ce que dit `isLocalJob`, et un drapeau de
 * plus à côté serait une seconde vérité sur le même fait.
 */
export interface LocalTurnAssignment {
  readonly runId: string;
  readonly projectId: string;
  /**
   * Le `owner/repo` du projet, pour revalider le dossier attaché **au moment du
   * tour**. L'attachement a pu être fait il y a un mois, le dépôt déplacé, le
   * disque démonté, le projet re-lié ailleurs : répondre sur la foi du fichier de
   * réglages ferait partir un run vers un dossier qui n'existe plus.
   */
  readonly repoFullName: string;
  /** Le checkout isolé est une décision figée au lancement de la session. */
  readonly localWorktree: boolean;
  /** Le job, moins les trois champs que seule la machine peut remplir. */
  readonly job: AssignedJob;
}

/**
 * Pourquoi un tour ne peut pas partir sur cette machine.
 *
 * Aucune n'est une erreur de l'utilisateur au sens où il n'y aurait rien à faire :
 * chacune a un geste de réparation, et c'est ce qui les rend utiles dans un
 * journal. `bundle` et `opencode` portent leur propre motif, plus précis
 * ([harness-bundle.ts](harness-bundle.ts), [opencode-install.ts](opencode-install.ts)).
 */
export type LocalTurnRefusal =
  /** L'affectation n'a pas la forme attendue, ou parle un autre protocole. */
  | "assignment_invalid"
  /** Aucun dossier attaché à ce projet sur cette machine. */
  | "no_repo"
  /** Un dossier attaché, mais qui n'est plus le dépôt du projet. */
  | "repo_invalid"
  /** Le harness n'a pas pu être obtenu ou vérifié. */
  | "bundle"
  /** Le binaire opencode manque et ne peut pas être installé. */
  | "opencode"
  /** Un tour de ce run tourne DÉJÀ ici. */
  | "already_running";

/**
 * L'affectation relue de ce que l'origine a répondu — ou `null`.
 *
 * Le protocole est vérifié ICI, avant tout, et c'est délibéré : le harness le
 * refuserait aussi (`parseVmJob`), mais après le fork, quand il ne reste plus
 * qu'un journal pour en parler. Le reste des champs n'est pas revalidé un par
 * un — ils viennent de notre propre serveur, sur notre propre origine, et les
 * revérifier ici reviendrait à tenir une seconde copie du contrat qui finirait
 * par diverger de `protocol.ts`. Ce qu'on vérifie, c'est ce dont la MACHINE se
 * sert : l'identité du run, le dépôt à valider, et le bail sans lequel le tour ne
 * pourrait rien dire.
 */
export function parseLocalTurnAssignment(raw: unknown): LocalTurnAssignment | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { runId, projectId, repoFullName, localWorktree, job } = raw as Record<string, unknown>;
  if (!isNonEmptyString(runId) || !isNonEmptyString(projectId)) return null;
  if (!isNonEmptyString(repoFullName)) return null;
  // Un serveur déployé juste avant la migration ne connaît pas encore ce champ.
  // Son absence retombe sur le comportement historique, sûr (checkout courant) ;
  // seule une valeur présente mais mal formée est un contrat incohérent.
  if (localWorktree !== undefined && typeof localWorktree !== "boolean") return null;
  if (typeof job !== "object" || job === null) return null;

  const typed = job as Partial<AssignedJob>;
  // La version est LUE ici et confrontée au harness qu'on va exécuter, pas à une
  // constante compilée dans l'app : la coquille ne parle pas le protocole, elle
  // le relaie (cf. `bundleDecision`).
  if (typeof typed.protocolVersion !== "number" || !Number.isInteger(typed.protocolVersion)) {
    return null;
  }
  // Le bail : sans lui, le tour ne peut pas parler au plan de contrôle, donc il
  // ne peut pas rendre son rapport — et un run resterait `running` jusqu'à ce que
  // le chien de garde le constate, deux heures plus tard.
  if (!isNonEmptyString(typed.controlToken)) return null;
  // `layout` n'est PAS une valeur que le serveur a le droit de poser : il ne
  // connaît aucun chemin de cette machine, et un layout venu d'ailleurs
  // désignerait un dossier que personne n'a choisi.
  if ("layout" in (job as object)) return null;
  if (typed.runId !== runId) return null;

  return {
    runId,
    projectId,
    repoFullName,
    localWorktree: localWorktree === true,
    job: job as AssignedJob,
  };
}

/** Le dossier qui porte les racines de run — le seul que le ménage parcourt. */
export function localRunsDir(userDataPath: string): string {
  return `${trimSlashes(userDataPath)}/${LOCAL_RUNS_DIR_NAME}`;
}

/** La racine du run sur cette machine : un dossier par identifiant. */
export function localRunRoot(userDataPath: string, runId: string): string {
  return runScopedRoot(localRunsDir(userDataPath), runId);
}

/** Où opencode est installé sur cette machine — partagé par tous les runs. */
export function localOpencodeDir(userDataPath: string): string {
  return `${trimSlashes(userDataPath)}/${LOCAL_OPENCODE_DIR_NAME}`;
}

/**
 * Le layout de ce tour. `repoDir` est le dossier que l'humain a attaché ; tout le
 * reste vit sous la racine du run, hors du dépôt.
 *
 * LÈVE si le layout est inutilisable (`assertUsableLayout`, appelé par
 * `layoutForCurrentRepo` via le harness) — un chemin relatif ou un slash final
 * rendrait `resolveWithin` et `absoluteInRepo` muets plutôt que faux, et c'est
 * `repoDir` qui est la racine de sécurité de toutes les écritures du modèle.
 */
export function localLayout(opts: {
  userDataPath: string;
  runId: string;
  repoPath: string;
  isolated?: boolean;
}): HarnessLayout {
  const root = localRunRoot(opts.userDataPath, opts.runId);
  if (opts.isolated) return layoutForRoot(root, localOpencodeDir(opts.userDataPath));
  return layoutForCurrentRepo(
    root,
    opts.repoPath,
    localOpencodeDir(opts.userDataPath),
  );
}

/**
 * LE JOB, COMPLET — la seule fabrique, et le seul endroit où les trois champs de
 * la machine sont posés.
 *
 * `repoMode: "current"` n'est pas déduit : c'est une VALEUR, et le serveur ne la
 * pose pas. La décision D2 en fait le défaut d'une conversation locale (l'agent
 * travaille dans le dépôt courant, le worktree dédié est une option), mais elle
 * appartient à la machine parce que c'est elle qui sait quel dépôt elle ouvre.
 * L'écrire ici plutôt que côté serveur ferme le cas où un job muet serait joué
 * comme un clone dans le checkout de quelqu'un.
 */
export function assignmentToJob(
  assignment: LocalTurnAssignment,
  machine: { layout: HarnessLayout; appOrigin: string; isolated?: boolean },
): LocalJob {
  return {
    ...assignment.job,
    layout: machine.layout,
    // La machine ne parle qu'à l'origine qui lui a donné son travail (cf. en-tête).
    appOrigin: machine.appOrigin,
    // `clone` veut dire « checkout appartenant au tour ». Un worktree local est
    // exactement cela : il n'est pas un clone réseau, mais le harnais peut y
    // committer et pousser sans emporter le WIP du checkout attaché.
    repoMode: machine.isolated ? "clone" : "current",
    // Pas de microVM, donc pas de compute d'amorçage à facturer (cf. en-tête).
    bootstrapMs: 0,
  };
}

/** Les secrets que le journal de ce tour ne doit pas garder. */
export function localTurnSecrets(job: AssignedJob): string[] {
  const secrets = [job.controlToken, job.authUrl];
  return secrets.filter((value): value is string => typeof value === "string" && value.length > 0);
}

/**
 * Combien de temps la racine d'un run survit à son dernier tour.
 *
 * Elle n'est PAS jetable à la fin d'un tour : `typecheckDir` porte le
 * `.tsbuildinfo` qui fait passer les tours suivants de 22 s à 11 s
 * ([harness-layout.ts](../server/agent/harness-layout.ts)), et une conversation
 * reprend des jours après. Sept jours, c'est plus long que la vie utile d'une
 * conversation d'agent et assez court pour qu'un disque ne se remplisse pas.
 */
export const RUN_ROOT_KEEP_DAYS = 7;

/** Une racine de run trouvée sur le disque, telle que le ménage la voit. */
export interface RunRootEntry {
  readonly name: string;
  /** Dernière écriture, en millisecondes epoch. */
  readonly modifiedMs: number;
}

/**
 * LES RACINES DE RUN À SUPPRIMER — la fonction ne touche à rien, elle nomme
 * (même patron que `pruneRunLogs` et `staleBundles`).
 *
 * `live` est l'ensemble des runs qui tournent EN CE MOMENT sur cette machine, et
 * ce n'est pas une précaution théorique : le ménage tourne au démarrage de l'app
 * ET à la fin de chaque tour, or un second tour peut très bien être en vol.
 * Supprimer sa racine lui retirerait son job, ses sorties de tools et la base
 * SQLite d'opencode sous les pieds.
 */
export function staleRunRoots(
  entries: readonly RunRootEntry[],
  opts: { nowMs: number; live?: ReadonlySet<string>; keepDays?: number },
): string[] {
  const cutoff = opts.nowMs - (opts.keepDays ?? RUN_ROOT_KEEP_DAYS) * 24 * 60 * 60 * 1000;
  const live = opts.live ?? new Set<string>();
  return entries
    .filter((entry) => !live.has(entry.name))
    // Une date illisible ne supprime RIEN : on ne conclut pas sur une ignorance,
    // surtout du côté qui efface.
    .filter((entry) => Number.isFinite(entry.modifiedMs) && entry.modifiedMs < cutoff)
    .map((entry) => entry.name);
}

/**
 * La phrase du journal pour un refus d'avant-fork. En anglais, comme le menu et
 * le rapport de diagnostic — c'est le même texte, et il finit collé dans un fil
 * de support.
 */
export function localTurnRefusalMessage(reason: LocalTurnRefusal, repoFullName: string): string {
  switch (reason) {
    case "assignment_invalid":
      return "minddy sent a turn this version of the app cannot read. Update the app.";
    case "no_repo":
      return `No local folder is attached to ${repoFullName} on this Mac. Attach one in the project settings.`;
    case "repo_invalid":
      return `The folder attached to ${repoFullName} is no longer that repository — it may have moved, or the disk may be unmounted.`;
    case "bundle":
      return "The agent harness could not be obtained or verified, so no turn was started.";
    case "opencode":
      return "The opencode binary is missing and could not be installed on this Mac.";
    case "already_running":
      return "A turn for this run is already going on this Mac.";
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function trimSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

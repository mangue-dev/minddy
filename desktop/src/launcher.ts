import { createHash } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { app, session, utilityProcess, type UtilityProcess } from "electron";

import { childEnv } from "@/lib/desktop/child-env";
import {
  HARNESS_BUNDLE_PATH,
  HARNESS_DIR_NAME,
  HARNESS_MANIFEST_PATH,
  HARNESS_MAX_BYTES,
  bundleDecision,
  harnessBundleFileName,
  harnessRefusalMessage,
  parseHarnessManifest,
  staleBundles,
  verifyBeforeFork,
  verifyDownload,
  type HarnessManifest,
  type HarnessRefusal,
} from "@/lib/desktop/harness-bundle";
import {
  assignmentToJob,
  localLayout,
  localOpencodeDir,
  localRunRoot,
  localRunsDir,
  localTurnRefusalMessage,
  localTurnSecrets,
  parseLocalTurnAssignment,
  staleRunRoots,
  type LocalTurnAssignment,
  type LocalTurnRefusal,
} from "@/lib/desktop/local-turn";
import { opencodeInstallNote, opencodeRefusalMessage } from "@/lib/desktop/opencode-install";
import { quitLogNote, type RunningTurn } from "@/lib/desktop/quit-guard";
import { killTargets, readHarnessChildren } from "@/lib/server/agent/vm/child-registry";
import { OPENCODE_VERSION } from "@/lib/server/agent/vm/opencode-version";
import { vmBundlePath, vmJobPath } from "@/lib/server/agent/harness-layout";
import { installOpencode, readOpencodeFacts } from "./opencode-install";
import { describeLocalRepo } from "./local-repo";
import { prepareLocalWorktree } from "@/lib/desktop/local-worktree";
import { noteLauncherFailure, openRunLog, type RunLog } from "./run-log";
import { trace } from "./trace";

/**
 * LE LANCEUR (MIN-293) — ce qui fait tourner un tour d'agent sur ce Mac.
 *
 * ## Ce que ce fichier a le droit de contenir
 *
 * Le `fork`, le `fetch`, le `fs`, et le registre des tours vivants. **Toutes les
 * décisions vivent dans `lib/desktop/`**, avec leurs tests — le contrat
 * d'affectation et le layout ([local-turn.ts](../../lib/desktop/local-turn.ts)),
 * l'empreinte du harness ([harness-bundle.ts](../../lib/desktop/harness-bundle.ts)),
 * le pré-vol opencode ([opencode-install.ts](../../lib/desktop/opencode-install.ts)),
 * la question du ⌘Q ([quit-guard.ts](../../lib/desktop/quit-guard.ts)) et le
 * registre des enfants à longue vie
 * ([vm/child-registry.ts](../../lib/server/agent/vm/child-registry.ts)).
 * `vitest` ne collecte pas `desktop/src/`, et un lanceur est le dernier endroit
 * où l'on veut voir une décision écrite à la main.
 *
 * ## `utilityProcess.fork`, et pas un process détaché
 *
 * **Mesuré** : Electron 43.4.0 rend Node 24.18.1, exactement la cible `node24`
 * du bundle, et `.agent-vm/main.js` s'exécute tel quel dessous. Mais le choix ne
 * se joue pas sur la version de Node — il se joue sur DEUX propriétés qu'un
 * process détaché n'a pas :
 *
 * 1. **il meurt avec l'app.** Un harness qui survivrait à ⌘Q garderait vivants un
 *    token de forge `contents: write` et une clé de modèle, sans plus aucune
 *    interface pour les arrêter ;
 * 2. **il garde son processus responsable TCC.** Un process réparenté à `launchd`
 *    le perd — et macOS ne lui refuse alors pas seulement `~/Documents` : **la
 *    fenêtre d'autorisation ne s'ouvre même pas.** Le refus est muet, exactement
 *    comme celui du micro avant MIN-294.
 *
 * ## Ce que le fork rend au harness, mesuré et non déduit
 *
 * Sonde du 2026-08-15, sur Electron 43.4.0 : un enfant d'`utilityProcess.fork`
 * reçoit `process.argv = [<Electron Helper>, <module>, ...args]` — **exactement
 * la convention de `child_process.fork`**. Le harness lit donc bien son job en
 * `process.argv[2]` ([vm/main.ts](../../lib/server/agent/vm/main.ts)), et rien
 * n'est décalé. Mesuré aussi : `stdio: "pipe"` donne bien les deux flux, le code
 * de sortie remonte, et le `cwd` est respecté.
 *
 * ⚠ Et un piège qui s'est présenté dans la foulée : `env` **refuse toute valeur
 * qui n'est pas une chaîne**, avec un message qui ne nomme pas la clé
 * (`TypeError: Invalid value for env`). D'où `childEnv`
 * ([child-env.ts](../../lib/desktop/child-env.ts)), qui RETIRE au lieu de poser
 * `undefined`.
 *
 * ## Rien ici ne laisse un tour sans journal
 *
 * Chaque refus passe par `openRunLog` ou `noteLauncherFailure` avant de rendre.
 * C'est la raison d'être de MIN-363 : un tour qui rate AVANT que le harness ait
 * parlé n'a ni event, ni checkpoint, ni ligne de `agent_runs` — le `stdio` de
 * l'enfant est la seule chose qui parle, et le journal est le seul endroit où on
 * la garde.
 */

/** Un tour vivant sur cette machine. */
interface LiveTurn {
  readonly runId: string;
  readonly label?: string;
  readonly child: UtilityProcess;
  readonly log: RunLog;
  readonly root: string;
  readonly harnessDir: string;
}

/**
 * LE REGISTRE, par identifiant de run.
 *
 * Un objet et non un singleton, parce qu'**une machine peut porter deux runs à la
 * fois** là où une microVM en portait un par construction : deux tickets lancés à
 * la suite ont deux racines, deux ports, deux journaux (cf. `HarnessLayout`).
 */
const live = new Map<string, LiveTurn>();

/**
 * Pré-vols opencode en cours, par dossier machine. Le préchauffage démarre au
 * lancement de l'app ; un clic très rapide sur « envoyer » doit rejoindre ce
 * même travail, jamais lancer un second `npm install` concurrent.
 */
const opencodePreflights = new Map<
  string,
  Promise<
    | { ok: true; note: string | null }
    | { ok: false; reason: "no_npm" | "install_failed"; message: string }
  >
>();

/** Pré-chauffages en cours, un par origine : stable/preview ne partagent jamais
 * un harness, car leur protocole et leur code peuvent diverger. */
const localAgentWarmups = new Map<string, Promise<void>>();

/**
 * Ce que le lanceur rend à son appelant.
 *
 * `skipped` n'est PAS un refus, et c'est la distinction qui manquait : un run
 * qui n'est plus en file est un run dont le tour tourne DÉJÀ — le message de
 * l'utilisateur sera pris par la boucle en vol, il n'y a rien à lancer et rien à
 * dire. Le confondre avec un échec faisait surgir une alerte à chaque relance de
 * la conversation.
 */
export type LocalTurnResult =
  | { readonly status: "started"; readonly runId: string; readonly logPath: string }
  | { readonly status: "skipped"; readonly reason: "not_queued" }
  | {
      readonly status: "refused";
      readonly reason:
        | LocalTurnRefusal
        | HarnessRefusal
        | "no_npm"
        | "install_failed"
        | "server";
      readonly message: string;
    };

/** Les tours en cours — lu par la question du ⌘Q. */
export function runningTurns(): RunningTurn[] {
  return [...live.values()].map((turn) => ({
    runId: turn.runId,
    ...(turn.label ? { label: turn.label } : {}),
  }));
}

/**
 * DEMANDE UN TOUR À L'ORIGINE ACTIVE, puis le joue.
 *
 * `origin` est celle du canal actif, jamais une constante : **la machine ne parle
 * qu'à l'origine qui lui a donné son travail.** Une coquille en preview qui
 * jouerait un tour avec le harness et le bail de la production ferait diverger le
 * contrat typé en silence — et c'est aussi ce qui fait marcher le développement
 * contre `localhost`.
 */
export async function startLocalTurn(opts: {
  origin: string;
  runId: string;
  deviceId: string;
}): Promise<LocalTurnResult> {
  if (live.has(opts.runId)) {
    return refuse("already_running", localTurnRefusalMessage("already_running", ""));
  }

  const requestedAt = Date.now();
  // Le manifeste et le binaire ne dépendent pas du job. Les démarrer avant le
  // POST masque leur coût derrière la préparation serveur (contexte, quota,
  // cible Git), puis `runAssignment` confronte tout de même le protocole reçu.
  const machinePreflight: LocalMachinePreflight = {
    bundle: ensureBundle(opts.origin),
    opencode: ensureOpencode(localOpencodeDir(app.getPath("userData"))),
  };
  // Un refus serveur peut rendre avant ces promesses. Leur erreur restera
  // observable si le job les attend, mais ne devient pas un rejet non géré si
  // aucun job n'est finalement attribué.
  void machinePreflight.bundle.catch(() => {});
  void machinePreflight.opencode.catch(() => {});
  const answer = await fetchJson(`${opts.origin}/api/desktop/local-turn`, {
    method: "POST",
    body: JSON.stringify({ runId: opts.runId, deviceId: opts.deviceId }),
  });

  /**
   * ⚠ **CE QUE LE SERVEUR A RÉPONDU, DIT TEL QUEL.**
   *
   * La première version écrasait tout échec HTTP en « cette version de l'app ne
   * sait pas lire ce tour, mets-la à jour » — un message faux dans la quasi-
   * totalité des cas, et qui envoyait chercher au pire endroit. Un 409
   * « ce déploiement ne sait pas frapper de clé plafonnée », un 404, un 401 de
   * session expirée : trois pannes distinctes, un seul mensonge.
   *
   * Le motif `server` porte donc le statut ET la phrase du serveur, et
   * `assignment_invalid` retrouve son sens exact — le corps est arrivé, et il
   * n'a pas la forme attendue.
   */
  if (!answer.ok) {
    // Le tour tourne déjà : il n'y a rien à lancer, et rien à dire.
    if (answer.status === 409 && /not queued/i.test(answer.error)) {
      trace("local-turn:skipped", { runId: opts.runId });
      return { status: "skipped", reason: "not_queued" };
    }
    const message = `minddy refused to prepare this turn (${answer.status}): ${answer.error}`;
    noteLauncherFailure(message);
    return refuse("server", message);
  }

  const assignment = parseLocalTurnAssignment(answer.body);
  if (!assignment) {
    const message = localTurnRefusalMessage("assignment_invalid", "");
    noteLauncherFailure(`${message}\n${JSON.stringify(answer.body)?.slice(0, 800) ?? ""}`);
    return refuse("assignment_invalid", message);
  }
  const serverDiagnostics =
    typeof answer.body === "object" && answer.body !== null &&
    typeof (answer.body as Record<string, unknown>).diagnostics === "object"
      ? ((answer.body as Record<string, unknown>).diagnostics as Record<string, unknown>)
      : undefined;
  const assignmentReadyMs = Date.now() - requestedAt;
  trace("local-turn:assignment-ready", {
    runId: opts.runId,
    elapsedMs: assignmentReadyMs,
  });
  return runAssignment(assignment, opts.origin, {
    machinePreflight,
    requestedAt,
    assignmentReadyMs,
    serverDiagnostics,
  });
}

/**
 * PRÉCHAUFFE LE CHEMIN LOCAL PENDANT QUE L'APPLICATION S'OUVRE.
 *
 * Aucun job, jeton de contrôle, clé LLM ou dépôt utilisateur n'est impliqué :
 * on ne fait que mettre en cache le harness signé de l'origine et le binaire
 * opencode de la machine. Le tour garde ses contrôles complets — notamment le
 * rehash du bundle juste avant le fork — mais son premier message ne paie plus
 * un téléchargement ou une installation qui pouvait se faire à l'ouverture.
 */
export function prewarmLocalAgent(origin: string): Promise<void> {
  const active = localAgentWarmups.get(origin);
  if (active) return active;

  const userData = app.getPath("userData");
  const task = Promise.all([
    // Pas encore de job, donc pas de protocole à confronter. Le tour le fera
    // toujours avant d'exécuter le cache préchauffé.
    ensureBundle(origin),
    ensureOpencode(localOpencodeDir(userData)),
  ])
    .then(([bundle, opencode]) => {
      trace("local-agent:prewarm", {
        origin,
        bundle: bundle.ok ? "ready" : bundle.reason,
        opencode: opencode.ok ? "ready" : opencode.reason,
      });
    })
    .catch((error) => {
      // Le préchauffage est une optimisation : un réseau indisponible au
      // démarrage ne doit ni alerter ni empêcher le pré-vol normal du tour.
      trace("local-agent:prewarm-failed", {
        origin,
        message: error instanceof Error ? error.message : String(error),
      });
    })
    .finally(() => localAgentWarmups.delete(origin));
  localAgentWarmups.set(origin, task);
  return task;
}

/**
 * JOUE UNE AFFECTATION — le cœur du lot, et le point d'entrée que la boucle de
 * claim de MIN-294 appellera telle quelle.
 *
 * L'ordre des cinq étapes n'est pas indifférent : **tout ce qui peut refuser
 * refuse avant le premier octet écrit sur le disque.** Un tour qui échoue après
 * avoir posé un `job.json` laisse derrière lui un bail et une URL de push dans un
 * fichier que personne ne relira.
 */
export async function runAssignment(
  assignment: LocalTurnAssignment,
  origin: string,
  opts: {
    machinePreflight?: LocalMachinePreflight;
    requestedAt?: number;
    assignmentReadyMs?: number;
    serverDiagnostics?: Record<string, unknown>;
  } = {},
): Promise<LocalTurnResult> {
  const userData = app.getPath("userData");

  // 1. LE DÉPÔT, revalidé maintenant. L'attachement date peut-être d'un mois : le
  //    dossier a pu être déplacé, le disque démonté, le projet re-lié ailleurs.
  const repo = describeLocalRepo(assignment.projectId, { fullName: assignment.repoFullName });
  if (repo.status !== "ready") {
    const reason: LocalTurnRefusal = repo.status === "none" ? "no_repo" : "repo_invalid";
    const message = localTurnRefusalMessage(reason, assignment.repoFullName);
    noteLauncherFailure(message);
    return refuse(reason, message);
  }

  // 2. LE HARNESS et OPENCODE. Ces deux pré-vols ne dépendent que de données
  //    déjà validées (l'origine, le protocole et le dossier machine) et ne
  //    s'écrivent pas dans le dépôt du tour. Les attendre l'un après l'autre
  //    ajoutait inutilement le temps réseau du manifeste au démarrage/à
  //    l'installation d'opencode — particulièrement visible au premier token.
  //    On garde les refus et leur ordre d'affichage ci-dessous : seul le temps
  //    d'attente se recouvre.
  const bundlePromise = opts.machinePreflight
    ? validatePreflightBundle(origin, opts.machinePreflight.bundle, assignment.job.protocolVersion)
    : ensureBundle(origin, assignment.job.protocolVersion);
  const opencodeDir = localOpencodeDir(userData);
  const opencodePromise = opts.machinePreflight?.opencode ?? ensureOpencode(opencodeDir);

  // Le protocole confronté est celui du JOB qu'on va lui donner, jamais une
  // constante compilée dans l'app : la coquille ne parle pas le protocole, elle
  // le relaie.
  const bundle = await bundlePromise;
  if (!bundle.ok) {
    const message = harnessRefusalMessage(bundle.reason, origin);
    noteLauncherFailure(message);
    return refuse(bundle.reason, message);
  }

  // 3. OPENCODE, une fois par machine et pas une fois par tour.
  const opencode = await opencodePromise;
  if (!opencode.ok) {
    noteLauncherFailure(opencode.message);
    return refuse(opencode.reason, opencode.message);
  }

  // 4. LE DISQUE DU RUN. Le checkout attaché peut porter la branche, l'index et
  // le WIP de la personne. Quand la session a demandé l'isolation, git crée un
  // worktree sous sa racine de run : aucun fichier de ce checkout humain n'est
  // touché. Ce geste arrive après les pré-vols, pour qu'un harness ou opencode
  // indisponible ne laisse même pas un checkout à nettoyer.
  const isolated = assignment.localWorktree;
  const worktree = isolated
    ? prepareLocalWorktree({
        sourceRepo: repo.path,
        runRoot: localRunRoot(userData, assignment.runId),
        baseBranch: typeof assignment.job.baseBranch === "string" ? assignment.job.baseBranch : null,
        workBranch: typeof assignment.job.workBranch === "string" ? assignment.job.workBranch : "",
        authUrl: assignment.job.authUrl,
      })
    : null;
  if (worktree && !worktree.ok) {
    noteLauncherFailure(worktree.message);
    return refuse("repo_invalid", worktree.message);
  }

  // Le layout est la seule chose que la machine ajoute au
  //    job, et `localLayout` garantit que le harness n'atterrit jamais DANS le
  //    dépôt de l'utilisateur — sinon il apparaîtrait dans son `git status`.
  const layout = localLayout({
    userDataPath: userData,
    runId: assignment.runId,
    repoPath: worktree?.ok ? worktree.path : repo.path,
    isolated,
  });
  const job = assignmentToJob(assignment, { layout, appOrigin: origin, isolated });

  const log = openRunLog(
    {
      runId: assignment.runId,
      appVersion: app.getVersion(),
      bundleVersion: bundle.manifest.sha256.slice(0, 12),
      opencodeVersion: OPENCODE_VERSION,
      repoPath: layout.repoDir,
    },
    localTurnSecrets(job),
  );
  if (opts.assignmentReadyMs != null) {
    log.write(`[desktop-timing] assignment-ready +${opts.assignmentReadyMs}ms\n`, "out");
  }
  if (opts.serverDiagnostics) {
    log.write(`[server-timing] ${JSON.stringify(opts.serverDiagnostics)}\n`, "out");
  }
  if (opencode.note) log.write(`${opencode.note}\n`, "out");

  try {
    mkdirSync(layout.harnessDir, { recursive: true });
    mkdirSync(layout.toolOutputDir, { recursive: true });
    mkdirSync(layout.typecheckDir, { recursive: true });
    writeFileSync(vmJobPath(layout), JSON.stringify(job), "utf8");
  } catch (error) {
    const message = `Could not prepare the run folder at ${layout.root}: ${(error as Error).message}`;
    log.write(message, "err");
    log.close("aborted before the harness started");
    return refuse("bundle", message);
  }

  /**
   * 5. LE DERNIER CONTRÔLE, à un cheveu du fork.
   *
   * Le bundle a été vérifié au téléchargement — mais il a pu être réécrit
   * depuis, et c'est précisément le scénario contre lequel ce lot existe : le
   * fichier vit sous `userData`, **inscriptible par le modèle sous le même
   * UID**, et un tour qui le réécrit capterait au tour suivant le bail, la clé
   * et l'`authUrl`. On rehashe le fichier qu'on s'apprête à exécuter.
   */
  /**
   * ⚠ **UNE SEULE LECTURE, ET C'EST ELLE QU'ON EXÉCUTE.**
   *
   * Vérifier le fichier du cache puis le relire pour le recopier rouvrirait la
   * fenêtre qu'on vient de fermer — c'est la deuxième lecture qui serait
   * exécutée, et rien ne dirait qu'elle rend les mêmes octets. On lit une fois,
   * on hashe CES octets-là, et on écrit CES octets-là sous la racine du run.
   *
   * La recopie sous la racine, elle, n'est pas cosmétique : c'est ce que la
   * fonction fait déjà dans la microVM ([vm-launch.ts](../../lib/server/agent/vm-launch.ts)),
   * et surtout ça garantit qu'un tour en vol garde SON harness même si un
   * déploiement change l'empreinte et que le ménage passe derrière.
   */
  const staged = readBundle(bundle.path);
  const beforeFork = verifyBeforeFork(staged, bundle.manifest);
  if (!beforeFork.ok) {
    const message = harnessRefusalMessage(beforeFork.reason, origin);
    log.write(message, "err");
    log.close("harness refused at fork");
    // On le jette : le tour suivant le retéléchargera plutôt que de retrouver le
    // même fichier et de refuser à nouveau, indéfiniment.
    try {
      rmSync(bundle.path, { force: true });
    } catch {
      // Rien à réparer : la vérification refusera encore, ce qui est le bon défaut.
    }
    return refuse(beforeFork.reason, message);
  }

  const runBundle = vmBundlePath(layout);
  try {
    writeFileSync(runBundle, staged!.source, "utf8");
  } catch (error) {
    const message = `Could not stage the harness at ${runBundle}: ${(error as Error).message}`;
    log.write(message, "err");
    log.close("aborted before the harness started");
    return refuse("bundle", message);
  }

  const child = utilityProcess.fork(runBundle, [vmJobPath(layout)], {
    cwd: layout.harnessDir,
    // Les deux tubes, LUS : un enfant dont personne ne lit la sortie finit par
    // bloquer sur un tube plein, et un tour dure des heures.
    stdio: "pipe",
    serviceName: `minddy-agent-${assignment.runId.slice(0, 8)}`,
    // ⚠ `childEnv`, et surtout pas `{ ...process.env, X: undefined }` :
    // `utilityProcess.fork` REFUSE une valeur qui n'est pas une chaîne, et il le
    // dit sans nommer la clé (`TypeError: Invalid value for env`). Le fork tombe
    // alors avant que le harness ait démarré, là où il n'y a encore rien à lire.
    env: childEnv(process.env),
  });

  child.stdout?.on("data", (chunk: Buffer) => log.write(chunk.toString("utf8"), "out"));
  child.stderr?.on("data", (chunk: Buffer) => log.write(chunk.toString("utf8"), "err"));
  child.once("exit", (code) => {
    live.delete(assignment.runId);
    log.close(`exit ${code}`);
    // Le serveur opencode SURVIT au harness (`spawn` ni détaché ni suivi) : 143 Mo
    // en mémoire, le port tenu, et le tour suivant qui échoue sur un `listen`
    // refusé. C'est ici qu'on finit le travail que son `finally` n'a pas pu faire.
    reapChildren(layout.harnessDir);
    sweepRunRoots();
    trace("local-turn:exit", { runId: assignment.runId, code });
  });

  live.set(assignment.runId, {
    runId: assignment.runId,
    ...(assignment.job.commitRef ? { label: assignment.job.commitRef } : {}),
    child,
    log,
    root: layout.root,
    harnessDir: layout.harnessDir,
  });
  trace("local-turn:started", {
    runId: assignment.runId,
    root: layout.root,
    ...(opts.requestedAt ? { startupMs: Date.now() - opts.requestedAt } : {}),
  });

  // Le ménage APRÈS le fork, jamais avant (cf. `staleBundles`).
  pruneBundles(bundle.path);

  return { status: "started", runId: assignment.runId, logPath: log.path };
}

/**
 * ARRÊTE UN TOUR. `SIGTERM` d'abord — le harness a un `finally` qui ferme
 * opencode, le proxy LLM et le pont de tools —, puis le registre d'enfants pour
 * ce qu'il n'aura pas eu le temps de faire.
 *
 * On n'ATTEND pas la mort du process : l'appelant est `before-quit`, où macOS ne
 * donne pas de délai qu'on puisse tenir. Le registre est la garantie de secours,
 * et il tourne au démarrage suivant si celui-ci n'a rien pu faire.
 */
export function stopLocalTurn(runId: string, note = quitLogNote()): void {
  const turn = live.get(runId);
  if (!turn) return;
  live.delete(runId);
  trace("local-turn:stop", { runId });
  try {
    turn.child.kill();
  } catch {
    // Déjà mort : il n'y a rien à réparer, et le registre d'enfants suit.
  }
  reapChildren(turn.harnessDir);
  // Le mot de la fin passe par `close`, qui l'écrit lui-même : l'écrire aussi
  // avant le mettrait deux fois dans le journal, et un rapport de diagnostic qui
  // se répète est un rapport qu'on relit mal.
  turn.log.close(note);
}

/** Tous les tours, pour le ⌘Q. */
export function stopAllLocalTurns(note = quitLogNote()): void {
  for (const runId of [...live.keys()]) stopLocalTurn(runId, note);
}

/**
 * LE MÉNAGE DU DÉMARRAGE — les orphelins d'un plantage du main process.
 *
 * `stopLocalTurn` couvre le ⌘Q ; il ne couvre pas une app tuée net, ni un
 * redémarrage du Mac au milieu d'un tour. Le registre d'enfants, lui, est sur le
 * disque : on le relit pour chaque racine de run et on finit le travail.
 *
 * Un pid recyclé par le système désignerait le process de quelqu'un d'autre —
 * c'est le risque connu de tout registre de pid, et il est borné ici par le fait
 * que le harness DÉSINSCRIT ce qu'il a arrêté lui-même
 * ([opencode-host.ts](../../lib/server/agent/vm/opencode-host.ts)) : ne reste
 * inscrit que ce qu'on n'a jamais pu tuer.
 */
export function sweepOrphanTurns(): void {
  for (const name of runRootNames()) {
    reapChildren(path.join(runsDir(), name, "harness"));
  }
  sweepRunRoots();
}

// ── Le harness ──────────────────────────────────────────────────────────────

type BundleReady = { ok: true; path: string; manifest: HarnessManifest };
type BundleRefused = { ok: false; reason: HarnessRefusal };
type OpencodePreflight = ReturnType<typeof ensureOpencode>;
type LocalMachinePreflight = {
  bundle: Promise<BundleReady | BundleRefused>;
  opencode: OpencodePreflight;
};

/**
 * Confronte au job le bundle récupéré pendant le POST serveur. Un fichier qui a
 * disparu ou changé entre les deux est retéléchargé depuis un manifeste frais ;
 * l'empreinte sera encore recalculée juste avant le fork.
 */
async function validatePreflightBundle(
  origin: string,
  prepared: Promise<BundleReady | BundleRefused>,
  jobProtocol: number,
): Promise<BundleReady | BundleRefused> {
  const bundle = await prepared;
  if (!bundle.ok) return bundle;
  const decision = bundleDecision(bundle.manifest, measure(bundle.path), jobProtocol);
  if (decision.action === "reuse") return bundle;
  if (decision.action === "refuse") return { ok: false, reason: decision.reason };
  return ensureBundle(origin, jobProtocol);
}

/**
 * Le bundle du tour, téléchargé si besoin. **Le manifeste est demandé à CHAQUE
 * tour** — deux cents octets — et les octets seulement quand l'empreinte a changé.
 */
async function ensureBundle(
  origin: string,
  jobProtocol?: number,
): Promise<BundleReady | BundleRefused> {
  const answer = await fetchJson(`${origin}${HARNESS_MANIFEST_PATH}`);
  if (!answer.ok) return { ok: false, reason: "manifest_unreachable" };
  const manifest = parseHarnessManifest(answer.body);
  if (!manifest) return { ok: false, reason: "manifest_invalid" };

  const file = path.join(harnessDir(), harnessBundleFileName(manifest.sha256));
  const cached = measure(file);
  if (jobProtocol == null) {
    // Le cache n'est pas encore exécutable : seul le tour connaît le protocole
    // qu'il a reçu. Ici, on gagne le téléchargement tout en laissant le contrôle
    // de compatibilité à `runAssignment`.
    if (cached?.sha256 === manifest.sha256 && cached.bytes === manifest.bytes) {
      return { ok: true, path: file, manifest };
    }
  } else {
    const decision = bundleDecision(manifest, cached, jobProtocol);
    if (decision.action === "refuse") return { ok: false, reason: decision.reason };
    if (decision.action === "reuse") return { ok: true, path: file, manifest };
  }

  const download = await fetchText(`${origin}${HARNESS_BUNDLE_PATH}`);
  if (!download.ok) return { ok: false, reason: "download_failed" };
  const body = download.body;
  if (Buffer.byteLength(body, "utf8") > HARNESS_MAX_BYTES) {
    return { ok: false, reason: "download_failed" };
  }
  const verdict = verifyDownload(
    { sha256: sha256Of(body), bytes: Buffer.byteLength(body, "utf8") },
    manifest,
  );
  if (!verdict.ok) return { ok: false, reason: verdict.reason };

  try {
    mkdirSync(harnessDir(), { recursive: true });
    writeFileSync(file, body, "utf8");
  } catch (error) {
    console.error("[launcher] harness non écrit", error);
    return { ok: false, reason: "download_failed" };
  }
  return { ok: true, path: file, manifest };
}

function pruneBundles(keep: string): void {
  try {
    for (const name of staleBundles(readdirSync(harnessDir()), path.basename(keep))) {
      rmSync(path.join(harnessDir(), name), { force: true });
    }
  } catch {
    // Un ménage qui échoue coûte 280 Ko, pas un tour.
  }
}

// ── opencode ────────────────────────────────────────────────────────────────

async function ensureOpencode(
  installDir: string,
): Promise<
  | { ok: true; note: string | null }
  | { ok: false; reason: "no_npm" | "install_failed"; message: string }
> {
  const active = opencodePreflights.get(installDir);
  if (active) return active;
  const task = ensureOpencodeOnce(installDir).finally(() => opencodePreflights.delete(installDir));
  opencodePreflights.set(installDir, task);
  return task;
}

async function ensureOpencodeOnce(
  installDir: string,
): Promise<
  | { ok: true; note: string | null }
  | { ok: false; reason: "no_npm" | "install_failed"; message: string }
> {
  const { decision, npmPath } = readOpencodeFacts(installDir);
  if (decision.action === "ready") return { ok: true, note: null };
  if (decision.action === "refuse") {
    return { ok: false, reason: "no_npm", message: opencodeRefusalMessage("no_npm") };
  }
  try {
    mkdirSync(installDir, { recursive: true });
  } catch (error) {
    return {
      ok: false,
      reason: "install_failed",
      message: `Could not create ${installDir}: ${(error as Error).message}`,
    };
  }
  const failure = await installOpencode({ installDir, npmPath: npmPath! });
  if (failure) return { ok: false, reason: "install_failed", message: failure };
  return { ok: true, note: opencodeInstallNote(decision.why) };
}

// ── Les enfants qui survivent ───────────────────────────────────────────────

/**
 * Tue ce que le harness a laissé derrière lui. **Best-effort, et sans lever** :
 * un pid déjà mort rend `ESRCH`, ce qui est le bon résultat.
 */
function reapChildren(harnessDir: string): void {
  const children = readHarnessChildren(harnessDir);
  if (children.length === 0) return;
  for (const target of killTargets(children, { pid: process.pid, ppid: process.ppid })) {
    try {
      process.kill(target.signalTo, "SIGTERM");
      trace("local-turn:reap", { signalTo: target.signalTo, kind: target.kind });
    } catch {
      // Déjà mort, ou pid recyclé hors de notre portée : rien à faire.
    }
  }
}

// ── Le disque ───────────────────────────────────────────────────────────────

function harnessDir(): string {
  return path.join(app.getPath("userData"), HARNESS_DIR_NAME);
}

function runsDir(): string {
  return localRunsDir(app.getPath("userData"));
}

function runRootNames(): string[] {
  try {
    return readdirSync(runsDir(), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

function sweepRunRoots(): void {
  const liveNames = new Set(
    [...live.values()].map((turn) => path.basename(turn.root)),
  );
  const entries = runRootNames().map((name) => {
    try {
      return { name, modifiedMs: statSync(path.join(runsDir(), name)).mtimeMs };
    } catch {
      return { name, modifiedMs: Number.NaN };
    }
  });
  for (const name of staleRunRoots(entries, { nowMs: Date.now(), live: liveNames })) {
    try {
      rmSync(path.join(runsDir(), name), { recursive: true, force: true });
      trace("local-turn:pruned", { root: name });
    } catch {
      // Un dossier qui résiste coûte du disque, pas un tour.
    }
  }
}

/**
 * Le bundle LU, avec l'empreinte de ces octets-là. `null` s'il n'est pas là.
 *
 * Rend la SOURCE en plus de l'empreinte, et c'est tout l'intérêt : ce qu'on
 * vérifie doit être ce qu'on exécute. Une fonction qui ne rendrait que le hash
 * obligerait à relire le fichier pour s'en servir, et c'est cette seconde
 * lecture — celle qu'on n'a pas vérifiée — qui finirait dans le `fork`.
 */
function readBundle(file: string): { source: string; sha256: string; bytes: number } | null {
  try {
    const source = readFileSync(file, "utf8");
    return { source, sha256: sha256Of(source), bytes: Buffer.byteLength(source, "utf8") };
  } catch {
    return null;
  }
}

/** L'empreinte et la taille seules — ce que la décision de cache regarde. */
function measure(file: string): { sha256: string; bytes: number } | null {
  const read = readBundle(file);
  return read ? { sha256: read.sha256, bytes: read.bytes } : null;
}

function sha256Of(body: string): string {
  return createHash("sha256").update(body, "utf8").digest("hex");
}

// ── Le réseau ───────────────────────────────────────────────────────────────

/**
 * `session.defaultSession.fetch`, et pas le `fetch` global : c'est ce qui envoie
 * les COOKIES de l'origine active. Les deux surfaces du harness sont
 * authentifiées, et le seul appelant légitime est quelqu'un de connecté dans
 * cette fenêtre.
 */
/** Ce qu'une requête rend : le corps, ou le STATUT et la phrase du serveur. */
type Fetched<T> = { ok: true; body: T } | { ok: false; status: number; error: string };

async function fetchText(url: string, init?: RequestInit): Promise<Fetched<string>> {
  try {
    const response = await session.defaultSession.fetch(url, {
      ...init,
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    });
    const text = await response.text();
    if (!response.ok) {
      console.error(`[launcher] ${url} → ${response.status} ${text.slice(0, 300)}`);
      return { ok: false, status: response.status, error: serverError(text) };
    }
    return { ok: true, body: text };
  } catch (error) {
    console.error(`[launcher] ${url} injoignable`, error);
    // `0` : rien n'a répondu. Le distinguer d'un vrai statut évite de faire
    // passer une coupure réseau pour un refus du serveur.
    return { ok: false, status: 0, error: (error as Error).message };
  }
}

async function fetchJson(url: string, init?: RequestInit): Promise<Fetched<unknown>> {
  const text = await fetchText(url, init);
  if (!text.ok) return text;
  try {
    return { ok: true, body: JSON.parse(text.body) };
  } catch {
    // Une page HTML (portail captif, proxy d'entreprise) arrive ici.
    const preview = text.body.replace(/\s+/g, " ").trim().slice(0, 240);
    return {
      ok: false,
      status: 200,
      error: `the answer was not JSON${preview ? `: ${preview}` : " (empty body)"}`,
    };
  }
}

/** La phrase du serveur, tirée de son `{ error }` — sinon le corps, borné. */
function serverError(text: string): string {
  try {
    const parsed = JSON.parse(text) as { error?: unknown };
    if (typeof parsed.error === "string" && parsed.error) return parsed.error;
  } catch {
    // Pas du JSON : une page d'erreur, un proxy. Le début du corps dit déjà tout.
  }
  return text.slice(0, 200) || "no answer body";
}

function refuse(
  reason: Extract<LocalTurnResult, { status: "refused" }>["reason"],
  message: string,
): LocalTurnResult {
  trace("local-turn:refused", { reason });
  return { status: "refused", reason, message };
}

import "server-only";

import { Sandbox, type NetworkPolicy } from "@vercel/sandbox";

import {
  SANDBOX_RUNTIME,
  type RepoHost,
  type ShellOptions,
  type ShellResult,
} from "./repo-host";
import type { HarnessLayout } from "./harness-layout";

/**
 * Couche Vercel Sandbox de l'agent de code (MIN-46) — la microVM elle-même : sa
 * création, son réveil, sa politique réseau, son arrêt.
 *
 * CE QUI EST PARTI D'ICI (MIN-224). Tous les gestes sur le DÉPÔT — clone,
 * lecture, édition, grep, jobs de fond, commit, push — vivent désormais dans
 * [repo-host.ts](repo-host.ts), écrits contre quatre primitives plutôt que contre
 * le SDK. Ce fichier n'en garde que l'adaptateur RPC (`sandboxHost`) : la même
 * logique tourne, à l'identique, sur le disque local quand la boucle vit DANS la
 * microVM. Ce qui reste ici est ce qui n'a de sens que depuis la fonction — on ne
 * crée pas la machine depuis la machine.
 *
 * IDENTITÉ & REPRISE : un Sandbox est identifié par un `name` DÉTERMINISTE
 * (`agent-<run.id>`, persisté dans agent_runs.sandbox_id). `getOrCreateAgentSandbox`
 * est idempotent : si la microVM (ou son SNAPSHOT persistant) existe encore, elle
 * est RÉVEILLÉE avec son filesystem restauré (reprise rapide, pas de re-clone) ;
 * sinon `onCreate` clone la branche de travail sur une VM neuve. `persistent: true`
 * (restauration automatique du FS entre sessions via snapshots) est le DÉFAUT du SDK
 * depuis sa v2 — on le pose quand même, explicitement : c'est de lui que dépend toute
 * la reprise, il n'a pas à disparaître dans un défaut. `snapshotExpiration` et
 * `keepLastSnapshots`, eux, ne redisent pas un défaut : ils en RESSERRENT deux qui
 * coûtent (voir plus bas). Le git (branche WIP poussée à chaque pause) reste le
 * filet durable au-delà de l'expiration du snapshot. AUTH : réutilise
 * VERCEL_TOKEN/TEAM_ID/PROJECT_ID (comme les domaines custom, MIN-36) ; sur Vercel
 * l'OIDC suffit.
 */

/**
 * Durée de vie max d'une SESSION de la microVM (elle survit au gap entre deux chunks).
 * C'est le plafond du PLAN — 24 h sur Pro ; les 45 min qu'on portait ici étaient le
 * palier Hobby, donc notre plafond et pas celui de la plateforme. L'API le fait
 * respecter : 24 h passe, 25 h repart en 400.
 *
 * Ce n'est PAS le gouverneur de la dépense. Une VM au repos est coupée après ~5 min
 * par le reaper d'inactivité (`drain.ts`), et ce chiffre ne se lit que dans deux cas :
 * un tour qui travaille plus longtemps que ça sans jamais se reposer (il perdait sa VM
 * chaude en plein travail et repayait un démarrage à froid), et une microVM que le
 * reaper n'a pas su couper (`stopSandboxByName` avale ses erreurs après avoir posé
 * `sandbox_stopped_at`, donc il ne repassera pas) — celle-là vivra désormais bien plus
 * longtemps avant de s'éteindre seule. Fuite rare, coût borné, et c'est le prérequis
 * matériel d'un orchestrateur qui vit DANS la VM : la VM doit tenir aussi longtemps
 * que le tour.
 */
const SANDBOX_TIMEOUT_MS = 24 * 60 * 60_000;
/** Rétention des snapshots persistants (reprise rapide) : resserre le défaut du SDK,
 *  qui est de 30 JOURS. Au-delà, on retombe sur le re-clone de la branche git
 *  (durable pour toujours). */
const SANDBOX_SNAPSHOT_EXPIRATION_MS = 7 * 24 * 60 * 60_000;

export type { Sandbox };

/**
 * Tout ce que `repo-host.ts` fait au dépôt, rendu par des allers-retours RPC vers
 * la microVM. C'est le chemin de l'ANCIENNE forme (la boucle dans la fonction) et
 * celui de la fonction quand elle amorce un run de la nouvelle : un clone, un
 * `writeFiles`, une lecture d'`AGENTS.md`.
 *
 * `layout` est EXPLICITE depuis MIN-354, même s'il vaut toujours `cloudLayout()`
 * ici : ce chemin-là parle à une microVM, et une microVM a toujours le layout du
 * cloud. Le passer plutôt que le supposer est ce qui fait que le jour où un host
 * parle à autre chose, il n'y a rien à retrouver dans ce fichier.
 */
export function sandboxHost(sandbox: Sandbox, layout: HarnessLayout): RepoHost {
  return {
    layout,
    exec: async (command: string, opts?: ShellOptions): Promise<ShellResult> => {
      const res = await sandbox.runCommand({
        cmd: "sh",
        args: ["-c", command],
        cwd: opts?.cwd ?? layout.repoDir,
        timeoutMs: opts?.timeoutMs,
        signal: opts?.signal,
        env: opts?.env,
      });
      const [stdout, stderr] = await Promise.all([res.stdout(), res.stderr()]);
      return { exitCode: res.exitCode, stdout, stderr };
    },
    readFile: async (absPath: string): Promise<string | null> => {
      const buf = await sandbox.readFileToBuffer({ path: absPath });
      return buf ? buf.toString("utf8") : null;
    },
    writeFile: async (absPath: string, content: string): Promise<void> => {
      await sandbox.writeFiles([{ path: absPath, content }]);
    },
    mkdir: async (absPath: string): Promise<void> => {
      await sandbox.mkDir(absPath);
    },
  };
}

/**
 * Credentials Sandbox explicites (dev / hors-Vercel). Vides sur Vercel → l'OIDC
 * prend le relais automatiquement.
 */
function sandboxCredentials(): { token: string; teamId: string; projectId: string } | Record<string, never> {
  const token = process.env.VERCEL_TOKEN?.trim();
  const teamId = process.env.VERCEL_TEAM_ID?.trim();
  const projectId = process.env.VERCEL_PROJECT_ID?.trim();
  if (token && teamId && projectId) return { token, teamId, projectId };
  return {};
}

/**
 * Récupère la microVM nommée `name` en RÉVEILLANT sa session (filesystem restauré
 * depuis le snapshot persistant → reprise rapide, `onCreate` NON appelé), sinon en
 * crée une neuve et appelle `onCreate` (qui clone la branche de travail). Un snapshot
 * expiré est traité comme « introuvable » → recrée + `onCreate`. Boot optionnel
 * depuis AGENT_SANDBOX_SNAPSHOT_ID (image pré-chauffée) pour la création fraîche.
 *
 * POLITIQUE RÉSEAU (MIN-223) — `networkPolicy` est posée à la création ET **reposée
 * à chaque réveil**, et ce n'est pas de la ceinture-bretelles :
 *
 * - la politique SURVIT bien à une reprise de session — mesuré le 2026-08-07 : une
 *   session reprise sans qu'on lui repasse quoi que ce soit rendait toujours 200
 *   sur la complétion avec le placeholder, et forwardait toujours le plan de
 *   contrôle. Ce n'était pas à supposer, c'est fait ;
 * - mais elle survit avec **la clé d'hier dedans**. La clé de run est révoquée
 *   quand la VM est mise au repos (`run-key.ts`), donc une session réveillée sans
 *   nouvelle politique repartirait avec un `transform` qui injecte une clé morte —
 *   des 401 à la première complétion, et rien pour le dire.
 *
 * D'où `updateNetworkPolicy` sur le chemin de réveil : il ne redit pas un défaut,
 * il re-pose le secret du jour. On ne le fait PAS sur le chemin de création (la
 * politique y est déjà passée en argument), et l'échec ne fait pas tomber le tour —
 * il vaut mieux un tour qui démarre sur l'ancienne politique, et le dit, qu'un tour
 * qui n'existe pas.
 */
export async function getOrCreateAgentSandbox(opts: {
  name: string;
  onCreate: (sandbox: Sandbox) => Promise<void>;
  /** Politique de MIN-223. Absente = comportement d'avant (réseau ouvert, aucune
   *  injection) — le temps que les appelants la câblent. */
  networkPolicy?: NetworkPolicy;
}): Promise<{ sandbox: Sandbox; created: boolean }> {
  const creds = sandboxCredentials();
  const snapshotId = process.env.AGENT_SANDBOX_SNAPSHOT_ID?.trim();
  let created = false;
  const base = {
    ...creds,
    name: opts.name,
    timeout: SANDBOX_TIMEOUT_MS,
    persistent: true,
    snapshotExpiration: SANDBOX_SNAPSHOT_EXPIRATION_MS,
    // Chaque arrêt de session crée un snapshot DE PLUS, tous vivants 7 jours, alors
    // qu'un seul sert jamais à la reprise : le stockage facturé suivait le nombre de
    // pauses du run, pas sa taille. On ne garde que le dernier — les évincés partent
    // tout de suite (`deleteEvicted` est vrai par défaut), et rien ici ne revient
    // jamais sur un snapshot antérieur (aucun `currentSnapshotId` dans le dépôt).
    keepLastSnapshots: { count: 1 },
    resume: true,
    ...(opts.networkPolicy ? { networkPolicy: opts.networkPolicy } : {}),
    onCreate: async (fresh: Sandbox) => {
      created = true;
      await opts.onCreate(fresh);
    },
  };
  const sandbox = snapshotId
    ? await Sandbox.getOrCreate({ ...base, source: { type: "snapshot", snapshotId } })
    : await Sandbox.getOrCreate({ ...base, runtime: SANDBOX_RUNTIME });

  if (opts.networkPolicy && !created) {
    await sandbox.updateNetworkPolicy(opts.networkPolicy).catch((err) => {
      console.error("[agent-sandbox] network policy refresh failed:", (err as Error).message);
    });
  }
  return { sandbox, created };
}

/** Nom stable de la microVM à persister dans agent_runs.sandbox_id. */
export function sandboxName(sandbox: Sandbox): string {
  return sandbox.name;
}

/**
 * Arrête une microVM par son NOM sans la réveiller (`resume: false`), pour le reaper
 * d'inactivité : on coupe la VM au repos tout en gardant son snapshot persistant, de
 * sorte que la session reste reprennable (réveil rapide au prochain message).
 * Best-effort — ne lève jamais (déjà arrêtée / expirée / introuvable).
 */
export async function stopSandboxByName(name: string): Promise<void> {
  try {
    const creds = sandboxCredentials();
    const sandbox = await Sandbox.get({ ...creds, name, resume: false });
    await sandbox.stop();
  } catch {
    // best-effort.
  }
}

/**
 * La microVM d'un run, par son nom, SANS la réveiller — pour la LIRE pendant que
 * son tour tourne (le diff en cours, MIN-266). `null` quand il n'y a rien à
 * lire : session expirée, VM endormie par le reaper, API en panne.
 *
 * `resume: false` pour la même raison que `isLoopCommandAlive` juste dessous, et
 * elle compte double ici : cette lecture part d'un geste d'interface (ouvrir la
 * vue diff), pas d'un cron. Réveiller la microVM d'un run au repos pour peindre
 * un diff relancerait sa facturation compute sur un clic — et le diff d'un run au
 * repos, lui, est déjà servi par la forge, qui ne coûte rien.
 */
export async function getAgentSandboxByName(name: string): Promise<Sandbox | null> {
  try {
    const creds = sandboxCredentials();
    return await Sandbox.get({ ...creds, name, resume: false });
  } catch {
    return null;
  }
}

/**
 * Combien de temps on laisse `wait()` répondre avant de conclure « il vit ».
 *
 * MESURÉ (2026-08-07, vraie microVM) : sur un process déjà mort, `wait()` rend en
 * **270 ms**. Cinq secondes sont donc très au-dessus du besoin — la marge est
 * pour la latence transatlantique, pas pour le verdict. Sur un process vivant,
 * `wait()` ne rend pas du tout : c'est le délai lui-même qui fait la réponse.
 */
const LOOP_COMMAND_WAIT_MS = 5_000;

/**
 * Le process de boucle d'un run `loop_in_vm` (MIN-224) vit-il encore ?
 *
 * `null` = on ne sait pas — microVM introuvable, session expirée, API en panne.
 * L'appelant doit alors NE RIEN FAIRE : le chien de garde ne conclut que sur un
 * fait, jamais sur un silence. `false` = le process a rendu, et c'est un constat
 * de décès exact.
 *
 * IL FAUT `wait()`, ET C'EST TOUT LE FICHIER. Une commande lancée en
 * `detached: true` ne voit **jamais** son `exitCode` réconcilié tant que personne
 * ne l'attend : mesuré sur une vraie microVM, un process tué depuis huit minutes
 * — absent de `ps`, plus un event dans le fil — rendait encore `exitCode: null`.
 * Lire ce champ seul faisait donc répondre « vivant » à ce chien de garde sur
 * TOUS les décès, et un run dont la boucle meurt restait `running` pour toujours :
 * le balayeur d'inactivité ne ramasse que
 * les runs au repos, et la microVM tournait jusqu'aux 24 h de la session.
 *
 * `wait()` borné rend les trois réponses sans en inventer aucune :
 *
 * - il REND ⇒ le process a fini, quel que soit son code (137 pour un SIGKILL) ;
 * - il n'a pas rendu dans le délai ⇒ le process travaille encore ;
 * - il lève autre chose ⇒ on ne sait pas, et on se tait.
 *
 * Le drapeau `timedOut` plutôt que le nom de l'exception : c'est NOTRE horloge
 * qui décide, pas la façon dont le SDK habille un abandon.
 *
 * `resume: false` DÉLIBÉRÉMENT : interroger l'état d'une commande ne doit jamais
 * réveiller une microVM que le reaper vient d'endormir — ça relancerait la
 * facturation compute d'un run au repos, à chaque passage du cron.
 */
export async function isLoopCommandAlive(
  sandboxId: string,
  commandId: string,
): Promise<boolean | null> {
  try {
    const creds = sandboxCredentials();
    const sandbox = await Sandbox.get({ ...creds, name: sandboxId, resume: false });
    const command = await sandbox.getCommand(commandId);
    if (!command) return null;
    // Déjà réconcilié (commande non détachée, ou quelqu'un l'a attendue avant
    // nous) : rien à demander de plus.
    if (command.exitCode != null) return false;

    const abort = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      abort.abort();
    }, LOOP_COMMAND_WAIT_MS);
    try {
      await command.wait({ signal: abort.signal });
      return false;
    } catch {
      return timedOut ? true : null;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return null;
  }
}

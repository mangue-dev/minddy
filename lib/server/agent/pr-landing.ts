import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { getAccountSettings } from "@/lib/server/account-settings";
import { insertEvents } from "@/lib/server/issue-events";
import { forgeActorValue } from "@/lib/pr-events";
import { defaultLocale, type Locale } from "@/i18n/config";
import { DEFAULT_NUMO_STATUS, type NumoDefaultStatus } from "@/lib/numo-default-status";
import type { RepoProviderId } from "@/lib/repo-providers";

import { notifyPullRequestOpened } from "./pr-opened-notify";
import { prStateFromRef, upsertPullRequest } from "./pull-requests";
import { syncIssueStatusFromPr } from "./issue-status-sync";
import { getRun, stampRun, type AgentRun } from "./runs";
import { isForgeApiError } from "./forge";
import type { EmitAgentEvent } from "./agent-contract";
import type { Forge } from "./forge";
import type { PullRequestRef } from "./pr";
import type { RepoCloneTarget } from "./repo-access";

/**
 * L'ATTERRISSAGE D'UN TOUR sur la pull request et sur le ticket : ouvrir,
 * rouvrir, enregistrer, commenter, tracer — et les mots exacts avec lesquels tout
 * ça se raconte.
 *
 * EXTRAIT D'`execute.ts` PAR MIN-224, et pour une raison précise. La boucle
 * tourne désormais dans la microVM, mais elle n'a ni la forge ni la base : c'est
 * la fonction qui fait atterrir le tour, par le plan de contrôle. Il y a donc
 * DEUX appelants — l'ancienne forme (`executeAgentRun`) et la nouvelle
 * (`vm-rest.ts`) —, et le critère de bascule du cadrage est que « le fil raconte
 * la même chose » des deux côtés.
 *
 * Recopier ces gestes-là aurait rendu ce critère invérifiable : deux copies d'une
 * réouverture de PR divergent au premier correctif porté d'un seul côté, et la
 * divergence ne se voit que sur une PR refusée, plusieurs jours plus tard. Ici il
 * n'y a qu'une implémentation, et les deux moteurs l'appellent.
 */


/**
 * Ce qu'il faut savoir du run pour le faire atterrir. Un objet explicite plutôt
 * que des closures : depuis MIN-224 il y a DEUX appelants, et un contexte qu'on
 * se passe est la seule forme qui marche des deux côtés.
 *
 * `prState` est MUTÉ ici — c'est l'état vivant de la pull request pendant le
 * tour, et la fin de tour doit lire celui qui est à jour, pas celui figé au
 * claim.
 */
export interface PrLandingContext {
  run: AgentRun;
  target: RepoCloneTarget;
  forge: Forge;
  /** Ticket ANCRE du run, quand il y en a un. Null = run carnet ou relecture :
   *  aucun ticket à synchroniser, à commenter ni à tracer. */
  issue: { identifier: string } | null;
  workBranch: string;
  baseBranch: string;
  /** Langue du commentaire de ticket : celle du lanceur. */
  locale: Locale;
  /** L'émetteur d'events du moteur appelant : `appendEvent` sérialisé dans la
   *  fonction, un POST vers `/events` depuis la microVM. Même type que celui de
   *  la boucle, pour qu'aucun des deux n'ait à en fabriquer un second. */
  emit: EmitAgentEvent;
  prState: { number: number | null; url: string | null; state: AgentRun["pr_state"] };
}

/** Base de seq des lignes `sandbox_compute` (hors de la bande des appels LLM). */
export const SANDBOX_USAGE_SEQ_BASE = 1_000_000_000;

/** Note de fil quand le push de fin de tour échoue (visible dans la conversation). */
export const PUSH_FAILED_STRINGS: Record<Locale, (detail: string) => string> = {
  fr: (detail) =>
    `Le push de fin de tour a échoué — la branche distante n'a PAS reçu le travail de ce tour. Le travail reste dans la sandbox et sera re-poussé au prochain tour. Détail : ${detail}`,
  en: (detail) =>
    `The turn-end push failed — the remote branch did NOT receive this turn's work. The work is kept in the sandbox and will be pushed again next turn. Detail: ${detail}`,
};

/** Terme provider affiché dans les notes/commentaires (marques, non localisées). */
export function prTerm(provider: RepoProviderId): string {
  return provider === "gitlab" ? "merge request" : "pull request";
}

/** Référence provider d'une PR/MR : `#12` sur GitHub, `!12` sur GitLab. */
export function prRef(provider: RepoProviderId, n: number): string {
  return provider === "gitlab" ? `!${n}` : `#${n}`;
}

function capitalized(term: string): string {
  return term.charAt(0).toUpperCase() + term.slice(1);
}

/** Note de fil quand la PR a été fusionnée PENDANT le tour (travail hors PR). */
export const MERGED_DURING_TURN_STRINGS: Record<Locale, (ref: string, term: string) => string> = {
  fr: (ref, term) =>
    `La ${term} ${ref} a été fusionnée pendant ce tour : le nouveau travail a été poussé sur la branche mais n'appartient plus à aucune ${term}. Lance une nouvelle session pour continuer — elle repartira d'une branche neuve.`,
  en: (ref, term) =>
    `${capitalized(term)} ${ref} was merged during this turn: the new work was pushed to the branch but no longer belongs to any ${term}. Start a new session to continue — it will begin from a fresh branch.`,
};

const COMMENT_STRINGS: Record<
  Locale,
  {
    header: (id: string) => string;
    opened: (term: string) => string;
    reopened: (term: string) => string;
    viewPr: (term: string) => string;
  }
> = {
  fr: {
    header: (id) => `Agent numo — ${id}`,
    opened: (term) => `${capitalized(term)} ouverte.`,
    reopened: (term) => `${capitalized(term)} rouverte avec le nouveau travail.`,
    viewPr: (term) => `Voir la ${term}`,
  },
  en: {
    header: (id) => `Numo agent — ${id}`,
    opened: (term) => `${capitalized(term)} opened.`,
    reopened: (term) => `${capitalized(term)} reopened with the new work.`,
    viewPr: (term) => `View the ${term}`,
  },
};

/**
 * Réglages de compte qui pilotent le run, lus en UN appel (`getAccountSettings`
 * porte déjà les deux) :
 *  - `locale` : langue du résumé de l'agent et du commentaire d'issue. Celle du
 *    lanceur, défaut owner du projet, puis défaut de l'app.
 *  - `numoDefaultStatus` : statut d'atterrissage d'un ticket créé par l'agent
 *    (Compte → Préférences). Il ne vient QUE du lanceur — c'est SON réglage ;
 *    sans lanceur, le défaut historique (`triage`), jamais celui de l'owner.
 */
export async function resolveRunPrefs(
  run: AgentRun,
): Promise<{ locale: Locale; numoDefaultStatus: NumoDefaultStatus }> {
  if (run.created_by) {
    const r = await getAccountSettings({ userId: run.created_by });
    if (r.ok) {
      return {
        locale: r.settings.locale,
        numoDefaultStatus: r.settings.numo_default_status,
      };
    }
  }
  try {
    const service = getServiceClient();
    const { data } = await service
      .from("projects")
      .select("owner_id")
      .eq("id", run.project_id)
      .maybeSingle();
    const ownerId = (data as { owner_id?: string } | null)?.owner_id;
    if (ownerId) {
      const r = await getAccountSettings({ userId: ownerId });
      if (r.ok) {
        return { locale: r.settings.locale, numoDefaultStatus: DEFAULT_NUMO_STATUS };
      }
    }
  } catch {
    // ignore — on retombe sur le défaut
  }
  return { locale: defaultLocale, numoDefaultStatus: DEFAULT_NUMO_STATUS };
}

/**
 * Poste un commentaire d'issue sur ÉVÉNEMENT PR uniquement (création/réouverture),
 * attribué à Numo. Les tours de conversation ordinaires ne commentent plus le
 * ticket : tout vit dans la conversation de la session.
 */
export async function postPrComment(
  run: AgentRun,
  identifier: string,
  kind: "opened" | "reopened",
  prUrl: string,
  locale: Locale,
  provider: RepoProviderId,
): Promise<void> {
  if (!run.created_by || !run.issue_id) return;
  try {
    const service = getServiceClient();
    const s = COMMENT_STRINGS[locale] ?? COMMENT_STRINGS.en;
    const term = prTerm(provider);
    const label = kind === "reopened" ? s.reopened(term) : s.opened(term);
    const body = `**${s.header(identifier)}**\n\n${label}\n\n🔗 [${s.viewPr(term)}](${prUrl})`;
    await service.from("comments").insert({
      issue_id: run.issue_id,
      author_id: run.created_by,
      body,
      via_assistant: true,
    });
  } catch (err) {
    console.error("[agent-execute] PR comment failed:", (err as Error).message);
  }
}
/**
 * Trace un geste de Numo sur la PR dans le journal d'activité du ticket.
 *
 * L'acteur en base est l'auteur du run (il faut un utilisateur réel), mais
 * `via_assistant` fait dire NUMO à la timeline — c'est lui qui a agi, et la
 * règle d'identité vaut dans les deux sens. `from_value` ne porte pas de
 * login mais le PROVIDER (cf. `forgeActorValue`), sans quoi une merge request
 * GitLab se raconterait en vocabulaire GitHub.
 */
export async function recordAgentPrEvent(
  ctx: PrLandingContext,
  type: "pr_opened" | "pr_reopened" | "pr_committed",
  prNumber: number,
): Promise<void> {
  const { run, target } = ctx;
  if (!run.issue_id || !run.created_by) return;
  await insertEvents(getServiceClient(), [
    {
      issue_id: run.issue_id,
      actor_id: run.created_by,
      type,
      from_value: forgeActorValue(target.provider, null),
      to_value: String(prNumber),
      via_assistant: true,
    },
  ]);
}

/**
 * « Numo a commité sur la PR #12 » — un push qui a fait AVANCER la branche
 * distante, et seulement quand une PR le porte : avant elle, les commits
 * n'appartiennent à rien que le ticket puisse nommer.
 *
 * `remoteUpdated` et non `pushed` : un push qui ne pousse rien de neuf (le
 * remote était déjà à jour) n'est pas un fait.
 */
export async function notePrCommits(
  ctx: PrLandingContext,
  pushed: { remoteUpdated: boolean } | null,
): Promise<void> {
  if (!pushed?.remoteUpdated || ctx.prState.number == null) return;
  await recordAgentPrEvent(ctx, "pr_committed", ctx.prState.number);
}

/** Enregistre une PR ouverte/rouverte : état local + stamp + statut d'issue +
 *  event live + commentaire d'issue (le SEUL commentaire du nouveau modèle). */
export async function registerPr(
  ctx: PrLandingContext,
  pr: PullRequestRef,
  kind: "opened" | "reopened",
): Promise<void> {
  const { run, target, issue, workBranch, baseBranch, locale, emit, prState } = ctx;
  prState.number = pr.number;
  prState.url = pr.url;
  // Le MÊME calcul que celui qui alimente `pull_requests` dix lignes plus
  // bas (MIN-164) : le run le refaisait à la main, sans lire `draft`, et les
  // deux colonnes d'état divergeaient dès qu'une PR brouillon passait par
  // ici — rouverte, ou déjà ouverte par un humain sur la branche du run.
  prState.state = prStateFromRef(pr);
  await emit("pr_opened", { number: pr.number, url: pr.url });
  await stampRun(run.id, {
    pr_number: pr.number,
    pr_url: pr.url,
    pr_state: prState.state,
  });
  // La PR est une ENTITÉ (MIN-143) : elle entre dans `pull_requests` ici,
  // sans attendre l'écho du webhook — qui n'arrive jamais en dev, et que la
  // page Pull Requests lit désormais au lieu d'`agent_runs`. Le run, lui, est
  // la meilleure source du ticket : il le SAIT, là où l'ingestion webhook
  // doit le déduire du nom de branche.
  const prRow = await upsertPullRequest({
    provider: target.provider,
    repoFullName: target.repoFullName,
    number: pr.number,
    state: prStateFromRef(pr),
    url: pr.url,
    title: pr.title ?? null,
    authorLogin: pr.user?.login ?? null,
    authorAvatarUrl: pr.user?.avatar_url ?? null,
    headBranch: pr.head ?? workBranch,
    baseBranch: pr.base ?? baseBranch,
    headSha: pr.headSha ?? null,
    openedAt: pr.createdAt ?? null,
    mergedAt: pr.mergedAt ?? null,
    updatedAt: pr.updatedAt,
    issueId: run.issue_id,
  });
  // Inbox : le projet apprend qu'une pull request attend des yeux. Ici et
  // pas au webhook — celui-ci n'arrive jamais en dev, et l'ouverture faite
  // par Numo porte le compte de l'App, que les récepteurs écartent comme
  // écho. La réouverture, elle, ne s'annonce pas : la PR était déjà connue.
  if (kind === "opened") await notifyPullRequestOpened(prRow);
  // Run CARNET : aucun ticket à synchroniser ni à commenter — la PR vit dans
  // la conversation de la session (et sur la page Pull requests).
  if (issue && run.issue_id) {
    if (run.created_by) {
      await syncIssueStatusFromPr({
        issueId: run.issue_id,
        actorId: run.created_by,
        prState: prState.state,
      });
    }
    // « Numo a ouvert la pull request #12 » dans le journal d'activité. Émis
    // ICI et pas par le webhook : la PR part du token de l'App (GitHub) ou du
    // compte qui a lié le dépôt (GitLab), donc l'écho porte une identité de
    // machine ou celle d'un tiers — or c'est Numo qui a ouvert. Les deux
    // récepteurs écartent d'ailleurs leur propre écho.
    // Ouvrir et ROUVRIR sont deux faits distincts (MIN-164) : la réouverture
    // ne se racontait pas du tout, et le ticket repassait en revue sans que
    // rien ne dise ce qui l'y avait remis.
    await recordAgentPrEvent(ctx, kind === "opened" ? "pr_opened" : "pr_reopened", pr.number);
    await postPrComment(run, issue.identifier, kind, pr.url, locale, target.provider);
  }
}

/**
 * Recale `prState` sur la BASE : les actions in-app (merge/reject pendant que
 * l'agent tourne) et le webhook GitHub stampent `agent_runs.pr_state`, invisible
 * du snapshot pris au claim. Sans ce recalage, un reject mid-turn ne serait
 * jamais rouvert au push, et un merge mid-turn passerait inaperçu.
 */
export async function refreshPrStateFromDb(ctx: PrLandingContext): Promise<void> {
  const db = await getRun(ctx.run.id).catch(() => null);
  if (!db) return;
  ctx.prState.number = db.pr_number;
  ctx.prState.url = db.pr_url;
  ctx.prState.state = db.pr_state;
}

/**
 * La session suit une PR REFUSÉE et un push vient de faire AVANCER le remote →
 * on la ROUVRE (règle produit : on réitère toujours la dernière PR du ticket,
 * jamais de doublon). Appelé après CHAQUE push. Décision sur `remoteUpdated` (le
 * remote a bougé), pas `committed` : un commit posé à un appel précédent (push
 * 5xx) part avec un arbre propre au suivant. Une PR mergée n'est jamais
 * ressuscitée (le reopen échoue → on n'insiste pas). Best-effort.
 */
export async function reopenIfRejectedWorkPushed(
  ctx: PrLandingContext,
  pushed: { remoteUpdated: boolean } | null,
  token: string,
): Promise<void> {
  if (!pushed?.remoteUpdated) return;
  await refreshPrStateFromDb(ctx);
  if (ctx.prState.number == null || ctx.prState.state !== "closed") return;
  const reopened = await ctx.forge
    .reopenPullRequest({
      token,
      repoFullName: ctx.target.repoFullName,
      number: ctx.prState.number,
    })
    .catch((err) => {
      console.error("[pr-landing] PR reopen on push failed:", (err as Error).message);
      return null;
    });
  if (reopened && !reopened.merged) await registerPr(ctx, reopened, "reopened");
}

/**
 * LA MOITIÉ FORGE DE `create_pr` : ce qui se passe une fois que le travail EST
 * POUSSÉ. PR déjà vivante → no-op informatif (le push l'a mise à jour) ; PR
 * refusée → réouverture (règle produit : on réitère la dernière PR du ticket,
 * jamais de doublon) ; sinon → création. Une PR mergée n'est jamais réutilisée.
 *
 * SÉPARÉE DU PUSH par MIN-224, et la coupure tombe au bon endroit : le dépôt vit
 * dans la microVM, la forge et son token vivent dans la fonction. L'ancienne
 * forme pousse puis appelle ceci en direct ; la nouvelle pousse DANS la VM puis
 * appelle ceci par le plan de contrôle. Une seule implémentation des quatre cas
 * ci-dessous, qui sont exactement ceux qu'on ne veut pas voir diverger.
 */
export async function openPullRequestAfterPush(
  ctx: PrLandingContext,
  opts: {
    /** Ce que `commitAndPush` a rendu — c'est lui qui décide s'il y a matière. */
    pushed: { pushed: boolean; remoteUpdated: boolean; headSha: string };
    /** Titre demandé par le modèle, déjà rempli par défaut le cas échéant. */
    prTitle: string;
    body?: string;
    /** Cible fraîche (token re-résolu par l'appelant). */
    fresh: RepoCloneTarget;
    /** Ce qu'on doit dire au modèle des jobs de fond tués avant l'indexation. */
    jobsNote: string;
    /** Appelé au premier push RÉEL — enregistre la branche sur la ligne du run. */
    noteBranchPushed: (pushed: { pushed: boolean }) => Promise<void>;
  },
): Promise<{ result: unknown; success: boolean }> {
  const { forge, issue, workBranch, baseBranch, prState } = ctx;
  const { pushed, prTitle, body, fresh, jobsNote, noteBranchPushed } = opts;
  const andJobs = (text: string) => (jobsNote ? `${text} ${jobsNote}` : text);
  // Rien de commité par-dessus la base : on s'arrête AVANT de toucher au dépôt
  // (MIN-123). Pousser créerait une branche vide pour rien — et la forge
  // refuserait la PR (422) juste après, en la laissant derrière elle.
  if (!pushed.pushed) {
    return {
      result: {
        error: andJobs(
          "Nothing to open a pull request for: this session hasn't changed any file yet. Do the work first, then call create_pr.",
        ),
      },
      success: false,
    };
  }
  await noteBranchPushed(pushed);
  // `create_pr` sur une PR qui existe DÉJÀ : ce push l'alimente, il se trace
  // comme les autres. Sur une PR encore à ouvrir, `prState.number` est nul et
  // rien ne se trace — c'est `registerPr` qui dira « a ouvert la PR ».
  await notePrCommits(ctx, pushed);
  if (prState.number != null) {
    const current = await forge
      .getPullRequest({
        token: fresh.token,
        repoFullName: fresh.repoFullName,
        number: prState.number,
      })
      .catch(() => null);
    if (current?.merged) {
      return {
        result: {
          error: andJobs(
            `Pull request #${prState.number} is already merged — this branch's work is shipped. A new session on this ticket will start a fresh branch and pull request.`,
          ),
        },
        success: false,
      };
    }
    if (current && current.state !== "closed") {
      return {
        result: {
          number: current.number,
          url: current.url,
          note: andJobs(
            "A pull request already exists for this branch — your pushes update it automatically; nothing was created.",
          ),
        },
        success: true,
      };
    }
    if (current && current.state === "closed") {
      const reopened = await forge
        .reopenPullRequest({
          token: fresh.token,
          repoFullName: fresh.repoFullName,
          number: prState.number,
        })
        .catch((err) => {
          console.error("[agent-execute] PR reopen failed:", (err as Error).message);
          return null;
        });
      if (reopened) {
        await registerPr(ctx, reopened, "reopened");
        return {
          result: {
            number: reopened.number,
            url: reopened.url,
            note: andJobs("The rejected pull request was reopened with the new work."),
          },
          success: true,
        };
      }
    }
    // PR illisible / réouverture impossible (branche tête supprimée puis
    // recréée par notre push…) → on retombe sur une création propre.
  }
  const prBody = `${body?.trim() || prTitle}\n\n---\n🤖 Généré par l'agent numo (minddy) · ${issue ? `issue ${issue.identifier}` : "note du carnet"}`;
  try {
    const pr = await forge.ensurePullRequest({
      token: fresh.token,
      repoFullName: fresh.repoFullName,
      head: workBranch,
      base: baseBranch,
      title: prTitle,
      body: prBody,
    });
    await registerPr(ctx, pr, "opened");
    return {
      result: { number: pr.number, url: pr.url, ...(jobsNote ? { note: jobsNote } : {}) },
      success: true,
    };
  } catch (err) {
    if (isForgeApiError(err) && err.status === 422) {
      return {
        result: {
          error: andJobs(
            "The branch has no changes compared to the base branch — there is nothing to open a pull request for.",
          ),
        },
        success: false,
      };
    }
    return { result: { error: andJobs((err as Error).message) }, success: false };
  }
}

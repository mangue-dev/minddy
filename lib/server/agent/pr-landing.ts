import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { getAccountSettings } from "@/lib/server/account-settings";
import { getProjectAccess } from "@/lib/server/project-access";
import { insertEvents } from "@/lib/server/issue-events";
import { forgeActorValue } from "@/lib/pr-events";
import { defaultLocale, type Locale } from "@/i18n/config";
import { DEFAULT_NUMO_STATUS, type NumoDefaultStatus,
} from "@/lib/numo-default-status";
import type { RepoProviderId } from "@/lib/repo-providers";
import { DEFAULT_AGENT_BRANCH_PREFIX } from "./branch-name";

import { notifyPullRequestOpened } from "./pr-opened-notify";
import { prStateFromRef, upsertPullRequest } from "./pull-requests";
import { syncIssueStatusFromPr } from "./issue-status-sync";
import { getRun, runRepoBindingIsCurrent, stampRun, type AgentRun,
} from "./runs";
import { isValidGitBranchName } from "./branch-name";
import { isForgeApiError } from "./forge";
import type { EmitAgentEvent } from "./agent-contract";
import type { Forge } from "./forge";
import type { PullRequestRef } from "./pr";
import type { RepoCloneTarget } from "./repo-access";

/**
 * THE LANDING OF A TOWER on the pull request and on the ticket: open,
 * reopen, save, comment, trace — and the exact words with which everything
 * is told.
 *
 * EXTRACT FROM`execute.ts` BY MIN-224, and for a specific reason. The
 * loop now runs in the microVM, but it has neither the forge nor the base: it is
 * the function that lands the round, by the control plane. So there are
 * TWO callers — the old form (`executeAgentRun`) and the new
 * (`vm-rest.ts`) —, and the framing toggle criterion is that "the thread tells
 * the same thing" on both sides.
 *
 * Copying these gestures would have made this criterion unverifiable: two copies of a
 * reopening of PR diverge on the first patch carried on only one side, and the
 * divergence is only seen on a PR refused, several days later. Here there
 * is only one implementation, and both engines call it.
 */


/**
 * What you need to know about the run to land it. An explicit object rather than closures: since MIN-224 there are TWO callers, and a context that happens is the only form that works on both sides. the
 * round, and the end of the round must read the one that is up to date, not the one frozen at
 * claim.
 */
export interface PrLandingContext {
  run: AgentRun;
  target: RepoCloneTarget;
  forge: Forge;
  /** ANCHOR ticket of the run, when there is one. Null = run notebook or reread:
   * no tickets to synchronize, comment or trace. */
  issue: { identifier: string } | null;
  workBranch: string;
  baseBranch: string;
  /** Langue du commentaire de ticket : celle du lanceur. */
  locale: Locale;
  /** The calling engine's event emitter: `appendEvent` serialized in the
   * function, a POST to `/events` from the microVM. Same type as that of
   * the loop, so that neither has to make a second one. */
  emit: EmitAgentEvent;
  prState: { number: number | null; url: string | null; state: AgentRun["pr_state"];
  };
}

/** Base seq of `sandbox_compute` lines (outside the LLM call band). */
export const SANDBOX_USAGE_SEQ_BASE = 1_000_000_000;

export class PrLandingAuthorityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PrLandingAuthorityError";
  }
}

/**
 * Re-read every mutable authority input immediately before a forge transition.
 * The run snapshot supplies the immutable repository identity; the project link
 * and membership supply current authorization. Both must still agree.
 */
export async function assertPrLandingAuthority(
  ctx: PrLandingContext,
  target: RepoCloneTarget = ctx.target,
): Promise<AgentRun> {
  const current = await getRun(ctx.run.id).catch(() => null);
  if (!current || current.status !== "running" || !current.created_by) {
    throw new PrLandingAuthorityError("run is no longer authorized to land");
  }
  const [access, bindingCurrent] = await Promise.all([
    getProjectAccess(current.created_by, current.project_id).catch(() => null),
    runRepoBindingIsCurrent(current).catch(() => false),
  ]);
  if (!access?.isMember) {
    throw new PrLandingAuthorityError("run owner no longer has project access");
  }
  if (!bindingCurrent) {
    throw new PrLandingAuthorityError("run repository binding has changed");
  }
  if (
    target.linkId !== current.repo_link_id ||
    target.connectionId !== current.connection_id ||
    target.provider !== current.repo_provider ||
    target.externalRepoId !== current.repo_external_id
  ) {
    throw new PrLandingAuthorityError("fresh repository target does not match the run",
    );
  }
  if (!isValidGitBranchName(ctx.workBranch) || !isValidGitBranchName(ctx.baseBranch)) {
    throw new PrLandingAuthorityError("invalid pull request branch");
  }
  if (current.branch_name && current.branch_name !== ctx.workBranch) {
    throw new PrLandingAuthorityError("working branch does not match the run");
  }
  return current;
}

/** Thread note when end of turn push fails (visible in conversation). */
export const PUSH_FAILED_STRINGS: Record<Locale, (detail: string) => string> = {
  fr: (detail) =>
    `Le push de fin de tour a échoué — la branche distante n'a PAS reçu le travail de ce tour. Le travail reste dans la sandbox et sera re-poussé au prochain tour. Détail : ${detail}`,
  en: (detail) =>
    `The turn-end push failed — the remote branch did NOT receive this turn's work. The work is kept in the sandbox and will be pushed again next turn. Detail: ${detail}`,
  de: (detail) =>
    `Der Push am Ende dieser Runde ist fehlgeschlagen — der Remote-Branch hat die Änderungen dieser Runde NICHT erhalten. Die Änderungen bleiben in der Sandbox und werden in der nächsten Runde erneut gepusht. Details: ${detail}`,
  "pt-BR": (detail) =>
    `O push ao final desta rodada falhou — a branch remota NÃO recebeu as alterações desta rodada. O trabalho continua na sandbox e será enviado novamente na próxima rodada. Detalhes: ${detail}`,
  it: (detail) =>
    `Il push al termine di questo turno non è riuscito — il branch remoto NON ha ricevuto le modifiche di questo turno. Il lavoro rimane nella sandbox e verrà inviato di nuovo al prossimo turno. Dettagli: ${detail}`,
  es: (detail) =>
    `El push al final de este turno ha fallado — la rama remota NO ha recibido los cambios de este turno. El trabajo se conserva en el entorno y volverá a enviarse en el próximo turno. Detalles: ${detail}`,
};

/** Provider term displayed in notes/comments (brands, not localized). */
export function prTerm(provider: RepoProviderId): string {
  return provider === "gitlab" ? "merge request" : "pull request";
}

/** Provider reference of a PR/MR: `#12` on GitHub, `!12` on GitLab. */
export function prRef(provider: RepoProviderId, n: number): string {
  return provider === "gitlab" ? `!${n}` : `#${n}`;
}

function capitalized(term: string): string {
  return term.charAt(0).toUpperCase() + term.slice(1);
}

/** Thread note when the PR was merged DURING the round (non-PR work). */
export const MERGED_DURING_TURN_STRINGS: Record<
  Locale,
  (ref: string, term: string) => string
> = {
  fr: (ref, term) =>
    `La ${term} ${ref} a été fusionnée pendant ce tour : le nouveau travail a été poussé sur la branche mais n'appartient plus à aucune ${term}. Lance une nouvelle session pour continuer — elle repartira d'une branche neuve.`,
  en: (ref, term) =>
    `${capitalized(term)} ${ref} was merged during this turn: the new work was pushed to the branch but no longer belongs to any ${term}. Start a new session to continue — it will begin from a fresh branch.`,
  de: (ref, term) =>
    `${capitalized(term)} ${ref} wurde während dieser Runde zusammengeführt: Die neuen Änderungen wurden auf den Branch gepusht, gehören aber nicht mehr zu einem ${term}. Starte eine neue Sitzung, um fortzufahren — sie beginnt mit einem neuen Branch.`,
  "pt-BR": (ref, term) =>
    `${capitalized(term)} ${ref} foi mesclado durante esta rodada: as novas alterações foram enviadas para a branch, mas não pertencem mais a nenhum ${term}. Inicie uma nova sessão para continuar — ela começará em uma branch nova.`,
  it: (ref, term) =>
    `${capitalized(term)} ${ref} è stata unita durante questo turno: le nuove modifiche sono state inviate al branch, ma non appartengono più ad alcuna ${term}. Avvia una nuova sessione per continuare — partirà da un branch nuovo.`,
  es: (ref, term) =>
    `${capitalized(term)} ${ref} se fusionó durante este turno: los cambios nuevos se enviaron a la rama, pero ya no pertenecen a ninguna ${term}. Inicia una sesión nueva para continuar — partirá de una rama nueva.`,
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
    reopened: (term) =>
      `${capitalized(term)} rouverte avec le nouveau travail.`,
    viewPr: (term) => `Voir la ${term}`,
  },
  en: {
    header: (id) => `Numo agent — ${id}`,
    opened: (term) => `${capitalized(term)} opened.`,
    reopened: (term) => `${capitalized(term)} reopened with the new work.`,
    viewPr: (term) => `View the ${term}`,
  },
  de: {
    header: (id) => `Numo-Agent — ${id}`,
    opened: (term) => `${capitalized(term)} geöffnet.`,
    reopened: (term) =>
      `${capitalized(term)} mit den neuen Änderungen wieder geöffnet.`,
    viewPr: (term) => `${capitalized(term)} ansehen`,
  },
  "pt-BR": {
    header: (id) => `Agente Numo — ${id}`,
    opened: (term) => `${capitalized(term)} aberto.`,
    reopened: (term) =>
      `${capitalized(term)} reaberto com as novas alterações.`,
    viewPr: (term) => `Ver ${term}`,
  },
  it: {
    header: (id) => `Agente Numo — ${id}`,
    opened: (term) => `${capitalized(term)} aperta.`,
    reopened: (term) => `${capitalized(term)} riaperta con le nuove modifiche.`,
    viewPr: (term) => `Visualizza ${term}`,
  },
  es: {
    header: (id) => `Agente Numo — ${id}`,
    opened: (term) => `${capitalized(term)} abierta.`,
    reopened: (term) =>
      `${capitalized(term)} reabierta con los cambios nuevos.`,
    viewPr: (term) => `Ver ${term}`,
  },
};

/**
 * Account settings that drive the run, read in ONE call (`getAccountSettings`
 * already carries both):
 * - `locale`: language of the agent summary and outcome comment. That of the
 * launcher, project owner default, then app default.
 * - `numoDefaultStatus`: landing status of a ticket created by the agent
 * (Account → Preferences). It ONLY comes from the launcher — it's HIS setting;
 * without a launcher, the historical default (`triage`), never that of the owner.
 * - `branchPrefix`: namespace of new work branches (Account → Agent). It comes
 * from the launcher; fallback contexts use `numo/`.
 */
export async function resolveRunPrefs(
  run: AgentRun,
): Promise<{
  locale: Locale;
  numoDefaultStatus: NumoDefaultStatus;
  branchPrefix: string;
}> {
  if (run.created_by) {
    const r = await getAccountSettings({ userId: run.created_by });
    if (r.ok) {
      return {
        locale: r.settings.locale,
        numoDefaultStatus: r.settings.numo_default_status,
        branchPrefix: r.settings.agent.branch_prefix,
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
        return {
          locale: r.settings.locale,
          numoDefaultStatus: DEFAULT_NUMO_STATUS,
          branchPrefix: DEFAULT_AGENT_BRANCH_PREFIX,
        };
      }
    }
  } catch {
    // ignore — we fall back on the default
  }
  return {
    locale: defaultLocale,
    numoDefaultStatus: DEFAULT_NUMO_STATUS,
    branchPrefix: DEFAULT_AGENT_BRANCH_PREFIX,
  };
}

/**
 * Posts an issue comment on PR EVENT only (creation/reopening),
 * assigned to Numo. Ordinary conversation turns no longer comment on the
 * ticket: everything lives in the session conversation.
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
    const s = COMMENT_STRINGS[locale];
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
 * Traces a gesture by Numo on the PR in the ticket activity log.
 *
 * The base actor is the author of the run (a real user is needed), but
 * `via_assistant` makes the timeline say NUMO — he is the one who acted, and the
 * identity rule applies both ways. `from_value` does not carry a
 * login but the PROVIDER (see `forgeActorValue`), otherwise a merge request
 * GitLab would be told in GitHub vocabulary.
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
 * "Numo committed to PR #12" — a push that ADVANCED the remote branch
 *, and only when a PR carries it: before it, the commits
 * do not belong to anything the ticket can name.
 *
 * `remoteUpdated` and not `pushed`: a push that does not push anything new (the
 * remote was already up to date) is not a fact.
 */
export async function notePrCommits(
  ctx: PrLandingContext,
  pushed: { remoteUpdated: boolean } | null,
): Promise<void> {
  if (!pushed?.remoteUpdated || ctx.prState.number == null) return;
  await recordAgentPrEvent(ctx, "pr_committed", ctx.prState.number);
}

/** Records an opened/reopened PR: local state + stamp + issue status +
 * live event + issue comment (the ONLY comment of the new model). */
export async function registerPr(
  ctx: PrLandingContext,
  pr: PullRequestRef,
  kind: "opened" | "reopened",
): Promise<void> {
  await assertPrLandingAuthority(ctx);
  const { run, target, issue, workBranch, baseBranch, locale, emit, prState } =
    ctx;
  prState.number = pr.number;
  prState.url = pr.url;
  // The SAME calculation that powers `pull_requests` ten more lines
  // low (MIN-164): the run did it again by hand, without reading `draft`, and the
  // two status columns diverged as soon as a draft PR passed through
  // here — reopened, or already opened by a human on the run branch.
  prState.state = prStateFromRef(pr);
  await emit("pr_opened", { number: pr.number, url: pr.url });
  await stampRun(run.id, {
    pr_number: pr.number,
    pr_url: pr.url,
    pr_state: prState.state,
  });
  // The PR is an ENTITY (MIN-143): it enters `pull_requests` here,
  // without waiting for the webhook echo — which never arrives in dev, and the
  //Pull Requests page now reads instead of `agent_runs`. The run is
  // the best source of the ticket: he KNOWS it, where webhook ingestion
  // must infer it from the branch name.
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
  // Inbox: the project learns that a pull request is waiting for eyes. Here and
  // not to the webhook — this never arrives in dev, and the opening is done
  // by Numo carries the account of the App, which the receivers dismiss as
  // echo. The reopening is not announced: the PR was already known.
  if (kind === "opened") await notifyPullRequestOpened(prRow);
  // Run NOTEBOOK: no tickets to synchronize or comment on — PR lives in
  // the session conversation (and on the Pull requests page).
  if (issue && run.issue_id) {
    if (run.created_by) {
      await syncIssueStatusFromPr({
        issueId: run.issue_id,
        actorId: run.created_by,
        prState: prState.state,
      });
    }
    // “Numo opened pull request #12” in the activity log. Issued
    // HERE and not through the webhook: the PR starts from the App token (GitHub) or from the
    // account that linked the repository (GitLab), so the echo carries an identity of
    // machine or that of a third party — but it was Numo who opened it. Both
    // receivers also reject their own echo.
    // Open and REOPEN are two distinct facts (MIN-164): reopening
    // was not told at all, and the ticket was reviewed again without
    // rien ne dise ce qui l'y avait remis.
    await recordAgentPrEvent(
      ctx,
      kind === "opened" ? "pr_opened" : "pr_reopened",
      pr.number,
    );
    await postPrComment(
      run,
      issue.identifier,
      kind,
      pr.url,
      locale,
      target.provider,
    );
  }
}

/**
 * Restores `prState` on the BASE: in-app actions (merge/reject while
 * the agent is running) and the GitHub webhook stamps `agent_runs.pr_state`, invisible
 * of the snapshot taken at the claim. Without this adjustment, a mid-turn reject would never be reopened to push, and a mid-turn merge would go unnoticed.
 */
export async function refreshPrStateFromDb(
  ctx: PrLandingContext,
): Promise<void> {
  const db = await getRun(ctx.run.id).catch(() => null);
  if (!db) return;
  ctx.prState.number = db.pr_number;
  ctx.prState.url = db.pr_url;
  ctx.prState.state = db.pr_state;
}

/**
 * The session follows a REFUSED PR and a push has just ADVANCED the remote →
 * we REOPEN it (product rule: we always repeat the last PR of the ticket,
 * never a duplicate). Called after EACH push. Decision on `remoteUpdated` (the
 * remote has moved), not `committed`: a commit made in a previous call (push
 * 5xx) leaves with a tree specific to the next one. A merged PR is never
 * resurrected (the reopen fails → we do not insist). Best-effort.
 */
export async function reopenIfRejectedWorkPushed(
  ctx: PrLandingContext,
  pushed: { remoteUpdated: boolean } | null,
  token: string,
): Promise<void> {
  if (!pushed?.remoteUpdated) return;
  await refreshPrStateFromDb(ctx);
  if (ctx.prState.number == null || ctx.prState.state !== "closed") return;
  await assertPrLandingAuthority(ctx);
  const reopened = await ctx.forge
    .reopenPullRequest({
      token,
      repoFullName: ctx.target.repoFullName,
      number: ctx.prState.number,
    })
    .catch((err) => {
      console.error(
        "[pr-landing] PR reopen on push failed:",
        (err as Error).message,
      );
      return null;
    });
  if (reopened && !reopened.merged) await registerPr(ctx, reopened, "reopened");
}

/**
 * FORGED HALF OF `create_pr`: What happens after the job IS
 * PUSHED. PR already alive → informative no-op (the push updated it); PR
 * refused → reopening (product rule: we repeat the last PR of the ticket,
 * never a duplicate); otherwise → creation. A merged PR is never reused.
 *
 * SEPARATED FROM PUSH by MIN-224, and the cut falls in the right place: the repository lives
 * in the microVM, the forge and its token live in the function. The old
 * form pushes then calls this live; the new one pushes INTO the VM then
 * calls this by the control plane. A single implementation of the four cases
 * below, which are exactly the ones we don't want to diverge.
 */
export async function openPullRequestAfterPush(
  ctx: PrLandingContext,
  opts: {
    /** What `commitAndPush` returned — it is he who decides if there is material. */
    pushed: { pushed: boolean; remoteUpdated: boolean; headSha: string };
    /** Title requested by the model, already filled in by default if applicable. */
    prTitle: string;
    body?: string;
    /** Fresh target (token re-resolved by caller). */
    fresh: RepoCloneTarget;
    /** What we should tell the model about background jobs killed before indexing. */
    jobsNote: string;
    /** Called on first REAL push — saves the branch on the run line. */
    noteBranchPushed: (pushed: { pushed: boolean }) => Promise<void>;
  },
): Promise<{ result: unknown; success: boolean }> {
  const { forge, issue, workBranch, baseBranch, prState } = ctx;
  const { pushed, prTitle, body, fresh, jobsNote, noteBranchPushed } = opts;
  await assertPrLandingAuthority(ctx, fresh);
  const andJobs = (text: string) => (jobsNote ? `${text} ${jobsNote}` : text);
  // Nothing committed above the base: we stop BEFORE touching the repository
  // (MIN-123). Pushing would create an empty branch for nothing — and the forge
  // would refuse the PR (422) immediately afterwards, leaving it behind.
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
  await assertPrLandingAuthority(ctx, fresh);
  // `create_pr` on a PR that ALREADY exists: this push feeds it, it is traced
  // like the others. On a PR yet to be opened, `prState.number` is null and
  // nothing is traced — it is `registerPr` which will say “opened the PR”.
  await notePrCommits(ctx, pushed);
  if (prState.number != null) {
    await assertPrLandingAuthority(ctx, fresh);
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
      await assertPrLandingAuthority(ctx, fresh);
      const reopened = await forge
        .reopenPullRequest({
          token: fresh.token,
          repoFullName: fresh.repoFullName,
          number: prState.number,
        })
        .catch((err) => {
          console.error("[agent-execute] PR reopen failed:", (err as Error).message,
          );
          return null;
        });
      if (reopened) {
        await registerPr(ctx, reopened, "reopened");
        return {
          result: {
            number: reopened.number,
            url: reopened.url,
            note: andJobs("The rejected pull request was reopened with the new work.",
            ),
          },
          success: true,
        };
      }
    }
    // PR unreadable / reopening impossible (head branch deleted then
    // recreated by our push…) → we land on our own creation.
  }
  const prBody = `${body?.trim() || prTitle}\n\n---\n🤖 Généré par l'agent numo (minddy) · ${issue ? `issue ${issue.identifier}` : "note du carnet"}`;
  try {
    await assertPrLandingAuthority(ctx, fresh);
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
      result: { number: pr.number, url: pr.url, ...(jobsNote ? { note: jobsNote } : {}),
      },
      success: true,
    };
  } catch (err) {
    if (err instanceof PrLandingAuthorityError) throw err;
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
    return { result: { error: andJobs((err as Error).message) }, success: false,
    };
  }
}

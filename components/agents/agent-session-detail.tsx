"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, cn } from "mangue-ui";
import { ChevronLeft, GitPullRequest } from "lucide-react";
import { AgentConversation } from "@/components/agent/agent-conversation";
import { ProjectOrb } from "@/components/project-orb";
import { projectOrbSeed } from "@/lib/project-orb-colors";
import { PR_STATE_STYLES, PrStateBadge } from "@/components/pull-requests/pr-state-badge";
import { issueIdentifier } from "@/lib/issue-constants";
import { agentSessionTitle } from "@/lib/agent-session-title";
import { ChainStatusBar } from "@/components/automations/chain-status-bar";
import type { AgentRunSummary, AgentSessionListItem } from "@/lib/agent-api";
import type { AgentComposeIntent } from "@/lib/agent-compose-draft";

/**
 * Agent conversation detail panel (Agents page): a clean header
 * (mobile return · clickable title · “Open pull request” button) above
 * of the SAME conversation as the modal (`AgentConversation`, inline here).
 *
 * The pane opens THE run of the chosen line, and only it — a run is a
 * conversation. The header bears its title, preceded by the ticket ID
 * when there is one (`agentSessionTitle`, the same name as in the column);
 * clicking on it opens the ticket sidebar INLINE on the page (no
 * navigation to Kanban).
 *
 * Conversation WITHOUT TICKET (MIN-84, `issue` null): same section, title no
 * clickable (summary of its first message), anchored on `noteRunId`.
 */
export function AgentSessionDetail({
  item,
  onBack,
  onOpenIssue,
  compose = false,
  composeInitialText,
  composeIntent,
  onLaunched,
}: {
  item: AgentSessionListItem;
  onBack: () => void;
  /** Opens the linked issue in the side panel, above the page (no navigation). */
  onOpenIssue: (issueId: string, projectId: string) => void;
  /**
   * Opens the conversation in the COMPOSE phase (launch draft): compose
   * pre-written + model picker, without reopening the last run. `item` is then a
   * synthetic entry (no real run) — see the Agents page.
   */
  compose?: boolean;
  /** Pre-written prompt initiating the composition in composition (relayed to the conversation). */
  composeInitialText?: string;
  /**
   * What the entry point asked for: `plan` (framing) does not start the
   * ticket at launch, `implement` if. Relayed as is to the conversation.
   */
  composeIntent?: AgentComposeIntent;
  /** Relayed in the conversation: a new run has just been launched from the compound. */
  onLaunched?: (run: AgentRunSummary) => void;
}) {
  const t = useTranslations("Agents");
  const router = useRouter();

  // Safeguard: without attached project (abnormal RLS), nothing to display. One session
  // without ISSUE is legitimate: it is a notebook session.
  if (!item.project) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">{t("noSelection")}</p>
      </div>
    );
  }

  const issue = item.issue;
  const project = item.project;

  const backButton = (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={t("backToList")}
      className="md:hidden"
      onClick={onBack}
    >
      <ChevronLeft />
    </Button>
  );

  /**
   * The project orb opens the header of the THREE session forms (ticket, topic
   * free, PR proofreading). This is the question we ask ourselves when arriving at a
   * conversation — what deposit are we talking about? —, and it applies to all three. This
   * that it replaces (the session TYPE icon) is already read in the column, at
   * hovering over the line.
   */
  const projectOrb = (
    <ProjectOrb
      seed={projectOrbSeed(project)}
      iconUrl={project.icon_url}
      className="size-4 shrink-0"
    />
  );

  const closedState =
    item.pr_state === "merged" || item.pr_state === "closed" ? item.pr_state : null;

  const prActions =
    // In composition: no PR button (no run launched; legacy PR does not exist
    // once the first message has been sent). Otherwise, two cases depending on what the PR
    // still waiting:
    // • LIVE (open, draft) → the action, “see the pull request”;
    // • FINISHED (merged, closed) → its STATUS, in the badge of the Pull page
    // requests. There is nothing more to do about it, and an action button would lie
    // on what remains possible. The badge remains clickable — the PR can be consulted.
    //
    // It's the SAME badge as elsewhere (`PrStateBadge`), in GitHub colors:
    // merged purple, closed red. This header painted its own version.
    compose || item.pr_number == null ? undefined : closedState ? (
      <button
        type="button"
        onClick={() => router.push(`/pull-requests?run=${item.runId}`)}
        className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <PrStateBadge state={closedState} icon />
      </button>
    ) : (
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => router.push(`/pull-requests?run=${item.runId}`)}
        className={cn(item.pr_state === "open" && PR_STATE_STYLES.open)}
      >
        <GitPullRequest className="size-3.5" />
        {t("openPullRequest")}
      </Button>
    );

  // ── REVIEW Session (MIN-168): ONE run conversation, header = PR ──
  // Same aspect as a notebook session — the run IS the session, there is no
  // lineage to go through —, with the badge and the link of the reread pull request. There
  // conversational resumption therefore goes through the same path (`noteRunId` +
  // /steer): replying here posts a new comment on the PR.
  const reviewed = item.pullRequest;
  if (!issue && reviewed) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <AgentConversation
          key={item.runId}
          noteRunId={item.runId}
          projectId={project.id}
          active
          headerTitle={
            <div className="flex min-w-0 flex-1 items-center gap-2">
              {backButton}
              {projectOrb}
              <span className="truncate text-sm font-medium">
                {reviewed.title?.trim() || `#${reviewed.number}`}
              </span>
            </div>
          }
          headerActions={
            // Towards the PR IN minddy (`?pr=`), like everywhere else — the map,
            // the ticket panel, the header of a code session. This button
            // left for the forge: the only one in the app to come out of minddy for
            // show a pull request that we know how to display.
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => router.push(`/pull-requests?pr=${reviewed.id}`)}
            >
              <GitPullRequest className="size-3.5" />
              {t("openPullRequest")}
            </Button>
          }
        />
      </div>
    );
  }

  // ── Session WITHOUT TICKET: conversation about ONE run, header = its subject ───────
  if (!issue) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <AgentConversation
          key={item.runId}
          noteRunId={item.runId}
          projectId={project.id}
          active
          headerTitle={
            <div className="flex min-w-0 flex-1 items-center gap-2">
              {backButton}
              {projectOrb}
              <span className="truncate text-sm font-medium">
                {agentSessionTitle(item, t("freeSessionTitle"))}
              </span>
            </div>
          }
          headerActions={prActions}
        />
      </div>
    );
  }

  const identifier = issueIdentifier(project.key, issue.number);

  const headerTitle = (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      {backButton}
      {projectOrb}
      {/* The SAME name as in the column — “MIN-42: Fix redirection”.
 Clickable → opens the ticket sidebar inline on the page. */}
      <button
        type="button"
        onClick={() => onOpenIssue(issue.id, project.id)}
        className="truncate text-left text-sm font-medium outline-none hover:underline focus-visible:underline"
      >
        {agentSessionTitle(item, t("freeSessionTitle"))}
      </button>
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* The ticket automation chain (MIN-147): it was SHE who launched
 the session we are watching, and it is from here that we continue or stop it —
 without having to go back through the ticket panel. */}
      <div className="shrink-0 px-4 pt-3 empty:hidden">
        <ChainStatusBar issueId={issue.id} />
      </div>
      <AgentConversation
        key={item.runId}
        issueId={issue.id}
        issueIdentifier={identifier}
        projectId={project.id}
        // THE run of the line, and nothing else: he is the conversation we have
        // chosen. Previously we allowed the conversation to resolve itself “the
        // most active ticket" (`initialRunId=null`), because the line
        // designated a TICKET and not an exchange; open something else today
        // that the clicked line would be a lie. The `issueId` anchor remains:
        // it is from him that the lineage comes (a past run is not
        // resumable), branches and the launch of a new run.
        // In COMPOSE (launch draft), `initialCompose` forces it to be composed
        // blank no matter what — the run doesn't exist yet.
        initialRunId={compose ? null : item.runId}
        initialCompose={compose}
        initialComposeText={compose ? composeInitialText : undefined}
        composeIntent={compose ? composeIntent : undefined}
        onLaunched={onLaunched}
        active
        headerTitle={headerTitle}
        headerActions={prActions}
      />
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Skeleton,
  Spinner,
  cn,
  toast,
} from "mangue-ui";
import { Bot, Pencil, Pin, PinOff, Plus, Trash2 } from "lucide-react";
import {
  IssueContextMenu,
  type ContextMenuAction,
} from "@/components/issue-context-menu";
import { EmptyScene } from "@/components/empty-scene";
import { FormDialog } from "@/components/form-dialog";
import { agentSessionStatusKey } from "@/components/agents/agent-session-status";
import { SecondarySidebar } from "@/components/secondary-sidebar";
import {
  PROJECT_GROUP_INDENT,
  PROJECT_GROUP_LIMIT,
  SidebarProjectGroup,
  groupByProject,
  toggledSet,
  type ProjectGroup,
} from "@/components/sidebar-project-group";
import { matchesFilter } from "@/components/sidebar-filter-field";
import { useAgentSessionsQuery } from "@/lib/use-agent-runs";
import { useProjects } from "@/lib/projects-context";
import { useGitLinkedProjectsQuery } from "@/lib/use-project-git-link-query";
import { useAgentReads } from "@/lib/use-agent-reads";
import { useAssistantContext } from "@/lib/assistant-panel-context";
import { usePublishCurrentView } from "@/lib/current-view-context";
import { issueIdentifier } from "@/lib/issue-constants";
import {
  FREE_COMPOSE_PARAM,
  setAgentComposeDraft,
  useAgentComposeDraft,
} from "@/lib/agent-compose-draft";
import {
  deleteAgentRunApi,
  isAgentSessionUnread,
  renameAgentRunApi,
  setAgentConversationPinnedApi,
  type AgentRunSummary,
  type AgentSessionListItem,
} from "@/lib/agent-api";
import { agentSessionTitle } from "@/lib/agent-session-title";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

function DetailLoading() {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-4 p-4">
      <Skeleton className="h-9 w-full rounded-lg" />
      <Skeleton className="min-h-0 flex-1 rounded-xl" />
    </div>
  );
}

const AgentSessionDetail = dynamic(
  () =>
    import("@/components/agents/agent-session-detail").then(
      (m) => m.AgentSessionDetail,
    ),
  { ssr: false, loading: DetailLoading },
);

const SessionCompose = dynamic(
  () => import("@/components/agents/session-compose").then((m) => m.SessionCompose),
  { ssr: false, loading: DetailLoading },
);

const PrIssuePanel = dynamic(
  () =>
    import("@/components/pull-requests/pr-issue-panel").then(
      (m) => m.PrIssuePanel,
    ),
  { ssr: false },
);

/**
 * True as soon as the detail pane is rendered by the layout (breakpoint md = 768px, the
 * pane changes to `md:flex`). Used to know if the SELECTED conversation is
 * actually displayed (desktop) or only preselected behind the list
 * (mobile). Only read in an effect → no concern for hydration (value `false`
 * at the 1st server/client rendering, corrected just after).
 */
function useIsWideViewport(): boolean {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const sync = () => setWide(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return wide;
}

/**
 * Key to a conversation in the list: ITS RUN, always. The successive runs
 * of a ticket once shared the key to the outcome and were placed under a
 * same line, behind a selector; these are now separate conversations
 * entire, distinguished on the screen by their title and ticket ID.
 */
function sessionKey(s: AgentSessionListItem): string {
  return s.conversationId;
}

const PINNED_GROUP_KEY = "__pinned__";

type SessionGroup = ProjectGroup<AgentSessionListItem>;

/**
 * A conversation in the list: ITS TITLE, on one line, and nothing else —
 * at most a pin, a dot or a spinner at the end of the line, for what does not
 * cannot wait for the hover (the agent is working, he is finished, he is waiting for a
 * answer).
 *
 * Everything else — what the conversation is about (ticket, open topic, proofreading
 * of PR), its exact state, its date, its project — lives in the TOOLTIP. A column
 * navigation can be looked at: four pieces of information per line, it’s
 * four times longer to sweep, for three that we weren't looking for.
 */
function SessionRow({
  session,
  selected,
  unread,
  awaiting,
  dateLabel,
  onSelect,
  onRename,
  onTogglePinned,
  onDelete,
}: {
  session: AgentSessionListItem;
  selected: boolean;
  unread: boolean;
  /** Unread AND question asked: the dot turns yellow. */
  awaiting: boolean;
  dateLabel: string;
  onSelect: () => void;
  onRename: () => void;
  onTogglePinned: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("Agents");
  // Right click: the position of the pointer, or `null` when the menu is closed.
  // Same assembly as the Pages tree (components/pages/page-tree.tsx).
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
  // “MIN-42: Fix redirection” for a ticket conversation, the only
  // title for others. See `agentSessionTitle`.
  const title = agentSessionTitle(session, t("freeSessionTitle"));
  // What the conversation is about: the TICKET, “Free subject” or “Analysis of
  // PR” — the same question, three possible answers. The ticket is said here by
  // its entire title, and no longer by its identifier: this is passed
  // in front of the line title, and repeating it on hover would not teach anything.
  const anchor = session.issue
    ? session.issue.title
    : session.pullRequest
      ? t("prBadge")
      : t("freeBadge");

  /**
   * Things you do to a conversation without opening it: rename it,
   * pin it and delete it. Written once, like everywhere else in
   * the app — that's the meaning of `ContextMenuAction[]` rather than
   * `<DropdownMenuItem>` copied.
   */
  const actions: ContextMenuAction[] = [
    {
      id: "rename",
      label: t("renameSession"),
      icon: <Pencil className="size-4" />,
      onSelect: onRename,
    },
    {
      id: "pin",
      label: session.pinned ? t("unpinSession") : t("pinSession"),
      icon: session.pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />,
      onSelect: onTogglePinned,
    },
    {
      id: "delete",
      label: t("deleteSession"),
      icon: <Trash2 className="size-4" />,
      variant: "destructive",
      separatorBefore: true,
      onSelect: onDelete,
    },
  ];

  return (
    <>
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onSelect}
          // Right-clicking opens the row menu, wherever it lands on it. Aim
          // a “⋯” would require hovering over the line to make it appear,
          // then reach a square of 24 px — and the line, here, has no
          // deliberately nothing other than its title.
          onContextMenu={(event) => {
            event.preventDefault();
            setMenuPosition({ x: event.clientX, y: event.clientY });
          }}
          className={cn(
            "flex items-center gap-2 rounded-md py-1.5 pr-2 text-left outline-none transition-colors",
            // Aligned with the NAME of the project, one level higher.
            PROJECT_GROUP_INDENT,
            selected ? "bg-muted" : "hover:bg-muted/60 focus-visible:bg-muted/60",
          )}
        >
          <span className="min-w-0 flex-1 truncate text-sm">{title}</span>
          {session.pinned ? (
            <Pin
              className="size-3 shrink-0 text-muted-foreground"
              aria-label={t("unpinSession")}
            />
          ) : null}
          {session.working ? (
            <Spinner className="size-3 shrink-0 text-muted-foreground" />
          ) : unread ? (
            <span
              className={cn(
                "size-2 shrink-0 rounded-full",
                awaiting ? "bg-yellow-500" : "bg-blue-500",
              )}
              aria-label={awaiting ? t("awaitingAnswer") : t("unread")}
            />
          ) : null}
        </button>
      </TooltipTrigger>
      {/* The tooltip carries what the line stopped saying. `text-left`: the
 default centering is done for one word, not for four lines. */}
      <TooltipContent side="right" className="max-w-[260px] text-left">
        <p className="font-medium">{title}</p>
        <p className="mt-1 text-background/70">
          {anchor} · {t(agentSessionStatusKey(session))} · {dateLabel}
        </p>
        {session.project ? (
          <p className="text-background/70">{session.project.name}</p>
        ) : null}
      </TooltipContent>
    </Tooltip>
    {/* The menu, anchored to the pointer, OUT of the line: it places an invisible anchor
 in `position: fixed` at the click coordinates, and keeping it in
 would distort the tooltip hover rectangle. */}
    <IssueContextMenu
      position={menuPosition}
      onClose={() => setMenuPosition(null)}
      actions={actions}
      searchable={false}
    />
    </>
  );
}

/**
 * A PROJECT in the list, and its conversations under it — the accordion is
 * the scale on which we are looking: we know what project we were talking to the agent about
 * long before remembering the exact title of the conversation.
 *
 * The header bears the project orb and its name. Folded, it also carries what is
 * goes under (spinner, unread point): folding a project should not
 * disappear an expected response. On hover appears a “+” — the same
 * blank conversation as the column button, but with THIS project already
 * chosen: we are reading what we told him, this is the moment when we
 * knows which depot we want to go back to.
 *
 * The five most recent conversations, then “Show more”. Fold it
 * project resets the counter to five — it's the way back, without a second
 * button to add.
 */
function SessionGroupRows({
  group,
  open,
  showAll,
  collapsible,
  canLaunch,
  selectedKey,
  reads,
  fmtDay,
  onToggle,
  onShowAll,
  onSelect,
  onNewSession,
  onRename,
  onDelete,
  onTogglePinned,
  fallbackLabel,
  headerIcon,
}: {
  group: SessionGroup;
  open: boolean;
  showAll: boolean;
  collapsible: boolean;
  /**
   * Does the project have a linked DEPOSIT? Without it, the agent has nothing to clone: ​​the
   * “+” does not apply. Past conversations remain (the
   * deposit could have been untied afterwards).
   */
  canLaunch: boolean;
  selectedKey: string | null;
  reads: Record<string, string>;
  fmtDay: (at: string) => string;
  onToggle: () => void;
  onShowAll: () => void;
  onSelect: (key: string) => void;
  /** “+” from hover: blank conversation, this project already chosen. */
  onNewSession: () => void;
  /** Right click on a line: rename / delete this conversation. */
  onRename: (session: AgentSessionListItem) => void;
  onTogglePinned: (session: AgentSessionListItem) => void;
  onDelete: (session: AgentSessionListItem) => void;
  fallbackLabel?: string;
  headerIcon?: ReactNode;
}) {
  const t = useTranslations("Agents");
  // “Show more” and “No project” are those of the accordion, shared with
  // the pull requests column: a single pair of words for a single gesture.
  const tCommon = useTranslations("Common");
  const sessions = group.items;

  // The OPEN conversation remains visible: if it is beyond the five
  // first, the cup goes down to it rather than hiding it.
  const selectedIndex = sessions.findIndex((s) => sessionKey(s) === selectedKey);
  const shown = showAll
    ? sessions
    : sessions.slice(0, Math.max(PROJECT_GROUP_LIMIT, selectedIndex + 1));

  const working = sessions.some((s) => s.working);
  const unreadSessions = sessions.filter((s) => isAgentSessionUnread(s, reads));
  const awaiting = unreadSessions.some((s) => s.awaitingInput);

  return (
    <SidebarProjectGroup
      project={group.project}
      fallbackLabel={fallbackLabel ?? tCommon("noProjectGroup")}
      headerIcon={headerIcon}
      open={open}
      collapsible={collapsible}
      onToggle={onToggle}
      hiddenCount={sessions.length - shown.length}
      onShowAll={onShowAll}
      showMoreLabel={tCommon("showMore")}
      collapsedBadge={
        working ? (
          <Spinner className="size-3 shrink-0 text-muted-foreground" />
        ) : unreadSessions.length > 0 ? (
          <span
            className={cn(
              "size-2 shrink-0 rounded-full",
              awaiting ? "bg-yellow-500" : "bg-blue-500",
            )}
            aria-label={awaiting ? t("awaitingAnswer") : t("unread")}
          />
        ) : null
      }
      actions={
        /* Without a joint project, nothing to pre-choose; without linked deposit, nothing to launch:
 in both cases the shortcut does not exist. */
        group.project && canLaunch ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={onNewSession}
                aria-label={t("newInProject", { project: group.project.name })}
                // Invisible, it does not click: on the finger, where there is no
                // hover, the right edge of a header would otherwise open a
                // conversation without anything announcing it.
                className="pointer-events-none size-6 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/project:pointer-events-auto group-hover/project:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100"
              >
                <Plus className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {t("newInProject", { project: group.project.name })}
            </TooltipContent>
          </Tooltip>
        ) : null
      }
    >
      {shown.map((s) => {
        const key = sessionKey(s);
        const unread = isAgentSessionUnread(s, reads);
        return (
          <SessionRow
            key={key}
            session={s}
            selected={key === selectedKey}
            unread={unread}
            awaiting={unread && s.awaitingInput}
            dateLabel={fmtDay(s.updated_at)}
            onSelect={() => onSelect(key)}
            onRename={() => onRename(s)}
            onTogglePinned={() => onTogglePinned(s)}
            onDelete={() => onDelete(s)}
          />
        );
      })}
    </SidebarProjectGroup>
  );
}

/**
 * “New” button in the column: it OPENS a blank conversation, it does not
 * ask for nothing first. There is no more menu here — launch the agent ON A TICKET
 * is done from the ticket itself (card or panel), where we know which
 * ticket we're talking. This screen is only used for the free subject, and the conversation
 * blank is already the default view: the button therefore only does the
 * ASK AGAIN, at nine, when we have gone to read a conversation.
 */
function NewSessionButton({ onClick }: { onClick: () => void }) {
  const t = useTranslations("Agents");
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* `-mr-2` compensates for the padding of the button: the icon then aligns with the
 right edge of the list lines, not 8 px below. */}
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={onClick}
          className="-mr-2 text-muted-foreground hover:text-foreground"
          aria-label={t("newButton")}
        >
          <Plus className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{t("newButton")}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Rename a conversation: one field, one button. The initial title is the one that
 * the DISPLAY line — ticket identifier included (`agentSessionTitle`): on
 * rename what we have in front of us, not a column of which we cannot see half
 * only afterwards.
 *
 * An EMPTY field is a valid sending (the button remains active): this is how we
 * delete a title to return to that of the ticket.
 */
function SessionNameDialog({
  session,
  onOpenChange,
  onSubmit,
}: {
  /** The conversation to rename — `null` closes the dialog. */
  session: AgentSessionListItem | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (name: string) => Promise<void>;
}) {
  const t = useTranslations("Agents");
  const tCommon = useTranslations("Common");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  // Start from the current title each time you open: the dialog is controlled from the
  // parent (placing the target is enough to open), so Radix does not call
  // `onOpenChange` and the field would remain on the title of the conversation from before.
  useEffect(() => {
    if (!session) return;
    setName(agentSessionTitle(session, t("freeSessionTitle")));
  }, [session, t]);

  return (
    <FormDialog
      open={!!session}
      onOpenChange={onOpenChange}
      title={t("renameSessionTitle")}
      className="sm:max-w-sm"
      submitLabel={tCommon("save")}
      cancelLabel={tCommon("cancel")}
      submitting={busy}
      onSubmit={async () => {
        setBusy(true);
        try {
          await onSubmit(name.trim());
          onOpenChange(false);
        } catch (err) {
          toast.error((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
      dictation={{
        onTranscription: (text) => setName((value) => `${value}${value ? " " : ""}${text}`),
        disabled: busy,
      }}
    >
      <Input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t("sessionNamePlaceholder")}
      />
    </FormDialog>
  );
}

/**
 * Agents page — list/detail view: left ALL agent conversations
 * Numo (all projects accessible, without filter), on the right the inline conversation
 * (`AgentSessionDetail` → `AgentConversation`, the same core as the modal).
 *
 * **ONE CONVERSATION = ONE RUN**, ticket or not. The successive runs of a ticket
 * were gathered under a single line, the previous ones stored behind a selector
 * in the middle of the header: we only saw one conversation per ticket, and the
 * others only existed for those who thought of unfolding this menu. Each now has
 * its line, under its own title - the one that the titler writes at launch,
 * preceded by the ticket identifier (`agentSessionTitle`). The conversation
 * selected is published in the context of Numo when it has an issue.
 *
 * The column is one ACCORDION per project (`ProjectGroup`), five conversations per
 * project then “Show more”, and each line is reduced to its title
 * (`SessionRow`) — the rest waits for hover. Two ways to find a
 * conversation, and only one at a time: browse the projects, or filter (the
 * filter unfolds everything and lifts the cup of five).
 *
 * **The default view is a BLANK CONVERSATION** (`SessionCompose`), not the
 * last session: arriving here means wanting to speak to the agent, not rereading this
 * that we already told him. A conversation is read by choosing it from the list.
 * This is the `FREE_COMPOSE_PARAM` selection key — it does not designate any session
 * real, and the list shows NOTHING for her: a conversation does not enter into the
 * column only when it really exists, that is to say at the first message sent.
 *
 * “Launch Agent” entry points:
 * • OUTCOME (MIN-46): the ticket button (card or panel) places a DRAFT
 * (`useAgentComposeDraft`, kind "issue") and navigate here with `?compose=<issueId>`.
 * This is the ONLY path to a conversation anchored to a ticket — the page, it,
 * no longer offers a ticket selector.
 * • FREE SUBJECT: the “New” button on this page (blank conversation, without
 * draft), the NOTEBOOK (MIN-84) and the integration wizards, which pose a
 * draft kind "free" with pre-written text and navigate with `?compose=new`.
 * The pane opens the launch composer (`SessionCompose`: project + model +
 *    raisonnement + branche).
 * Purely optimistic in both cases: if the user does not send the 1st
 * message, nothing existed; as soon as he sends it, the actual run takes over in
 * the same section and appears in the list.
 */
export function AgentsPage() {
  const t = useTranslations("Agents");
  const tProjects = useTranslations("Projects");
  const tCommon = useTranslations("Common");
  const format = useFormatter();
  const router = useRouter();
  const { projects, openCreateProject, loading: projectsLoading } = useProjects();
  const { sessions, loading, refetch } = useAgentSessionsQuery();
  // Projects where the agent can work (linked repository) — only they carry the
  // “+” in their header. Same request as dial, so only one call.
  const { projectIds: gitLinked } = useGitLinkedProjectsQuery();
  const { reads, markRead } = useAgentReads();
  const isWide = useIsWideViewport();

  // Deep-link (“Open agent” from elsewhere): ?run=<runId> opens THIS
  // conversation ; ?issue=<issueId> opens the most recent ticket (it is no longer
  // the key to no conversation — cf. `sessionForKey`); ?compose=<issueId>
  // opens it as a launch draft; ?compose=new the draft WITHOUT a ticket.
  const searchParams = useSearchParams();
  const issueParam = searchParams.get("issue");
  const runParam = searchParams.get("run");
  const composeParam = searchParams.get("compose");

  const draft = useAgentComposeDraft();
  // The draft is only honored if the URL indicates it AGAIN: a navigation to
  // /agents without `?compose=` (return later) ignores it, even if it is lying around in memory.
  const draftHonored =
    !!draft &&
    (draft.kind === "issue"
      ? composeParam === draft.issueId
      : composeParam === FREE_COMPOSE_PARAM);
  const issueDraft = draftHonored && draft?.kind === "issue" ? draft : null;
  // Draft WITHOUT a ticket: it only PRE-WRITE the blank conversation (a
  // note in the notebook, an integration prompt). The “New” button does not pose any problems
  // none — a blank conversation has nothing to pre-write.
  const freeDraft = draftHonored && draft?.kind === "free" ? draft : null;

  // Current selection. `FREE_COMPOSE_PARAM` is not the key to ANY session: it is
  // the blank conversation, and that's where we arrive by default.
  const [selectedKey, setSelectedKey] = useState<string | null>(
    composeParam ?? issueParam ?? runParam ?? FREE_COMPOSE_PARAM,
  );
  const [mobileDetail, setMobileDetail] = useState(
    !!composeParam || !!issueParam || !!runParam,
  );
  // Related issue open in side panel (on top of page, no navigation).
  const [panel, setPanel] = useState<{ projectId: string; issueId: string } | null>(null);
  // Id of the run just launched from the composer: we keep the shutter mounted
  // (same key → no remount, transition compose → live smooth) until the
  // list of sessions catches up with this specific run.
  const [launchedRunId, setLaunchedRunId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  // Targets of the context menu of the list: the conversation that we rename, the one
  // which we are about to delete. `null` = the corresponding dialog is closed.
  const [renameTarget, setRenameTarget] = useState<AgentSessionListItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AgentSessionListItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  // Go back to composing it NEW with each “New” (and with each pre-written text
  // received): without this, a message typed and then abandoned would drag on in the conversation
  // next “virgin” — which would no longer be.
  const [composeNonce, setComposeNonce] = useState(0);
  // Pre-chosen draft of the next blank conversation, when it is open
  // from the header of a project. `null` = the composer chooses his default.
  const [newSessionProjectId, setNewSessionProjectId] = useState<string | null>(null);
  // Accordion of the list: FOLDED projects (everything is unfolded by default - we
  // arrives to see, not to open) and those from whom we have asked all the
  // conversations. Two sets, the absence being worth the current case.
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [expandedGroups, setExpandedGroups] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  /** Folds/unfolds a project. Folding it back resets his list to his top five. */
  const toggleGroup = (key: string) => {
    const wasOpen = !collapsedGroups.has(key);
    setCollapsedGroups((prev) => toggledSet(prev, key));
    if (wasOpen && expandedGroups.has(key)) {
      setExpandedGroups((prev) => toggledSet(prev, key));
    }
  };

  // Draft selection key: the intended issue (kind “issue”) or the draft marker
  // the blank conversation (kind "free" — no run, therefore no real key).
  const draftKey = issueDraft ? issueDraft.issueId : freeDraft ? FREE_COMPOSE_PARAM : null;

  // The REAL draft of the draft, found in the context: the draft does not
  // carries only the id and the key of the project, but the header of the conversation paints its
  // ORB — without `icon_url`, it displayed the generated orb where the project has a
  // real icon, then switched to the correct one at the first message sent.
  const draftProject = issueDraft
    ? projects.find((p) => p.id === issueDraft.projectId) ?? null
    : null;

  // Synthetic entry of the ISSUE draft, shaped like a real session for
  // cross the same detail pane (`AgentSessionDetail`). No real run:
  // `runId` is a marker, the pane opens in compose and the conversation handles the
  // live passage. (The TICKET-FREE draft has its own section, `SessionCompose`.)
  const draftItem: AgentSessionListItem | null = issueDraft
    ? {
        conversationId: `draft:${issueDraft.issueId}`,
        runId: `draft:${issueDraft.issueId}`,
        status: "queued",
        model: null,
        triggered_by: "button",
        // No title: the draft has no run yet, so nothing has been generated.
        // Its component is therefore called “MIN-42: <ticket title>”, while the
        // premier message parte.
        title: null,
        pullRequest: null,
        pr_number: null,
        pr_url: null,
        pr_state: null,
        created_at: "",
        updated_at: "",
        issue: {
          id: issueDraft.issueId,
          number: issueDraft.issueNumber,
          title: issueDraft.issueTitle,
        },
        // The draft does not appear in the list, but its detail section does.
        // carries the project orb: it therefore comes from the REAL project (name and icon),
        // and not just the scraps that the draft carries.
        project: {
          id: issueDraft.projectId,
          key: issueDraft.projectKey,
          name: draftProject?.name ?? issueDraft.projectKey,
          icon_url: draftProject?.icon_url ?? null,
          orb_seed: draftProject?.orb_seed ?? null,
        },
        working: false,
        pinned: false,
        lastCompletedAt: null,
        awaitingInput: false,
      }
    : null;

  // Has the list caught up with the run we just launched? Just one question
  // for both forms: the session of a ticket takes this run for
  // rep, a ticketless session IS this run.
  const launchedItem = launchedRunId
    ? sessions.find((s) => s.runId === launchedRunId) ?? null
    : null;

  // LAUNCH flaps — no runs yet. They hold until the run
  // launched appears in the list, where the real session takes over.
  const issueComposeSelected =
    !!issueDraft && selectedKey === issueDraft.issueId && !launchedItem;
  // The blank conversation: the default view, what “New” reopens, and what
  // that the notebook and the wizards pre-write.
  const freeComposeActive = selectedKey === FREE_COMPOSE_PARAM && !launchedItem;
  const composeSelected = issueComposeSelected || freeComposeActive;

  // Tracks param changes (client navigation to another entry).
  useEffect(() => {
    if (!composeParam) return;
    setSelectedKey(composeParam);
    setMobileDetail(true);
  }, [composeParam]);
  useEffect(() => {
    if (!issueParam) return;
    setSelectedKey(issueParam);
    setMobileDetail(true);
  }, [issueParam]);
  useEffect(() => {
    if (!runParam) return;
    setSelectedKey(runParam);
    setMobileDetail(true);
  }, [runParam]);
  // A POSTED draft opens its pane, even if the URL does not move:
  // `router.push` to the CURRENT address is inert, so the params effects
  // above do not play again. This is exactly the case of a second note thrown
  // from the notebook (`?compose=new` already in the bar) — the draft existed
  // fine, but the selection had remained on open conversation in the meantime.
  // The selection therefore follows the draft, not just the parameter. Compose it
  // is reworked so that the pre-written text replaces the previous one.
  useEffect(() => {
    if (!draftKey) return;
    setSelectedKey(draftKey);
    setMobileDetail(true);
    setComposeNonce((n) => n + 1);
    // The draft itself says its project (or lets you choose): the pre-choice
    // of a previous “+” no longer has a say.
    setNewSessionProjectId(null);
  }, [draft, draftKey]);

  // Transition completed: the run launched appears in the list → we delete the
  // draft and we select its session — its REAL key (the outcome for a
  // ticket session, the run otherwise), read on the entry that we have just caught
  // rather than guessed again here. We also clean `?compose=` from the URL.
  useEffect(() => {
    if (!launchedItem) return;
    setSelectedKey(sessionKey(launchedItem));
    setLaunchedRunId(null);
    setAgentComposeDraft(null);
    if (composeParam || issueParam || runParam) router.replace("/agents");
  }, [launchedItem?.runId]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * The conversation designated by a selection key. It's a run (the case
   * current: a line in the list, `?run=`) — but a deep-link can also
   * designate a TICKET (`?issue=`, from a card or a pull request), which
   * is no longer the key to any conversation since a run is worth a
   * conversation. We then open the most RECENT ticket: the list arrives
   * sorted by decreasing creation date, so it is the first one found.
   */
  const sessionForKey = (key: string | null): AgentSessionListItem | null =>
    key
      ? sessions.find((s) => s.runId === key) ??
        sessions.find((s) => s.conversationId === key) ??
        sessions.find((s) => s.issue?.id === key) ??
        null
      : null;

  // Item displayed on the right. The run just launched passes IN FRONT of the selection:
  // she has just been caught up by the list and the effect above has not yet
  // moved `selectedKey` — otherwise, the pane would flash “no selection” on
  // time of an image, just after sending the first message.
  const realSelected = launchedItem ?? sessionForKey(selectedKey);
  const activeItem = issueComposeSelected ? draftItem : realSelected;

  // The DISPLAYED conversation never has a bubble: it is marked read when it is opened AND
  // at each new end of run as long as it remains visible (dependence on
  // `lastCompletedAt`). “Visible” = desktop (the pane is always rendered) or, on
  // mobile, the detail pane open; otherwise (mobile list or compose) we do not score,
  // so as not to erase the bubble of a session that we are not watching. The sessions
  // WITHOUT TICKET have no read/unread tracking (personal, no issue to anchor).
  const shownReal = !composeSelected && (isWide || mobileDetail) ? realSelected : null;
  useEffect(() => {
    const id = shownReal?.conversationId;
    if (id) markRead(id);
  }, [shownReal?.conversationId, shownReal?.lastCompletedAt, markRead]);

  /**
   * Publishes the active issue to Numo: it resolves “this issue” (and its PR in the case
   * appropriate), reads it and can act on it — draft included (issue without PR).
   *
   * The routines page carries its own helper context; here, only the
   * visible conversation publishes its ticket.
   */
  useAssistantContext(
    activeItem && activeItem.project && activeItem.issue
      ? {
          projectId: activeItem.project.id,
          issueId: activeItem.issue.id,
          issueIdentifier: issueIdentifier(activeItem.project.key, activeItem.issue.number),
          issueTitle: activeItem.issue.title,
          ...(activeItem.pr_number != null
            ? {
                prNumber: activeItem.pr_number,
                prState: activeItem.pr_state ?? undefined,
                prRunId: activeItem.runId,
              }
            : {}),
        }
      : null,
  );

  // “Save current view” (⌘K). This page voluntarily CLEANS its
  // address as soon as a line is chosen (see `selectReal`: push the address
  // current would be inert, the next navigation to the same conversation will not
  // would do nothing anymore) — the URL therefore never says what we are looking at. She
  // publishes here, with the parameters which can restore it: `?run=` for a
  // conversation. Compose it blank
  // is not the sight of anything: we then retain the bare page.
  usePublishCurrentView(
    realSelected && !composeSelected
        ? {
            href: `/agents?run=${encodeURIComponent(realSelected.conversationId)}`,
            label: agentSessionTitle(realSelected, t("freeSessionTitle")),
          }
        : { href: "/agents", label: t("title") }
  );

  // Keeps a valid selection: when the selected session disappears (or a
  // deep-link designates a session which no longer exists), we return to the conversation
  // blank — never on ANOTHER conversation, that we didn't ask to read. We don't
  // touches nothing during a compose (no session to validate) nor as long as the list
  // has not arrived (loading / deep-link preselection).
  useEffect(() => {
    if (composeSelected || launchedRunId) return;
    if (sessions.length === 0) return;
    const resolved = sessionForKey(selectedKey);
    if (!resolved) {
      setSelectedKey(FREE_COMPOSE_PARAM);
      return;
    }
    // Deep-link by TICKET (`?issue=`): the selection retains the CONVERSATION
    // that he opened, not the ticket — otherwise no line is highlighted, and the
    // part would follow a ticket whose conversations are no longer one.
    if (resolved.conversationId !== selectedKey) setSelectedKey(resolved.conversationId);
  }, [sessions, selectedKey, composeSelected, launchedRunId]);

  // Select a REAL session: abandon the current draft (never sent →
  // deleted, such as leaving the page). Purely UI, no run existed.
  const selectReal = (key: string) => {
    if (draft) setAgentComposeDraft(null);
    setLaunchedRunId(null);
    setSelectedKey(key);
    setMobileDetail(true);
    // The URL stops pointing to the entry you just left. She would lie to
    // reloading, and above all it would make the following navigation towards
    // this same entry: pushing the current address changes nothing.
    if (composeParam || issueParam || runParam) router.replace("/agents");
  };

  // “New”: a blank conversation, right away — same gesture as arriving
  // on the page. Any draft currently in progress is abandoned (never sent)
  // and compose it from scratch, text included. Launched from the header of a
  // project, she leaves with this project already chosen (composing it allows it to change).
  const startNewSession = (projectId?: string) => {
    if (draft) setAgentComposeDraft(null);
    setLaunchedRunId(null);
    setNewSessionProjectId(projectId ?? null);
    setSelectedKey(FREE_COMPOSE_PARAM);
    setMobileDetail(true);
    setComposeNonce((n) => n + 1);
    if (composeParam || issueParam || runParam) router.replace("/agents");
  };

  /**
   * Rename: we write `agent_runs.title`, the first step of the waterfall
   * display — the name changes at the same time in the list and in the header of the
   * pane (see `agentSessionTitle`). An empty title erases its own and the
   * The conversation returns to the title of his ticket: it's the way back.
   */
  const renameSession = async (session: AgentSessionListItem, title: string) => {
    await renameAgentRunApi(session.runId, title);
    await refetch();
  };

  /** Pin a conversation for this account, then move it back to the top of the list. */
  const togglePinnedSession = async (session: AgentSessionListItem) => {
    try {
      await setAgentConversationPinnedApi(session.runId, !session.pinned);
      await refetch();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  /**
   * Delete, for good: `agent_run_events` and `agent_run_messages` are leaving
   * cascade, and the server first shuts down the microVM. If this is the conversation
   * OPEN which disappears, we fall back on the blank conversation rather than
   * leave a ghost shutter — the guard effect would do it too, an image more
   * late, and this image is visible.
   */
  const deleteSession = async (session: AgentSessionListItem) => {
    setDeleting(true);
    try {
      await deleteAgentRunApi(session.runId);
      if (selectedKey === session.conversationId) setSelectedKey(FREE_COMPOSE_PARAM);
      setDeleteTarget(null);
      await refetch();
      toast.success(t("sessionDeleted"));
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setDeleting(false);
    }
  };

  const fmtDay = (at: string): string =>
    format.dateTime(new Date(at), { day: "numeric", month: "short" });

  /**
   * What the column DISPLAYS. The text filter does NOT touch `sessions`, which
   * carries the selection and the guard effect: otherwise typing three letters would
   * skip open conversation, once per letter.
   *
   * A session is sought by its anchor (the ticket, the subject) or by its
   * project — this is what the line displays.
   */
  const visibleSessions = useMemo(() => {
    if (!query.trim()) return sessions;
    return sessions.filter((s) =>
      matchesFilter(query, [
        s.title,
        s.issue?.title,
        s.project?.name,
        s.pullRequest?.title,
        s.issue && s.project ? issueIdentifier(s.project.key, s.issue.number) : null,
      ]),
    );
  }, [sessions, query]);

  const listCount = visibleSessions.length;
  const pinnedSessions = useMemo(
    () => visibleSessions.filter((session) => session.pinned),
    [visibleSessions],
  );
  const groups = useMemo(
    () => groupByProject(visibleSessions.filter((session) => !session.pinned), (s) => s.project),
    [visibleSessions],
  );
  // A filter in progress UNFOLDS everything and lifts the cup of five: searching is
  // ask to see what fits, not to know where it is stored.
  const filtering = query.trim().length > 0;

  /* NO PROJECT: the blank conversation leads nowhere — the free subject
 itself requests a project whose agent clones the repository. This is a project that needs to be done first, and this screen says just that. Projects without any session, in
 on the other hand, keep the normal view: the blank conversation is already open,
 there is nothing more to propose. */
  if (!loading && !projectsLoading && projects.length === 0 && sessions.length === 0) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
        <div className="mx-auto max-w-5xl">
          <EmptyScene icon={Bot} title={t("emptyNoProject")}>
            <Button onClick={openCreateProject}>
              <Plus />
              {tProjects("firstProject")}
            </Button>
          </EmptyScene>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      {/* ── Left: session list ──────────────────────────────────────────── */}
      <SecondarySidebar
        title={t("title")}
        hiddenOnMobile={mobileDetail}
        filter={{
          value: query,
          onChange: setQuery,
          placeholder: t("filterPlaceholder", { count: listCount }),
          clearLabel: tCommon("clearFilter"),
        }}
        actions={<NewSessionButton onClick={() => startNewSession()} />}
      >
        {loading ? (
          /* In the form of a list: two projects, a few conversations of a
             ligne dessous. */
          <div className="flex flex-col gap-2 px-2 pt-2">
            {[0, 1].map((g) => (
              <div key={g} className="flex flex-col gap-1">
                <Skeleton className="h-6 w-32 rounded-md" />
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="ml-8 h-5 rounded-md" />
                ))}
              </div>
            ))}
          </div>
        ) : sessions.length === 0 ? (
          /* The column NEVER got anything: no one has spoken to the agent yet.
 The scene of the other empty surfaces, in `compact` — a column of
 320 px does not have room for a page illustration. No button: the blank
 conversation is already open right next to it, and it is the first
 message sent that will fill this list. */
          <EmptyScene icon={Bot} title={t("emptyTitle")} size="compact" />
        ) : listCount === 0 ? (
          // The filter simply emptied the list: a discrete line is enough,
          // the column is not empty, it is restricted.
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            {tCommon("noFilterMatch")}
          </p>
        ) : (
          <div className="flex flex-col gap-2 px-2 pt-2 pb-4">
            {/* A project, its conversations. No synthetic entry: one
 draft is not a conversation — the column only shows this
 that exists, that is, from the first message sent. */}
            {pinnedSessions.length > 0 ? (
              <SessionGroupRows
                group={{ key: PINNED_GROUP_KEY, project: null, items: pinnedSessions }}
                open={filtering || !collapsedGroups.has(PINNED_GROUP_KEY)}
                showAll={filtering || expandedGroups.has(PINNED_GROUP_KEY)}
                collapsible={!filtering}
                canLaunch={false}
                selectedKey={selectedKey}
                reads={reads}
                fmtDay={fmtDay}
                onToggle={() => toggleGroup(PINNED_GROUP_KEY)}
                onShowAll={() =>
                  setExpandedGroups((prev) => toggledSet(prev, PINNED_GROUP_KEY))
                }
                onSelect={selectReal}
                onNewSession={() => startNewSession()}
                onRename={setRenameTarget}
                onTogglePinned={(session) => void togglePinnedSession(session)}
                onDelete={setDeleteTarget}
                fallbackLabel={t("pinnedSessions")}
                headerIcon={<Pin className="size-4 shrink-0 text-muted-foreground" />}
              />
            ) : null}
            {groups.map((g) => (
              <SessionGroupRows
                key={g.key}
                group={g}
                open={filtering || !collapsedGroups.has(g.key)}
                showAll={filtering || expandedGroups.has(g.key)}
                collapsible={!filtering}
                canLaunch={!!g.project && gitLinked.has(g.project.id)}
                selectedKey={selectedKey}
                reads={reads}
                fmtDay={fmtDay}
                onToggle={() => toggleGroup(g.key)}
                onShowAll={() => setExpandedGroups((prev) => toggledSet(prev, g.key))}
                onSelect={selectReal}
                onNewSession={() => startNewSession(g.project?.id)}
                onRename={setRenameTarget}
                onTogglePinned={(session) => void togglePinnedSession(session)}
                onDelete={setDeleteTarget}
              />
            ))}
          </div>
        )}
      </SecondarySidebar>

      {/* ── Right: session conversation, or blank conversation ───── */}
      <div
        className={cn(
          "min-h-0 min-w-0 flex-1 flex-col md:flex",
          mobileDetail ? "flex" : "hidden",
        )}
      >
        {freeComposeActive ? (
          <SessionCompose
            // The pre-filling of the composer is one-shot (montage): a “New”,
            // or a NEW note launched from the notebook, must go up a composer
            // new rather than keeping the text from the previous one.
            key={`${composeNonce}:${freeDraft?.prompt ?? ""}`}
            initialText={freeDraft?.prompt}
            initialProjectId={freeDraft?.projectId ?? newSessionProjectId ?? undefined}
            onLaunched={(run: AgentRunSummary) => setLaunchedRunId(run.id)}
            onBack={() => setMobileDetail(false)}
          />
        ) : activeItem ? (
          <AgentSessionDetail
            key={activeItem.runId}
            item={activeItem}
            compose={issueComposeSelected}
            composeInitialText={issueComposeSelected ? issueDraft?.prompt : undefined}
            // Framing (“Generate plan” / “Check plan”) and control
            // (“Check implementation”): the ticket does not start at
            // launch, it keeps its status. The draft carries the intention of
            // original button, not what the composer contains when sending.
            composeIntent={
              issueComposeSelected ? issueDraft?.intent ?? "implement" : undefined
            }
            onLaunched={(run: AgentRunSummary) => setLaunchedRunId(run.id)}
            onBack={() => setMobileDetail(false)}
            onOpenIssue={(issueId, projectId) => setPanel({ projectId, issueId })}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center p-6">
            <p className="text-sm text-muted-foreground">{t("noSelection")}</p>
          </div>
        )}
      </div>

      {/* Rename/delete, from the right click on the list. */}
      <SessionNameDialog
        session={renameTarget}
        onOpenChange={(open) => {
          if (!open) setRenameTarget(null);
        }}
        onSubmit={(name) =>
          renameTarget ? renameSession(renameTarget, name) : Promise.resolve()
        }
      />
      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {t("deleteSessionTitle", {
                name: deleteTarget
                  ? agentSessionTitle(deleteTarget, t("freeSessionTitle"))
                  : "",
              })}
            </DialogTitle>
            {/* What goes with it: all the thread, and the agent's work with it.
 A conversation doesn't go in the trash — there isn't one for her, and telling it is better than letting it find out. */}
            <DialogDescription>{t("deleteSessionDescription")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              {tCommon("cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={deleting}
              onClick={() => deleteTarget && void deleteSession(deleteTarget)}
            >
              {tCommon("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Linked issue side panel — overlay over the page (no nav). */}
      {panel ? (
        <PrIssuePanel
          key={`${panel.projectId}:${panel.issueId}`}
          projectId={panel.projectId}
          issueId={panel.issueId}
          onClose={() => setPanel(null)}
        />
      ) : null}
    </div>
  );
}

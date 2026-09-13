"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
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
  toggledSet,
  type ProjectGroup,
} from "@/components/sidebar-project-group";
import { matchesFilter } from "@/components/sidebar-filter-field";
import {
  allAgentSessionsQueryKey,
  patchAgentConversationPinnedInCache,
  useAgentSessionsQuery,
} from "@/lib/use-agent-runs";
import { useProjects } from "@/lib/projects-context";
import { useAgentReads } from "@/lib/use-agent-reads";
import { useAssistantChatContext } from "@/lib/assistant-chat-context";
import { useAssistantContext } from "@/lib/assistant-panel-context";
import { usePublishCurrentView } from "@/lib/current-view-context";
import { issueIdentifier } from "@/lib/issue-constants";
import { SIDEBAR_COMPACT_CONTROL_CLASS } from "@/lib/sidebar-control-styles";
import {
  deleteAgentRunApi,
  isAgentSessionUnread,
  renameAgentRunApi,
  setAgentConversationPinnedApi,
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
    <div className="flex h-full min-h-0 flex-1 items-center justify-center">
      <Spinner className="size-5 text-muted-foreground" />
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
          data-sidebar-filter-result
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
  selectedKey,
  reads,
  fmtDay,
  onToggle,
  onShowAll,
  onSelect,
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
  selectedKey: string | null;
  reads: Record<string, string>;
  fmtDay: (at: string) => string;
  onToggle: () => void;
  onShowAll: () => void;
  onSelect: (key: string) => void;
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
          className={cn(SIDEBAR_COMPACT_CONTROL_CLASS, "-mr-2")}
          aria-label={t("newButton")}
        >
          <Plus className="size-[18px]" />
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
 * New work is intentionally absent from this compatibility surface. Voluntary
 * requests enter the shared Numo composer; this page keeps existing worker
 * histories, artifacts, and controls accessible.
 */
export function AgentsPage() {
  const t = useTranslations("Agents");
  const tProjects = useTranslations("Projects");
  const tCommon = useTranslations("Common");
  const format = useFormatter();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { projects, openCreateProject, loading: projectsLoading } = useProjects();
  const { sessions, loading, refetch } = useAgentSessionsQuery();
  const { reads, markRead } = useAgentReads();
  const { reset: resetAssistant } = useAssistantChatContext();
  const isWide = useIsWideViewport();

  // Deep links resolve a persisted run or the newest historical run for an issue.
  const searchParams = useSearchParams();
  const issueParam = searchParams.get("issue");
  const runParam = searchParams.get("run");

  // The selected key always identifies persisted historical work.
  const [selectedKey, setSelectedKey] = useState<string | null>(
    issueParam ?? runParam,
  );
  const [mobileDetail, setMobileDetail] = useState(
    !!issueParam || !!runParam,
  );
  // Related issue open in side panel (on top of page, no navigation).
  const [panel, setPanel] = useState<{ projectId: string; issueId: string } | null>(null);
  const [query, setQuery] = useState("");
  // Targets of the context menu of the list: the conversation that we rename, the one
  // which we are about to delete. `null` = the corresponding dialog is closed.
  const [renameTarget, setRenameTarget] = useState<AgentSessionListItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AgentSessionListItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  // Ignore an obsolete response if the same conversation is toggled again
  // before its first pin request settles.
  const pinMutationSequence = useRef(new Map<string, number>());
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

  // Tracks param changes (client navigation to another entry).
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

  // Resolve the selected historical conversation for the detail pane.
  const realSelected = sessionForKey(selectedKey);
  const activeItem = realSelected;

  // The DISPLAYED conversation never has a bubble: it is marked read when it is opened AND
  // at each new end of run as long as it remains visible (dependence on
  // `lastCompletedAt`). “Visible” = desktop (the pane is always rendered) or, on
  // mobile, the detail pane open; otherwise (mobile list or compose) we do not score,
  // so as not to erase the bubble of a session that we are not watching. The sessions
  // WITHOUT TICKET have no read/unread tracking (personal, no issue to anchor).
  const shownReal = isWide || mobileDetail ? realSelected : null;
  useEffect(() => {
    const id = shownReal?.conversationId;
    if (id) markRead(id);
  }, [shownReal?.conversationId, shownReal?.lastCompletedAt, markRead]);

  /**
   * Publishes the active issue to Numo: it resolves “this issue” (and its PR in the case
   * appropriate), reads it and can act on it.
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
    realSelected
        ? {
            href: `/agents?run=${encodeURIComponent(realSelected.conversationId)}`,
            label: agentSessionTitle(realSelected, t("freeSessionTitle")),
          }
        : { href: "/numo", label: t("title") }
  );

  // Keeps a valid selection: when the selected session disappears (or a
  // deep-link designates a session which no longer exists), we return to the conversation
  // no selection — never on ANOTHER conversation that we didn't ask to read.
  useEffect(() => {
    if (sessions.length === 0) return;
    const resolved = sessionForKey(selectedKey);
    if (!resolved) {
      setSelectedKey(null);
      setMobileDetail(false);
      return;
    }
    // Deep-link by TICKET (`?issue=`): the selection retains the CONVERSATION
    // that he opened, not the ticket — otherwise no line is highlighted, and the
    // part would follow a ticket whose conversations are no longer one.
    if (resolved.conversationId !== selectedKey) setSelectedKey(resolved.conversationId);
  }, [sessions, selectedKey]);

  // Select a persisted historical session.
  const selectReal = (key: string) => {
    setSelectedKey(key);
    setMobileDetail(true);
    // The URL stops pointing to the entry you just left. She would lie to
    // reloading, and above all it would make the following navigation towards
    // this same entry: pushing the current address changes nothing.
    if (issueParam || runParam) router.replace("/agents");
  };

  // “New” leaves the historical adapter and opens the common Numo surface.
  const startNewSession = () => {
    resetAssistant();
    router.push("/numo");
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

  /** Move the conversation immediately, then persist the new pinned state.
   * A rejected write restores only this conversation so concurrent optimistic
   * changes to other rows remain intact. */
  const togglePinnedSession = (session: AgentSessionListItem) => {
    const nextPinned = !session.pinned;
    const sequence = (pinMutationSequence.current.get(session.runId) ?? 0) + 1;
    pinMutationSequence.current.set(session.runId, sequence);
    const previousPinned = patchAgentConversationPinnedInCache(
      queryClient,
      session.runId,
      nextPinned,
    );

    void setAgentConversationPinnedApi(session.runId, nextPinned)
      .then(() => {
        if (pinMutationSequence.current.get(session.runId) !== sequence) return;
        void queryClient.invalidateQueries({ queryKey: allAgentSessionsQueryKey });
      })
      .catch((err) => {
        if (pinMutationSequence.current.get(session.runId) !== sequence) return;
        if (previousPinned !== undefined) {
          patchAgentConversationPinnedInCache(
            queryClient,
            session.runId,
            previousPinned,
          );
        }
        toast.error((err as Error).message);
      });
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
      if (realSelected?.runId === session.runId) {
        setSelectedKey(null);
        setMobileDetail(false);
      }
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
  const unpinnedSessions = visibleSessions.filter((session) => !session.pinned);
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
                selectedKey={selectedKey}
                reads={reads}
                fmtDay={fmtDay}
                onToggle={() => toggleGroup(PINNED_GROUP_KEY)}
                onShowAll={() =>
                  setExpandedGroups((prev) => toggledSet(prev, PINNED_GROUP_KEY))
                }
                onSelect={selectReal}
                onRename={setRenameTarget}
                onTogglePinned={(session) => void togglePinnedSession(session)}
                onDelete={setDeleteTarget}
                fallbackLabel={t("pinnedSessions")}
                headerIcon={<Pin className="size-4 shrink-0 text-muted-foreground" />}
              />
            ) : null}
            {unpinnedSessions.map((session) => {
              const key = sessionKey(session);
              const unread = isAgentSessionUnread(session, reads);
              return (
                <SessionRow
                  key={key}
                  session={session}
                  selected={key === selectedKey}
                  unread={unread}
                  awaiting={unread && session.awaitingInput}
                  dateLabel={fmtDay(session.updated_at)}
                  onSelect={() => selectReal(key)}
                  onRename={() => setRenameTarget(session)}
                  onTogglePinned={() => void togglePinnedSession(session)}
                  onDelete={() => setDeleteTarget(session)}
                />
              );
            })}
          </div>
        )}
      </SecondarySidebar>

      {/* ── Right: selected historical worker conversation ───────── */}
      <div
        className={cn(
          "min-h-0 min-w-0 flex-1 flex-col md:flex",
          mobileDetail ? "flex" : "hidden",
        )}
      >
        {activeItem ? (
          <AgentSessionDetail
            key={activeItem.runId}
            item={activeItem}
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

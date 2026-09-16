"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  toast,
} from "mangue-ui";
import {
  Archive,
  ArchiveRestore,
  Ellipsis,
  History,
  Loader2,
  Pin,
  PinOff,
  Trash2,
} from "lucide-react";
import { EmptyScene } from "@/components/empty-scene";
import { fetchConversations, deleteConversation, setActiveConversation, updateConversation } from "@/lib/assistant-api";
import type { NumoConversation } from "@/lib/assistant-types";
import { useAssistantPanel } from "@/lib/assistant-panel-context";
import { isNumoConversationUnread } from "@/lib/numo-conversation-unread";
import { matchesFilter } from "@/components/sidebar-filter-field";

type ConversationWithProject = NumoConversation;
const CONVERSATIONS_PAGE_SIZE = 50;

/** All conversations, ordered by recency independently of attached projects. */
interface ConversationListProps {
  activeConversationId: string | null;
  /** Legacy project metadata accompanies the selected conversation when loading it. */
  onSelect: (conversationId: string, projectId: string | null) => void;
  onNew: () => void;
  refreshKey?: number;
  query: string;
  onVisibleCountChange?: (count: number) => void;
}

// Buckets in chronological order (most recent first).
type Bucket = "today" | "yesterday" | "last7" | "last30" | "older";

function bucketFor(dateStr: string): Bucket {
  const d = new Date(dateStr);
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).getTime();
  const startOfYesterday = startOfToday - 86_400_000;
  const sevenDaysAgo = startOfToday - 7 * 86_400_000;
  const thirtyDaysAgo = startOfToday - 30 * 86_400_000;
  const t = d.getTime();
  if (t >= startOfToday) return "today";
  if (t >= startOfYesterday) return "yesterday";
  if (t >= sevenDaysAgo) return "last7";
  if (t >= thirtyDaysAgo) return "last30";
  return "older";
}

const BUCKET_ORDER: Bucket[] = [
  "today",
  "yesterday",
  "last7",
  "last30",
  "older",
];

export function ConversationList({
  activeConversationId,
  onSelect,
  onNew,
  refreshKey,
  query,
  onVisibleCountChange,
}: ConversationListProps) {
  const t = useTranslations("Assistant");
  const tc = useTranslations("Common");
  const router = useRouter();
  const { close: closePanel } = useAssistantPanel();
  const [conversations, setConversations] = useState<ConversationWithProject[]>(
    []
  );
  // Keep optimistic actions serializable between renders. A second menu action
  // can arrive before React commits the first one, so the closure alone is not
  // a reliable picture of the list to patch or roll back.
  const conversationsRef = useRef(conversations);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  // The list leaves EMPTY: without this flag, “no conversation” is displayed on
  // fetch time, even when there are dozens.
  const [loaded, setLoaded] = useState(false);
  const [limit, setLimit] = useState(CONVERSATIONS_PAGE_SIZE);
  const [hasMore, setHasMore] = useState(false);
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    let active = true;

    setFetching(true);
    void fetchConversations(limit).then((page) => {
      if (active) {
        conversationsRef.current = page.conversations;
        setConversations(page.conversations);
        setHasMore(page.hasMore);
        setLoaded(true);
        setFetching(false);
      }
    }).catch(() => {
      if (active) {
        setHasMore(false);
        setLoaded(true);
        setFetching(false);
      }
    });

    return () => {
      active = false;
    };
  }, [activeConversationId, limit, refreshKey]);

  const patchConversation = useCallback(
    async (id: string, patch: { pinned?: boolean; archived?: boolean }) => {
      const before = conversationsRef.current;
      const previous = before.find((conversation) => conversation.id === id);
      if (!previous) return;
      const nextPinnedAt =
        patch.pinned === undefined
          ? undefined
          : patch.pinned
            ? new Date().toISOString()
            : null;
      const nextArchivedAt =
        patch.archived === undefined
          ? undefined
          : patch.archived
            ? new Date().toISOString()
            : null;
      const optimistic = before.map((conversation) =>
        conversation.id === id
          ? {
              ...conversation,
              ...(nextPinnedAt !== undefined ? { pinned_at: nextPinnedAt } : {}),
              ...(nextArchivedAt !== undefined
                ? { archived_at: nextArchivedAt }
                : {}),
            }
          : conversation,
      );
      conversationsRef.current = optimistic;
      setConversations(optimistic);

      try {
        if (await updateConversation(id, patch)) return;
      } catch {
        // The rollback below is also needed when the request cannot reach the
        // server (for example, after losing the network connection).
      }

      // Revert only values that still belong to this request. A later action
      // may already have changed the same conversation while this request was
      // in flight; putting back the whole list would erase that newer choice.
      const rolledBack = conversationsRef.current.map((conversation) =>
        conversation.id === id
          ? {
              ...conversation,
              ...(nextPinnedAt !== undefined &&
              conversation.pinned_at === nextPinnedAt
                ? { pinned_at: previous.pinned_at }
                : {}),
              ...(nextArchivedAt !== undefined &&
              conversation.archived_at === nextArchivedAt
                ? { archived_at: previous.archived_at }
                : {}),
            }
          : conversation,
      );
      conversationsRef.current = rolledBack;
      setConversations(rolledBack);
      toast.error(t("historyUpdateFailed"));
    },
    [t],
  );

  const handleConfirmDelete = useCallback(async () => {
    if (!pendingDelete) return;
    const convId = pendingDelete;
    setDeletingId(convId);
    setPendingDelete(null);
    const ok = await deleteConversation(convId);
    if (ok) {
      const next = conversationsRef.current.filter((c) => c.id !== convId);
      conversationsRef.current = next;
      setConversations(next);
      if (activeConversationId === convId) {
        onNew();
      }
    }
    setDeletingId(null);
  }, [pendingDelete, activeConversationId, onNew]);

  const grouped = useMemo(() => {
    const g: Record<Bucket, ConversationWithProject[]> = {
      today: [],
      yesterday: [],
      last7: [],
      last30: [],
      older: [],
    };
    for (const conv of conversations) {
      if (!matchesFilter(query, [conv.title])) continue;
      if (conv.pinned_at) continue;
      g[bucketFor(conv.updated_at)].push(conv);
    }
    return g;
  }, [conversations, query]);

  const pinned = useMemo(
    () =>
      conversations.filter(
        (conversation) =>
          conversation.pinned_at && matchesFilter(query, [conversation.title]),
      ),
    [conversations, query],
  );
  const visibleCount = useMemo(
    () =>
      conversations.filter((conversation) =>
        matchesFilter(query, [conversation.title]),
      ).length,
    [conversations, query],
  );

  useEffect(() => {
    onVisibleCountChange?.(visibleCount);
  }, [onVisibleCountChange, visibleCount]);

  const renderConversation = (conversation: ConversationWithProject) => {
    const isPinned = Boolean(conversation.pinned_at);
    const isArchived = Boolean(conversation.archived_at);
    const unread = isNumoConversationUnread(conversation, activeConversationId);
    return (
      <div
        key={conversation.id}
        className={cn(
          "group flex items-center rounded-lg text-foreground",
          activeConversationId === conversation.id
            ? "bg-accent"
            : "hover:bg-accent/50 focus-within:bg-accent/50",
        )}
      >
        <button
          type="button"
          data-sidebar-filter-result
          data-navigation-href={conversation.detail_href ?? `/numo?conversation=${encodeURIComponent(conversation.id)}`}
          className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left text-sm outline-none"
          onClick={() => {
            void updateConversation(conversation.id, { read: true }).catch(
              () => {},
            );
            if (conversation.detail_href) {
              void setActiveConversation(conversation.id);
              closePanel();
              router.push(conversation.detail_href);
            } else {
              onSelect(conversation.id, conversation.project_id);
            }
          }}
        >
          {isPinned && <Pin aria-hidden className="size-3 shrink-0" />}
          {isArchived && (
            <Archive
              aria-hidden
              className="size-3 shrink-0 text-muted-foreground"
            />
          )}
          <span className="min-w-0 flex-1 truncate">
            {conversation.title || t("newConversation")}
          </span>
          {conversation.status === "generating" && (
            <Loader2 className="size-3 shrink-0 animate-spin text-primary" />
          )}
          {unread && (
            <span
              className="size-2 shrink-0 rounded-full bg-blue-500"
              aria-label={t("unreadConversation")}
            />
          )}
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="mr-1 size-7 shrink-0 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"
              aria-label={t("conversationActions")}
            >
              <Ellipsis className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={() =>
                void patchConversation(conversation.id, { pinned: !isPinned })
              }
            >
              {isPinned ? <PinOff /> : <Pin />}
              {t(isPinned ? "unpinConversation" : "pinConversation")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() =>
                void patchConversation(conversation.id, {
                  archived: !isArchived,
                })
              }
            >
              {isArchived ? <ArchiveRestore /> : <Archive />}
              {t(isArchived ? "unarchiveConversation" : "archiveConversation")}
            </DropdownMenuItem>
            {conversation.source === "assistant" && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  disabled={deletingId === conversation.id}
                  onSelect={() => setPendingDelete(conversation.id)}
                >
                  <Trash2 />
                  {t("deleteConversation")}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  };

  return (
    <>
      <div className="flex flex-col gap-1">
        {loaded && conversations.length === 0 && (
          <EmptyScene
            size="compact"
            icon={History}
            title={t("noConversations")}
            className="px-0 py-4"
          />
        )}

        {loaded && conversations.length > 0 && visibleCount === 0 && (
          <p className="px-3 py-4 text-center text-sm text-muted-foreground">
            {tc("noFilterMatch")}
          </p>
        )}

        {pinned.length > 0 && (
          <div className="mt-2 flex flex-col gap-0.5">
            <div className="px-2 pb-1 text-xs font-medium text-muted-foreground">
              {t("pinnedConversations")}
            </div>
            {pinned.map(renderConversation)}
          </div>
        )}

        {BUCKET_ORDER.map((bucket) => {
          const items = grouped[bucket];
          if (items.length === 0) return null;
          return (
            <div key={bucket} className="mt-2 flex flex-col gap-0.5">
              <div className="px-2 pb-1 text-xs font-medium text-muted-foreground">
                {t(`group.${bucket}` as const)}
              </div>
              {items.map(renderConversation)}
            </div>
          );
        })}

        {hasMore && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 self-center"
            disabled={fetching}
            onClick={() => setLimit((value) => value + CONVERSATIONS_PAGE_SIZE)}
          >
            {fetching && <Loader2 className="animate-spin" />}
            {t("loadMore")}
          </Button>
        )}
      </div>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteConfirm.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteConfirm.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("deleteConfirm.cancel")}</AlertDialogCancel>
            {/* `variant`, not a colored `className`: AlertDialogAction
 places the button classes on a parent Slot, so the color
 written here does not pass through tailwind-merge and would lose against
 that of the variant — the deletion was displayed as a blue button. */}
            <AlertDialogAction variant="destructive" onClick={handleConfirmDelete}>
              {t("deleteConfirm.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

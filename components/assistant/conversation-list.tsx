"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
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
} from "mangue-ui";
import { History, Loader2, Plus, Trash2 } from "lucide-react";
import { EmptyScene } from "@/components/empty-scene";
import { fetchConversations, deleteConversation } from "@/lib/assistant-api";
import type { Conversation } from "@/lib/assistant-types";

interface ConversationWithProject extends Conversation {
  project?: { name: string } | null;
}

interface ConversationListProps {
  projectId?: string | null;
  activeConversationId: string | null;
  onSelect: (conversationId: string) => void;
  onNew: () => void;
  refreshKey?: number;
  /** Hide the inline "new conversation" button (useful when the host UI
   *  already exposes one). */
  hideNewButton?: boolean;
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
  projectId,
  activeConversationId,
  onSelect,
  onNew,
  refreshKey,
  hideNewButton = false,
}: ConversationListProps) {
  const t = useTranslations("Assistant");
  const [conversations, setConversations] = useState<ConversationWithProject[]>(
    []
  );
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  // La liste part VIDE : sans ce drapeau, « aucune conversation » s'affiche le
  // temps du fetch, y compris quand il y en a des dizaines.
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;

    void fetchConversations(projectId).then((data) => {
      if (active) {
        setConversations(data);
        setLoaded(true);
      }
    });

    return () => {
      active = false;
    };
  }, [projectId, refreshKey]);

  const handleConfirmDelete = useCallback(async () => {
    if (!pendingDelete) return;
    const convId = pendingDelete;
    setDeletingId(convId);
    setPendingDelete(null);
    const ok = await deleteConversation(convId);
    if (ok) {
      setConversations((prev) => prev.filter((c) => c.id !== convId));
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
      g[bucketFor(conv.updated_at)].push(conv);
    }
    return g;
  }, [conversations]);

  return (
    <>
      <div className="flex flex-col gap-1">
        {!hideNewButton && (
          <Button
            variant="outline"
            size="sm"
            onClick={onNew}
            className="mb-1 w-full justify-start gap-2"
          >
            <Plus className="h-icon-sm w-icon-sm" />
            {t("newConversation")}
          </Button>
        )}

        {/* Aucune conversation : la même scène que partout ailleurs, à la
            taille du popover — le titre passe en encre, comme les autres états
            vides, au lieu d'une ligne grise qu'on prend pour une note. */}
        {loaded && conversations.length === 0 && (
          <EmptyScene
            size="compact"
            icon={History}
            title={t("noConversations")}
            className="px-0 py-4"
          />
        )}

        {BUCKET_ORDER.map((bucket) => {
          const items = grouped[bucket];
          if (items.length === 0) return null;
          return (
            <div key={bucket} className="mt-2 flex flex-col gap-0.5">
              <div className="px-2 pb-1 text-xs font-medium text-muted-foreground">
                {t(`group.${bucket}` as const)}
              </div>
              {items.map((conv) => (
                <Button
                  key={conv.id}
                  type="button"
                  onClick={() => onSelect(conv.id)}
                  variant="ghost"
                  className={cn(
                    "group h-auto w-full justify-start gap-2 rounded-lg px-3 py-2 text-left text-sm font-normal text-foreground",
                    activeConversationId === conv.id
                      ? "bg-accent hover:bg-accent"
                      : "bg-transparent hover:bg-accent/50"
                  )}
                >
                  <span className="flex-1 truncate">
                    {!projectId && conv.project?.name && (
                      <span className="block truncate text-2xs text-muted-foreground/60">
                        {conv.project.name}
                      </span>
                    )}
                    <span className="truncate">
                      {conv.title || t("newConversation")}
                    </span>
                  </span>
                  {conv.status === "generating" && (
                    <Loader2 className="h-3 w-3 shrink-0 animate-spin text-primary group-hover:hidden" />
                  )}
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      setPendingDelete(conv.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.stopPropagation();
                        setPendingDelete(conv.id);
                      }
                    }}
                    aria-disabled={deletingId === conv.id}
                    className="hidden shrink-0 cursor-pointer rounded p-0.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive group-hover:flex"
                    title={t("deleteConversation")}
                  >
                    <Trash2 className="h-3 w-3" />
                  </span>
                </Button>
              ))}
            </div>
          );
        })}
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
            {/* `variant`, et non un `className` de couleur : AlertDialogAction
                pose les classes du bouton sur un Slot parent, donc la couleur
                écrite ici ne passe pas par tailwind-merge et perdait contre
                celle du variant — la suppression s'affichait en bouton bleu. */}
            <AlertDialogAction variant="destructive" onClick={handleConfirmDelete}>
              {t("deleteConfirm.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

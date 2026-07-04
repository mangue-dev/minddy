"use client";

import { useState } from "react";
import { Button, Spinner, toast } from "mangue-ui";
import { Pencil, Trash2, Check, X } from "lucide-react";
import { useIssueTimeline } from "@/lib/use-issue-timeline";
import { describeEvent, type EventContext } from "@/lib/describe-event";
import { MentionTextarea, extractMentions } from "@/components/mention-textarea";
import { Markdown } from "@/components/markdown";
import type { Comment, Member } from "@/lib/types";

function fmt(at: string): string {
  return new Date(at).toLocaleString("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function actorName(members: Member[], id: string | null): string {
  if (!id) return "Quelqu'un";
  const m = members.find((x) => x.user_id === id);
  return m?.full_name || m?.email || "Un utilisateur";
}
function initials(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

function CommentItem({
  comment,
  authorName,
  canEdit,
  onEdit,
  onDelete,
}: {
  comment: Comment;
  authorName: string;
  canEdit: boolean;
  onEdit: (body: string) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(comment.body);
  const [busy, setBusy] = useState(false);

  return (
    <div className="flex gap-2.5">
      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground">
        {initials(authorName)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{authorName}</span>
          <span className="text-xs text-muted-foreground">{fmt(comment.created_at)}</span>
          {comment.updated_at !== comment.created_at && (
            <span className="text-xs text-muted-foreground">(modifié)</span>
          )}
          {canEdit && !editing && (
            <span className="ml-auto flex items-center gap-0.5">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Modifier"
                onClick={() => {
                  setText(comment.body);
                  setEditing(true);
                }}
              >
                <Pencil className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Supprimer"
                onClick={() => void onDelete().catch((e) => toast.error((e as Error).message))}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </span>
          )}
        </div>
        {editing ? (
          <div className="mt-1 flex flex-col gap-1.5">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              className="w-full resize-none rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
            <div className="flex justify-end gap-1">
              <Button variant="ghost" size="icon-sm" aria-label="Annuler" onClick={() => setEditing(false)}>
                <X />
              </Button>
              <Button
                size="icon-sm"
                aria-label="Enregistrer"
                disabled={busy || !text.trim()}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await onEdit(text.trim());
                    setEditing(false);
                  } catch (e) {
                    toast.error((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? <Spinner /> : <Check />}
              </Button>
            </div>
          </div>
        ) : (
          <Markdown className="mt-0.5">{comment.body}</Markdown>
        )}
      </div>
    </div>
  );
}

export function IssueTimeline({
  issueId,
  currentUserId,
  ctx,
}: {
  issueId: string;
  currentUserId: string | null;
  ctx: EventContext;
}) {
  const { items, addComment, updateComment, deleteComment } = useIssueTimeline(issueId);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);

  const submit = async () => {
    const body = draft.trim();
    if (!body) return;
    setPosting(true);
    try {
      await addComment(body, extractMentions(draft, ctx.members));
      setDraft("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="border-t border-border pt-3">
      <p className="mb-3 text-sm font-medium">Activité</p>

      <div className="flex flex-col gap-3">
        {items.map((item) =>
          item.kind === "comment" ? (
            <CommentItem
              key={`c-${item.comment.id}`}
              comment={item.comment}
              authorName={actorName(ctx.members, item.comment.author_id)}
              canEdit={item.comment.author_id === currentUserId}
              onEdit={(body) => updateComment(item.comment.id, body)}
              onDelete={() => deleteComment(item.comment.id)}
            />
          ) : (
            <div key={`e-${item.event.id}`} className="flex items-start gap-2 text-xs text-muted-foreground">
              <span className="mt-1 size-1.5 shrink-0 rounded-full bg-border" aria-hidden />
              <span className="min-w-0">
                <span className="font-medium text-foreground/80">
                  {actorName(ctx.members, item.event.actor_id)}
                </span>{" "}
                {describeEvent(item.event, ctx)}
                <span className="ml-1.5 text-muted-foreground/70">{fmt(item.event.created_at)}</span>
              </span>
            </div>
          )
        )}
      </div>

      <div className="mt-4 flex flex-col gap-2">
        <MentionTextarea
          value={draft}
          onChange={setDraft}
          members={ctx.members}
          onSubmit={() => void submit()}
          placeholder="Écrire un commentaire… (@ pour mentionner · ⌘⏎ pour envoyer)"
        />
        <div className="flex justify-end">
          <Button size="sm" disabled={posting || !draft.trim()} onClick={() => void submit()}>
            {posting && <Spinner />}
            Commenter
          </Button>
        </div>
      </div>
    </div>
  );
}

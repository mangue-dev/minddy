"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { CornerDownRight, Lock, Trash2 } from "lucide-react";
import { Button, Spinner, cn } from "mangue-ui";
import { AutoTextarea } from "@/components/auto-textarea";
import { SendShortcutTooltip } from "@/components/send-shortcut";
import { useIsSendShortcut } from "@/lib/keyboard/use-send-mode";
import { ProjectOrb } from "@/components/project-orb";
import { orbSeedOr } from "@/lib/project-orb-colors";
import { UserAvatar } from "@/components/user-avatar";
import { Markdown } from "@/components/markdown";
import {
  FEEDBACK_COMMENT_BODY_MAX,
  type PublicComment,
  type PublicIdentity,
  type PublicProject,
} from "@/lib/feedback/types";
import { addPublicCommentAction, deletePublicCommentAction } from "./actions";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * The PUBLIC thread of a return (MIN-196).
 *
 * It replaces the “team response” insert: the same descending speech, but
 * in a conversation where we can respond to him. The team's response is not
 * so no longer a separate block, it's a message from the thread — signed by the project orb
 * and the product name, as before.
 *
 * The visitors are ANONYMOUS: an avatar sown on their pseudonym, and
 * nothing else. Two messages from the same person have the same face, which
 * is enough to follow an exchange; no name can be traced back to anyone. Se
 * connecting is necessary to write — it's what gives the team something to
 * moderate — but it doesn't read anywhere on the page.
 *
 * Depth ≤ 1: we respond to a thread, never to a response. A board of
 * feedback is not a forum, and the tree would cost people a navigation
 * came to say one thing and vote.
 */
export function PublicComments({
  token,
  project,
  postId,
  comments,
  /** Board adjustment. False = read only: what is written remains, the
 composer disappears. */
  allowComments,
  identity,
  onNeedAuth,
}: {
  token: string;
  project: PublicProject;
  postId: string;
  comments: PublicComment[];
  allowComments: boolean;
  identity: PublicIdentity | null;
  /** Opens the OTP gate then replays the sending (the voting pattern). */
  onNeedAuth: (run: () => void) => void;
}) {
  const t = useTranslations("PublicFeedback");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  /** The thread whose response zone is open (id of its root). */
  const [replyingTo, setReplyingTo] = useState<string | null>(null);

  // The server renders the thread flat, from oldest to newest; we
  // groups here, as `useFeedbackTimeline` does on the team side — only one
  // threading convention in the repository, to be reread in the same place.
  const threads = useMemo(() => {
    const roots = comments.filter((c) => c.parentId === null);
    const rootIds = new Set(roots.map((r) => r.id));
    const repliesByRoot = new Map<string, PublicComment[]>();
    for (const c of comments) {
      if (c.parentId && rootIds.has(c.parentId)) {
        const list = repliesByRoot.get(c.parentId) ?? [];
        list.push(c);
        repliesByRoot.set(c.parentId, list);
      }
    }
    return roots.map((root) => ({ root, replies: repliesByRoot.get(root.id) ?? [] }));
  }, [comments]);

  const post = (body: string, parentId: string | null, onDone: () => void) =>
    new Promise<string | null>((resolve) => {
      startTransition(async () => {
        const result = await addPublicCommentAction(token, postId, body, parentId);
        if (result.ok) {
          onDone();
          router.refresh();
          resolve(null);
          return;
        }
        if (result.error === "notAuthenticated") {
          // The OTP door, then the SAME text: no one rewrites their message
          // because he was asked for his email when sending it.
          onNeedAuth(() => void post(body, parentId, onDone));
          resolve(null);
          return;
        }
        resolve(result.error);
      });
    });

  const remove = (commentId: string) => {
    startTransition(async () => {
      await deletePublicCommentAction(token, postId, commentId);
      router.refresh();
    });
  };

  // Nothing to read and nothing to write: the entire section disappears. A title
  // “Comments” followed by a blank above a word that says they are
  // closed, it's three lines to announce that there is nothing.
  if (comments.length === 0 && !allowComments) return null;

  return (
    <section className="flex flex-col gap-5 border-t pt-5">
      <h2 className="text-sm font-medium text-muted-foreground">
        {comments.length > 0 ? t("commentCount", { count: comments.length }) : t("comments")}
      </h2>

      {threads.length > 0 && (
        <ul className="flex flex-col gap-6">
          {threads.map(({ root, replies }) => (
            <li key={root.id} className="flex flex-col gap-4">
              <PublicCommentRow
                comment={root}
                project={project}
                // A root that has been answered can no longer be deleted: the
                // deletion takes away the thread, including the team's response.
                onDelete={
                  pending || replies.length > 0 ? undefined : () => remove(root.id)
                }
                onReply={
                  allowComments ? () => setReplyingTo(replyingTo === root.id ? null : root.id) : undefined
                }
              />

              {(replies.length > 0 || replyingTo === root.id) && (
                /* The vertical net says belonging better than a simple
 indent: at two levels, the eye follows a line, not a
 margin. */
                <ul className="ml-3 flex flex-col gap-4 border-l pl-4 desktop:ml-4 desktop:pl-5">
                  {replies.map((reply) => (
                    <li key={reply.id}>
                      <PublicCommentRow
                        comment={reply}
                        project={project}
                        onDelete={pending ? undefined : () => remove(reply.id)}
                      />
                    </li>
                  ))}
                  {replyingTo === root.id && (
                    <li>
                      <Composer
                        pending={pending}
                        autoFocus
                        label={t("commentReplySend")}
                        placeholder={t("commentReplyPlaceholder")}
                        onCancel={() => setReplyingTo(null)}
                        onSubmit={(body) =>
                          post(body, root.id, () => setReplyingTo(null))
                        }
                      />
                    </li>
                  )}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      {allowComments ? (
        <Composer
          pending={pending}
          label={t("commentSend")}
          placeholder={
            identity ? t("commentPlaceholder") : t("commentSignedOutPlaceholder")
          }
          notice={t("commentAnonymousNotice")}
          onSubmit={(body) => post(body, null, () => {})}
        />
      ) : (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Lock className="size-3.5 shrink-0" />
          {t("commentsClosed")}
        </p>
      )}
    </section>
  );
}

/**
 * The writing area — the same for a new message and for a reply.
 *
 * `onSubmit` returns the error CODE, or null if it's gone (or if the door
 * identity has taken control): the composer then keeps his text, and the one who
 * just wrote three sentences don't lose them on a network failure.
 */
function Composer({
  pending,
  label,
  placeholder,
  notice,
  autoFocus,
  onCancel,
  onSubmit,
}: {
  pending: boolean;
  label: string;
  placeholder: string;
  /** The line “your comment does not display any names” — on the main dialer
 only: repeating it under each response would make it a
 warning, even though it is information given once. */
  notice?: string;
  autoFocus?: boolean;
  onCancel?: () => void;
  onSubmit: (body: string) => Promise<string | null>;
}) {
  const t = useTranslations("PublicFeedback");
  const tCommon = useTranslations("Common");
  // Public board: the visitor does not have an account, `useIsSendShortcut` falls back
  // so on ⌘/Ctrl+Enter. The member who responds from his account keeps
  // the setting he chose elsewhere in the app.
  const isSend = useIsSendShortcut();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const send = () => {
    const body = draft.trim();
    if (!body) return;
    setError(null);
    void onSubmit(body).then((failure) => {
      if (failure) setError(failure);
      else setDraft("");
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <AutoTextarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && onCancel && !draft.trim()) {
            onCancel();
            return;
          }
          if (!isSend(e)) return;
          e.preventDefault();
          send();
        }}
        placeholder={placeholder}
        maxLength={FEEDBACK_COMMENT_BODY_MAX}
        autoFocus={autoFocus}
        className="min-h-16 w-full resize-none rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring"
      />
      {error && (
        <p className="text-sm text-destructive">
          {error === "closed" ? t("commentsClosed") : t("commentFailed")}
        </p>
      )}
      <div className="flex items-center justify-between gap-3">
        {/* Said BEFORE writing what the publication commits to — that is, nothing
 of nominative. Without this line, someone who has just given their
 email to vote has no reason to believe that their comment,
, will not bear their name. */}
        <p className="text-xs leading-relaxed text-muted-foreground">{notice ?? ""}</p>
        <div className="flex shrink-0 items-center gap-2">
          {onCancel && (
            <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
              {tCommon("cancel")}
            </Button>
          )}
          <SendShortcutTooltip label={label}>
            <Button
              type="button"
              size="sm"
              disabled={pending || !draft.trim()}
              onClick={send}
            >
              {pending && <Spinner />}
              {label}
            </Button>
          </SendShortcutTooltip>
        </div>
      </div>
    </div>
  );
}

/**
 * A message from the thread. The template is that of an app comment — avatar,
 * signature, date, then the text — and that is exactly what the letter bore.
 * team response before becoming one message among others.
 *
 * Two voices, one shape: the team is called (“Team <project>”, the orb
 * of the product as a face), a visitor does not have their name at all. THE
 * contrast IS the information: on this thread, only one of the two parties speaks
 * in the name of something.
 */
function PublicCommentRow({
  comment,
  project,
  onDelete,
  onReply,
}: {
  comment: PublicComment;
  project: PublicProject;
  onDelete?: () => void;
  /** Absent on the answers: the depth stops at one notch. */
  onReply?: () => void;
}) {
  const t = useTranslations("PublicFeedback");
  const format = useFormatter();

  return (
    <div className="group flex flex-col gap-2">
      <div className="flex items-center gap-2">
        {comment.isTeam ? (
          <>
            <ProjectOrb
              seed={orbSeedOr(project.id, project.orbSeed)}
              iconUrl={project.iconUrl}
              className="size-6 rounded-[7px]"
            />
            <span className="min-w-0 truncate text-sm font-medium">
              {t("teamName", { project: project.name })}
            </span>
          </>
        ) : (
          <UserAvatar seed={comment.authorSeed} className="size-6" />
        )}
        <span className="shrink-0 text-xs text-muted-foreground/80">
          {format.dateTime(new Date(comment.createdAt), { dateStyle: "medium" })}
        </span>
        {comment.isMine && onDelete && (
          <IconAction
            label={t("commentDelete")}
            onClick={onDelete}
            className="ml-auto hover:text-destructive"
          >
            <Trash2 className="size-3.5" />
          </IconAction>
        )}
      </div>
      {/* The field accepts plain text, then the message is rendered in markdown.
 Pasted HTML remains text and never becomes an executable node. */}
      <Markdown className="text-sm" allowRawHtml={false}>
        {comment.body}
      </Markdown>
      {onReply && (
        <button
          type="button"
          onClick={onReply}
          className="inline-flex w-fit items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <CornerDownRight className="size-3.5" />
          {t("commentReply")}
        </button>
      )}
    </div>
  );
}

/** Icon button that only appears when hovering over its message (or on the keyboard). */
function IconAction({
  label,
  onClick,
  className,
  children,
}: {
  label: string;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onClick={onClick}
          className={cn(
            "shrink-0 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100",
            className
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}

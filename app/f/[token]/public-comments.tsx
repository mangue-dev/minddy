"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { Lock, Trash2 } from "lucide-react";
import { Button, Spinner, Tooltip, TooltipContent, TooltipTrigger } from "mangue-ui";
import { AutoTextarea } from "@/components/auto-textarea";
import { isSendShortcut, SendShortcutTooltip } from "@/components/send-shortcut";
import { ProjectOrb } from "@/components/project-orb";
import { UserAvatar } from "@/components/user-avatar";
import {
  FEEDBACK_COMMENT_BODY_MAX,
  type PublicComment,
  type PublicIdentity,
  type PublicProject,
} from "@/lib/feedback/types";
import { addPublicCommentAction, deletePublicCommentAction } from "./actions";

/**
 * Le fil PUBLIC d'un retour (MIN-196).
 *
 * Il remplace l'encart « réponse d'équipe » : la même parole descendante, mais
 * dans une conversation où l'on peut lui répondre. La réponse de l'équipe n'est
 * donc plus un bloc à part, c'est un message du fil — signé par l'orbe du projet
 * et le nom du produit, comme avant.
 *
 * Les visiteurs, eux, sont ANONYMES : un avatar semé sur leur pseudonyme, et
 * rien d'autre. Deux messages de la même personne portent le même visage, ce qui
 * suffit à suivre un échange ; aucun nom ne se remonte jusqu'à quelqu'un. Se
 * connecter est nécessaire pour écrire — c'est ce qui donne à l'équipe de quoi
 * modérer — mais ça ne se lit nulle part sur la page.
 */
export function PublicComments({
  token,
  project,
  postId,
  comments,
  /** Le réglage du board. Faux = lecture seule : ce qui est écrit reste, le
      composeur disparaît. */
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
  /** Ouvre la porte OTP puis rejoue l'envoi (le patron du vote). */
  onNeedAuth: (run: () => void) => void;
}) {
  const t = useTranslations("PublicFeedback");
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (body: string) => {
    setError(null);
    startTransition(async () => {
      const result = await addPublicCommentAction(token, postId, body);
      if (result.ok) {
        setDraft("");
        router.refresh();
        return;
      }
      if (result.error === "notAuthenticated") {
        // La porte OTP, puis le MÊME texte : personne ne réécrit son message
        // parce qu'on lui a demandé son email au moment de l'envoyer.
        onNeedAuth(() => submit(body));
        return;
      }
      setError(result.error);
    });
  };

  const send = () => {
    const body = draft.trim();
    if (!body) return;
    submit(body);
  };

  const remove = (commentId: string) => {
    startTransition(async () => {
      await deletePublicCommentAction(token, postId, commentId);
      router.refresh();
    });
  };

  // Rien à lire et rien à écrire : la section entière disparaît. Un titre
  // « Commentaires » suivi d'un vide au-dessus d'un mot qui dit qu'ils sont
  // fermés, c'est trois lignes pour annoncer qu'il n'y a rien.
  if (comments.length === 0 && !allowComments) return null;

  return (
    <section className="flex flex-col gap-5 border-t pt-5">
      <h2 className="text-sm font-medium text-muted-foreground">
        {comments.length > 0 ? t("commentCount", { count: comments.length }) : t("comments")}
      </h2>

      {comments.length > 0 && (
        <ul className="flex flex-col gap-5">
          {comments.map((comment) => (
            <PublicCommentRow
              key={comment.id}
              comment={comment}
              project={project}
              onDelete={pending ? undefined : () => remove(comment.id)}
            />
          ))}
        </ul>
      )}

      {allowComments ? (
        <div className="flex flex-col gap-2">
          <AutoTextarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (!isSendShortcut(e)) return;
              e.preventDefault();
              send();
            }}
            placeholder={identity ? t("commentPlaceholder") : t("commentSignedOutPlaceholder")}
            maxLength={FEEDBACK_COMMENT_BODY_MAX}
            className="min-h-16 w-full resize-none rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring"
          />
          {error && (
            <p className="text-sm text-destructive">
              {error === "closed" ? t("commentsClosed") : t("commentFailed")}
            </p>
          )}
          <div className="flex items-center justify-between gap-3">
            {/* Dit AVANT d'écrire ce que la publication engage — c'est-à-dire
                rien de nominatif. Sans cette ligne, quelqu'un qui vient de
                donner son email pour voter n'a aucune raison de croire que son
                commentaire, lui, ne portera pas son nom. */}
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t("commentAnonymousNotice")}
            </p>
            <SendShortcutTooltip label={t("commentSend")}>
              <Button
                type="button"
                size="sm"
                disabled={pending || !draft.trim()}
                onClick={send}
                className="shrink-0"
              >
                {pending && <Spinner />}
                {t("commentSend")}
              </Button>
            </SendShortcutTooltip>
          </div>
        </div>
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
 * Un message du fil. Le gabarit est celui d'un commentaire de l'app — avatar,
 * signature, date, puis le texte — et c'est exactement celui que portait la
 * réponse d'équipe avant de devenir un message parmi d'autres.
 *
 * Deux voix, une seule forme : l'équipe se nomme (« Équipe <projet> », l'orbe
 * du produit en guise de visage), un visiteur ne se nomme pas du tout. Le
 * contraste EST l'information : sur ce fil, une seule des deux parties parle
 * au nom de quelque chose.
 */
function PublicCommentRow({
  comment,
  project,
  onDelete,
}: {
  comment: PublicComment;
  project: PublicProject;
  onDelete?: () => void;
}) {
  const t = useTranslations("PublicFeedback");
  const format = useFormatter();

  return (
    <li className="group flex flex-col gap-2">
      <div className="flex items-center gap-2">
        {comment.isTeam ? (
          <>
            <ProjectOrb
              seed={project.id}
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
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={t("commentDelete")}
                onClick={onDelete}
                className="ml-auto shrink-0 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
              >
                <Trash2 className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">{t("commentDelete")}</TooltipContent>
          </Tooltip>
        )}
      </div>
      {/* Saisi dans un textarea nu : du texte, pas du markdown. Le rendre en
          markdown mangerait un `*` ou un `#` écrit à la main. */}
      <p className="whitespace-pre-wrap text-sm leading-relaxed">{comment.body}</p>
    </li>
  );
}

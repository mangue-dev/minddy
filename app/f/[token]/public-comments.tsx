"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { CornerDownRight, Lock, Trash2 } from "lucide-react";
import { Button, Spinner, Tooltip, TooltipContent, TooltipTrigger, cn } from "mangue-ui";
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
 *
 * Profondeur ≤ 1 : on répond à un fil, jamais à une réponse. Un board de
 * retours n'est pas un forum, et l'arbre coûterait une navigation à des gens
 * venus dire une chose et voter.
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
  const [pending, startTransition] = useTransition();
  /** Le fil dont la zone de réponse est ouverte (id de sa racine). */
  const [replyingTo, setReplyingTo] = useState<string | null>(null);

  // Le serveur rend le fil à plat, du plus ancien au plus récent ; on le
  // regroupe ici, comme `useFeedbackTimeline` le fait côté équipe — une seule
  // convention de threading dans le dépôt, à relire au même endroit.
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
          // La porte OTP, puis le MÊME texte : personne ne réécrit son message
          // parce qu'on lui a demandé son email au moment de l'envoyer.
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

  // Rien à lire et rien à écrire : la section entière disparaît. Un titre
  // « Commentaires » suivi d'un vide au-dessus d'un mot qui dit qu'ils sont
  // fermés, c'est trois lignes pour annoncer qu'il n'y a rien.
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
                // Une racine à laquelle on a répondu ne se supprime plus : la
                // suppression emporte le fil, réponse de l'équipe comprise.
                onDelete={
                  pending || replies.length > 0 ? undefined : () => remove(root.id)
                }
                onReply={
                  allowComments ? () => setReplyingTo(replyingTo === root.id ? null : root.id) : undefined
                }
              />

              {(replies.length > 0 || replyingTo === root.id) && (
                /* Le filet vertical dit l'appartenance mieux qu'un simple
                   retrait : à deux niveaux, l'œil suit une ligne, pas une
                   marge. */
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
                        identity={identity}
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
          identity={identity}
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
 * La zone d'écriture — la même pour un nouveau message et pour une réponse.
 *
 * `onSubmit` rend le CODE d'erreur, ou null si c'est parti (ou si la porte
 * d'identité a pris la main) : le composeur garde alors son texte, et celui qui
 * vient d'écrire trois phrases ne les perd pas sur un échec réseau.
 */
function Composer({
  identity,
  pending,
  label,
  placeholder,
  notice,
  autoFocus,
  onCancel,
  onSubmit,
}: {
  identity: PublicIdentity | null;
  pending: boolean;
  label: string;
  placeholder: string;
  /** La ligne « votre commentaire n'affiche aucun nom » — sur le composeur
      principal seulement : la redire sous chaque réponse en ferait un
      avertissement, alors que c'est une information donnée une fois. */
  notice?: string;
  autoFocus?: boolean;
  onCancel?: () => void;
  onSubmit: (body: string) => Promise<string | null>;
}) {
  const t = useTranslations("PublicFeedback");
  const tCommon = useTranslations("Common");
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
          if (!isSendShortcut(e)) return;
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
        {/* Dit AVANT d'écrire ce que la publication engage — c'est-à-dire rien
            de nominatif. Sans cette ligne, quelqu'un qui vient de donner son
            email pour voter n'a aucune raison de croire que son commentaire,
            lui, ne portera pas son nom. */}
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
  onReply,
}: {
  comment: PublicComment;
  project: PublicProject;
  onDelete?: () => void;
  /** Absent sur les réponses : la profondeur s'arrête à un cran. */
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
          <IconAction
            label={t("commentDelete")}
            onClick={onDelete}
            className="ml-auto hover:text-destructive"
          >
            <Trash2 className="size-3.5" />
          </IconAction>
        )}
      </div>
      {/* Saisi dans un textarea nu : du texte, pas du markdown. Le rendre en
          markdown mangerait un `*` ou un `#` écrit à la main. */}
      <p className="whitespace-pre-wrap text-sm leading-relaxed">{comment.body}</p>
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

/** Bouton d'icône qui n'apparaît qu'au survol de son message (ou au clavier). */
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

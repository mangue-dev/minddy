"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { ArrowLeft, Ban, ChevronUp } from "lucide-react";
import { Badge, cn } from "mangue-ui";
import { StatusIndicator } from "@/components/issue-indicators";
import { UserAvatar } from "@/components/user-avatar";
import type { IssueStatus } from "@/lib/issue-constants";
import type {
  FeedbackPostStatus,
  PublicIdentity,
  PublicPost,
} from "@/lib/feedback/types";
import { togglePostVoteAction } from "./actions";

/** Briques partagées du board public : badge de statut (mêmes icônes que les
    statuts d'issue), vote en pill horizontal (style UserJot), avatars
    déterministes, et LA ligne de retour — celle du board comme celle de
    « mes retours ». */

/** Statut public → statut d'issue équivalent (pour l'icône Linear-style). */
export const FEEDBACK_TO_ISSUE_STATUS: Record<FeedbackPostStatus, IssueStatus> = {
  open: "backlog",
  planned: "todo",
  in_progress: "in_progress",
  shipped: "done",
  declined: "canceled",
  // Le spam n'a pas d'équivalent chez les tickets : il emprunte l'icône du
  // ticket annulé pour les endroits qui n'affichent QUE l'indicateur (le
  // sélecteur de statut), mais le badge, lui, se peint avec son propre signe.
  spam: "canceled",
};

/** Teintes du badge par statut — appariées à la couleur des icônes d'issue
    mais déclinées par thème : les hex des icônes (#FADB28…) sont pensés pour
    le dark et deviennent illisibles en texte sur fond clair. Chaque paire
    tient un contraste ≥ 4.5:1 ; null = neutre. */
const STATUS_BADGE_CLASSES: Record<FeedbackPostStatus, string | null> = {
  open: null,
  planned: null,
  in_progress:
    "border-amber-700/30 bg-amber-500/10 text-amber-700 dark:border-yellow-300/30 dark:bg-yellow-300/10 dark:text-yellow-300",
  shipped:
    "border-green-700/30 bg-green-500/10 text-green-700 dark:border-green-400/30 dark:bg-green-400/10 dark:text-green-400",
  declined:
    "border-red-700/30 bg-red-500/10 text-red-700 dark:border-red-400/30 dark:bg-red-400/10 dark:text-red-400",
  // Le spam ne se peint pas : il s'éteint. Une couleur d'alerte lui donnerait
  // le poids d'une décision à relire, alors qu'il est justement ce qu'on a
  // fini de regarder.
  spam: "border-border bg-muted text-muted-foreground",
};

/**
 * Le badge de statut d'un retour, partagé par le board public et la vue équipe.
 *
 * Il emprunte la FORME des badges du reste de l'app (`Badge` de mangue-ui, la
 * même hauteur que sur les pull requests et les sessions d'agent) plutôt que la
 * micro-pastille qu'il portait : quatre listes qui se ressemblent doivent se
 * ressembler, et un badge de 11 px au milieu de badges de 12 se lit comme un
 * badge de seconde classe.
 */
export function FeedbackStatusBadge({
  status,
  className,
}: {
  status: FeedbackPostStatus;
  className?: string;
}) {
  const t = useTranslations("PublicFeedback");
  return (
    <Badge
      variant="secondary"
      icon={
        status === "spam" ? (
          <Ban />
        ) : (
          <StatusIndicator status={FEEDBACK_TO_ISSUE_STATUS[status]} />
        )
      }
      className={cn(STATUS_BADGE_CLASSES[status] ?? "text-muted-foreground", className)}
    >
      {t(`status.${status}`)}
    </Badge>
  );
}

export function VoteButton({
  count,
  voted,
  onToggle,
  size = "md",
}: {
  count: number;
  voted: boolean;
  onToggle: () => void;
  size?: "md" | "sm";
}) {
  const t = useTranslations("PublicFeedback");
  return (
    <button
      type="button"
      aria-label={voted ? t("unvote") : t("vote")}
      aria-pressed={voted}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle();
      }}
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border font-semibold tabular-nums transition-colors",
        size === "md" ? "gap-1 px-3 py-1.5 text-sm" : "gap-0.5 px-2 py-0.5 text-xs",
        voted
          ? "border-primary/50 bg-primary/10 text-primary"
          : "text-muted-foreground hover:border-foreground/30 hover:text-foreground"
      )}
    >
      <ChevronUp className={size === "md" ? "size-4" : "size-3.5"} />
      {count}
    </button>
  );
}

/** Avatar du visiteur dans le header, la même marque abstraite que dans l'app :
    semée sur la graine de son compte minddy quand le SSO l'a identifié — le
    visage qu'il y connaît — et sinon sur son pseudonyme, les votants du board
    public étant anonymes. */
export function IdentityAvatar({
  identity,
  className,
}: {
  identity: PublicIdentity;
  className?: string;
}) {
  return (
    <UserAvatar
      seed={identity.avatarSeed ?? identity.pseudonym}
      className={cn("size-5", className)}
    />
  );
}

/**
 * L'avatar de celui qui a écrit le retour — semé sur son PSEUDONYME, jamais sur
 * son email ni son compte.
 *
 * Ce qu'il ajoute au board : deux retours du même auteur portent le même visage,
 * et une liste cesse d'être une pile de titres sans personne derrière. Ce qu'il
 * n'ajoute pas : un nom. Le pseudonyme lui-même ne s'affiche nulle part côté
 * public — l'avatar en est la seule trace, et il ne se remonte pas jusqu'à
 * quelqu'un.
 *
 * Sans auteur (saisie interne non rattachée), `UserAvatar` rend un disque neutre
 * plutôt qu'un visage : la ligne garde son gabarit, et on n'invente personne.
 */
export function AuthorAvatar({
  pseudonym,
  className,
}: {
  pseudonym: string | null;
  className?: string;
}) {
  return <UserAvatar seed={pseudonym} className={cn("size-4", className)} />;
}

/**
 * Le retour au board, depuis une page d'un retour comme depuis « mes retours ».
 *
 * Il portait le gabarit de la ligne de méta qu'il surplombe — même taille, même
 * gris, aucun fond — et se lisait donc comme une légende posée sous le header
 * plutôt que comme la commande qu'il est. Une pastille bordée lui rend la
 * silhouette d'un bouton, et la marge au-dessus le décolle du header.
 */
export function BackToBoardLink({ basePath }: { basePath: string }) {
  const t = useTranslations("PublicFeedback");
  return (
    <Link
      // basePath "" (domaine personnalisé) : la racine du board est "/".
      href={basePath || "/"}
      className="flex w-fit items-center gap-1.5 rounded-full border bg-muted/40 px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <ArrowLeft className="size-3.5" />
      {t("back")}
    </Link>
  );
}

/**
 * LA ligne d'un retour — la même sur le board et sur « mes retours ».
 *
 * Elle l'est parce que c'est le même objet : deux listes qui montrent le même
 * retour et ne le montrent pas pareil font douter qu'il s'agisse du même. Le
 * vote y est vivant partout, y compris depuis « mes retours » — une liste où le
 * geste central de la page d'à côté est éteint se lit comme une capture d'écran.
 *
 * Ce qui change d'une vue à l'autre passe par `meta` (les badges propres à la
 * vue : privé, en vérification, écrit/voté par moi) et `footer`.
 */
export function FeedbackPostRow({
  token,
  href,
  post,
  onNeedAuth,
  statusBadge,
  meta,
  footer,
}: {
  token: string;
  href: string;
  post: PublicPost;
  /** Ouvre la porte OTP puis rejoue le vote. Le board public en a besoin ; « mes
      retours » ne s'affiche que connecté et s'en passe. */
  onNeedAuth?: (run: () => void) => void;
  /**
   * Remplace le badge de statut. Ce n'est pas une variante de style : sur « mes
   * retours », un retour écarté par la modération ne dit pas « spam » à celui
   * qui l'a écrit — c'est le mot de l'équipe, pas une réponse à un visiteur.
   */
  statusBadge?: ReactNode;
  /** Badges propres à la vue, à la suite du statut et de la date. */
  meta?: ReactNode;
  /** Ligne libre sous la méta (« votre retour a été regroupé avec celui-ci »). */
  footer?: ReactNode;
}) {
  const format = useFormatter();
  const router = useRouter();
  const [optimistic, setOptimistic] = useState<{ voted: boolean; count: number } | null>(null);
  const voted = optimistic?.voted ?? post.votedByMe;
  const count = optimistic?.count ?? post.voteCount;

  const toggle = () => {
    const next = { voted: !voted, count: count + (voted ? -1 : 1) };
    setOptimistic(next);
    void togglePostVoteAction(token, post.id, next.voted)
      .then((result) => {
        if (!result.ok) {
          setOptimistic(null);
          if (result.notAuthenticated) onNeedAuth?.(toggle);
          return;
        }
        router.refresh();
      })
      .catch(() => setOptimistic(null));
  };

  return (
    <li className="flex flex-col gap-2 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Link href={href} className="group flex flex-col gap-1">
            <h3 className="text-[15px] font-semibold leading-snug group-hover:text-brand">
              {post.title}
            </h3>
            {post.body && (
              <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                {post.body}
              </p>
            )}
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <AuthorAvatar pseudonym={post.authorPseudonym} />
            {statusBadge ?? <FeedbackStatusBadge status={post.status} />}
            <span>{format.dateTime(new Date(post.createdAt), { dateStyle: "medium" })}</span>
            {meta}
          </div>
          {footer}
        </div>
        <VoteButton count={count} voted={voted} onToggle={toggle} />
      </div>
    </li>
  );
}

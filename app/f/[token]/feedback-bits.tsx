"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { ArrowLeft, Ban, ChevronUp, EyeOff, MessageSquare } from "lucide-react";
import { Badge, Button, Tooltip, TooltipContent, TooltipTrigger, cn } from "mangue-ui";
import { StatusIndicator } from "@/components/issue-indicators";
import { ProjectOrb } from "@/components/project-orb";
import { UserAvatar } from "@/components/user-avatar";
import type { IssueStatus } from "@/lib/issue-constants";
import type { MessageKey } from "@/lib/i18n-keys";
import {
  isHiddenFeedbackStatus,
  type FeedbackPostStatus,
  type PublicIdentity,
  type PublicPost,
  type PublicProject,
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
  projectName,
  className,
}: {
  status: FeedbackPostStatus;
  /**
   * Le nom du produit — et, en le passant, la demande d'une infobulle qui
   * EXPLIQUE l'état.
   *
   * Un visiteur du board ne connaît pas la convention : « Prévu » ne dit pas
   * qui l'a prévu ni ce que ça engage, et « Ouvert » se lit aussi bien
   * « personne ne l'a lu » que « c'est en discussion ». La phrase nomme
   * l'équipe qui a posé l'état, donc elle a besoin du projet. Côté équipe on ne
   * le passe pas : le mot y suffit, et la surface porte déjà ses propres
   * infobulles.
   */
  projectName?: string;
  className?: string;
}) {
  const t = useTranslations("PublicFeedback");
  const badge = (
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
  if (!projectName) return badge;
  return (
    <Tooltip>
      {/* Le `span` porte le déclencheur : `Badge` rend un `span` lui aussi, mais
          `asChild` a besoin d'un nœud à qui poser les handlers sans écraser les
          classes de teinte. */}
      <TooltipTrigger asChild>
        <span className="flex">{badge}</span>
      </TooltipTrigger>
      <TooltipContent side="top">
        {/* Clé assemblée à l'exécution (lib/i18n-keys.ts). */}
        {t(`statusHint.${status}` as MessageKey<"PublicFeedback">, { project: projectName })}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Le badge « non publié » de « mes retours ».
 *
 * Un retour absent du board l'est pour deux raisons — son auteur l'a gardé
 * privé, ou la modération l'a écarté — et elles ne se disent PAS à celui qui a
 * écrit. « Spam » est le mot de l'équipe, pas une réponse à un visiteur ; et un
 * badge « Privé » à côté d'un statut fait deux étiquettes pour une seule idée.
 * Un seul badge, un seul mot, la même infobulle dans les deux cas : ce n'est
 * pas sur le board, l'équipe l'a quand même.
 */
export function UnpublishedBadge({ projectName }: { projectName?: string }) {
  const t = useTranslations("PublicFeedback");
  const badge = (
    <Badge variant="secondary" icon={<EyeOff />} className="text-muted-foreground">
      {t("rejected")}
    </Badge>
  );
  if (!projectName) return badge;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="flex">{badge}</span>
      </TooltipTrigger>
      <TooltipContent side="top">
        {t("unpublishedHint", { project: projectName })}
      </TooltipContent>
    </Tooltip>
  );
}

export function VoteButton({
  count,
  voted,
  onToggle,
  size = "md",
  className,
}: {
  count: number;
  voted: boolean;
  onToggle: () => void;
  size?: "md" | "sm";
  className?: string;
}) {
  const t = useTranslations("PublicFeedback");
  // Le chevron et un nombre, sans un mot : ce que le clic FAIT ne se lit nulle
  // part, et il ne se devine pas non plus dans l'autre sens — un compteur déjà
  // allumé se retire, ce que la flèche vers le haut dit mal. La phrase dit le
  // geste et son sens courant, et sert d'étiquette accessible du même coup.
  const label = voted ? t("unvote") : t("vote");
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
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
              : // Pas voté n'est pas « éteint ». En gris sur transparent, le
                // geste central du board était l'élément le plus pâle de la
                // carte — et depuis que la carte s'allume au survol, son fond
                // remontait carrément sous le compteur. Il prend le fond des
                // chips neutres (`--control`) et son texte plein : un bouton
                // qu'on voit, dont l'état voté reste distinct par la teinte.
                "bg-control text-foreground hover:border-foreground/30 hover:bg-control-hover",
            className
          )}
        >
          <ChevronUp className={size === "md" ? "size-4" : "size-3.5"} />
          {count}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
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
 *
 * Sa taille est celle du badge d'état qu'il précède (`h-7`), et pas une taille
 * choisie pour lui : les deux ouvrent la même ligne de méta, et un visage de
 * 16 px devant un badge de 28 se lisait comme une puce de liste plutôt que
 * comme quelqu'un.
 */
export function AuthorAvatar({
  pseudonym,
  className,
}: {
  pseudonym: string | null;
  className?: string;
}) {
  return <UserAvatar seed={pseudonym} className={cn("size-7", className)} />;
}

/**
 * La discussion d'un retour, en un seul badge.
 *
 * Il en portait deux : « L'équipe a répondu » d'un côté, le nombre de
 * commentaires de l'autre — et jamais les deux à la fois, parce que côte à côte
 * ils disaient deux fois la même chose (il y a à lire là-dedans). Résultat, le
 * nombre disparaissait justement quand la discussion était la plus vivante :
 * celle où l'équipe a parlé.
 *
 * Un seul badge, donc, qui dit toujours COMBIEN. Ce que l'équipe ajoute passe
 * dans l'ICÔNE : l'orbe du projet, celle du header, au lieu de la bulle
 * générique. Une bulle dit « il y a des messages » ; l'orbe dit qu'un de ces
 * messages vient du produit — et c'est ça, la nouvelle. Le mot qu'on perd en
 * chemin est rendu par l'infobulle, parce qu'un logo de 14 px n'a jamais dit
 * « l'équipe a répondu » à qui ne le savait pas déjà.
 *
 * Pas de commentaire → pas de badge : un « 0 » n'est pas une information, c'est
 * une case vide qu'on a laissée dans la ligne.
 */
function FeedbackCommentsBadge({
  post,
  project,
}: {
  post: PublicPost;
  project: PublicProject;
}) {
  const t = useTranslations("PublicFeedback");
  if (post.commentCount === 0) return null;

  // L'équipe a parlé : son message est l'un de ceux qu'on compte.
  const teamIsIn = post.teamRepliedAt !== null;
  const badge = (
    <Badge
      variant="secondary"
      // Pas de teinte en plus : l'orbe du projet est déjà en couleur là où la
      // bulle est grise, et le badge d'état juste à côté peint DÉJÀ le sien
      // (« En cours » en ambre, « Livré » en vert). Deux badges colorés côte à
      // côte, et on ne sait plus lequel des deux est la nouvelle.
      icon={
        teamIsIn ? (
          <ProjectOrb
            seed={project.id}
            iconUrl={project.iconUrl}
            className="size-3.5 rounded-[4px]"
          />
        ) : (
          <MessageSquare />
        )
      }
    >
      {t("commentCount", { count: post.commentCount })}
    </Badge>
  );
  return (
    <Tooltip>
      {/* Le `span` porte le déclencheur : `Badge` rend un `span` lui aussi, mais
          `asChild` a besoin d'un nœud à qui poser les handlers sans écraser les
          classes de teinte. */}
      <TooltipTrigger asChild>
        <span className="flex">{badge}</span>
      </TooltipTrigger>
      <TooltipContent side="top">
        {teamIsIn ? t("teamRepliedHint", { project: project.name }) : t("commentsHint")}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * La date d'un retour, DITE.
 *
 * Une date nue au milieu d'une ligne de méta ne dit pas de quoi elle est la
 * date — création, dernier vote, réponse de l'équipe. Le verbe la fixe. Et il
 * change avec ce qu'on regarde : sur « mes retours » vivent des retours privés
 * et des retours en attente de vérification, qui ne sont publiés nulle part —
 * leur coller « Publié le » à côté d'un badge « Non publié » écrirait la
 * contradiction sur la même ligne.
 */
export function FeedbackPostedAt({ post }: { post: PublicPost }) {
  const t = useTranslations("PublicFeedback");
  const format = useFormatter();
  const date = format.dateTime(new Date(post.createdAt), { dateStyle: "medium" });
  const onBoard =
    post.isPublic && post.reviewState === "published" && !isHiddenFeedbackStatus(post.status);
  return <span>{onBoard ? t("postedOn", { date }) : t("sentOn", { date })}</span>;
}

/**
 * Le retour au board, depuis une page d'un retour comme depuis « mes retours ».
 *
 * C'est le SEUL chemin de sortie de ces deux pages : elles n'ont ni sidebar ni
 * fil d'Ariane, et le header ne porte que l'identité du visiteur. Il a donc le
 * gabarit d'un vrai bouton plein — pas la pastille grise de 24 px qu'il était,
 * qui portait la taille et la couleur de la ligne de méta juste en dessous et
 * se lisait comme une légende plutôt que comme la commande qu'il est.
 */
export function BackToBoardLink({ basePath }: { basePath: string }) {
  const t = useTranslations("PublicFeedback");
  return (
    <Button asChild className="w-fit">
      {/* basePath "" (domaine personnalisé) : la racine du board est "/". */}
      <Link href={basePath || "/"}>
        <ArrowLeft />
        {t("back")}
      </Link>
    </Button>
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
  project,
  onNeedAuth,
  statusBadge,
  meta,
  footer,
}: {
  token: string;
  href: string;
  post: PublicPost;
  /** Le produit : son nom nourrit les infobulles d'état, son icône signe le
      badge « L'équipe a répondu ». */
  project: PublicProject;
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
  const t = useTranslations("PublicFeedback");
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
    /* La cible du survol, c'est le RETOUR — pas son titre. Un titre qui bleuit
       désigne un lien au milieu d'une carte dont le reste ne réagit pas, et il
       fallait viser trois mots pour l'ouvrir. Le fond qui s'allume désigne la
       carte entière, et le lien s'étend derrière elle (`before:inset-0`) pour
       que la surface qui s'allume soit exactement celle qui s'ouvre. Ce qui
       doit rester cliquable par-dessus — le vote, les badges à infobulle — se
       repositionne (`relative`), sinon la nappe du lien le recouvre. */
    <li className="relative flex flex-col gap-2 rounded-lg px-3 py-3.5 transition-colors hover:bg-muted/50">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Link href={href} className="flex flex-col gap-1 before:absolute before:inset-0 before:content-['']">
            <h3 className="text-[15px] font-semibold leading-snug">{post.title}</h3>
            {post.body && (
              <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                {post.body}
              </p>
            )}
          </Link>
          <div className="relative mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <AuthorAvatar pseudonym={post.authorPseudonym} />
            {statusBadge ?? (
              <FeedbackStatusBadge status={post.status} projectName={project.name} />
            )}
            <FeedbackCommentsBadge post={post} project={project} />
            <FeedbackPostedAt post={post} />
            {meta}
          </div>
          {footer}
        </div>
        <VoteButton count={count} voted={voted} onToggle={toggle} className="relative" />
      </div>
    </li>
  );
}

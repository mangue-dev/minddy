"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, FileDiff, MessageSquare, Ticket } from "lucide-react";
import { cn, Spinner } from "mangue-ui";
import { Markdown } from "@/components/markdown";
import { ModelLogo } from "@/components/model-logo";
import { NumoIcon } from "@/components/numo-icon";
import { ReviewCommentBlock } from "@/components/pull-requests/pr-timeline";
import { WorkAccordion } from "@/components/assistant/work-accordion";
import { formatModelName } from "@/lib/model-display";
import { displayLineOf } from "@/lib/pr-review-threads";
import type { PullRequestReviewComment } from "@/lib/agent-api";
import type {
  FindingSeverity,
  PrReviewContextPayload,
  PrReviewErrorCode,
  PrReviewEvent,
  PrReviewFindingPayload,
  PrReviewPhase,
  PrReviewRun,
  PrReviewStatusPayload,
} from "@/lib/pr-review-run";
import type { PrReviewLive } from "@/lib/use-pr-review-session";

/**
 * La review de Numo DANS le fil de conversation, à l'endroit exact où son
 * message de verdict va tomber.
 *
 * C'est le point : une review est un message, pas un écran à part. Tant qu'elle
 * se joue, sa carte occupe la place du futur commentaire et montre ce que Numo
 * fait ; quand le commentaire arrive, la carte s'efface et le déroulé de la
 * passe se replie DANS ce commentaire, sous le même accordéon « A travaillé
 * pendant X » que le fil de l'agent de code. Rien ne bouge de place, rien ne
 * s'ouvre à côté.
 *
 * Deux surfaces, un seul contenu (`ReviewSteps`) : ce que Numo a lu, avec ses
 * chiffres, et chaque point au moment où il est déposé.
 */

/**
 * La passe en cours (ou qui vient de finir sans que son commentaire soit encore
 * arrivé), rendue comme un message du fil.
 */
export function PrReviewLiveCard({
  review,
  events,
  live,
  active,
}: {
  review: PrReviewRun;
  events: PrReviewEvent[];
  live: PrReviewLive | null;
  active: boolean;
}) {
  const t = useTranslations("PullRequests");
  const failed = review.status === "failed" || (review.status === "running" && !active);

  return (
    <li className="flex flex-col gap-1.5 rounded-lg border border-border bg-card px-3.5 py-3">
      <div className="flex items-center gap-2">
        <NumoIcon animated={active} className="size-5 shrink-0" />
        <span className="text-sm font-medium text-foreground">Numo</span>
        <span className={cn("min-w-0 truncate text-xs text-muted-foreground", active && "text-shimmer")}>
          {failed
            ? t("numoReviewFailedTitle")
            : active
              ? t(PHASE_TITLES[lastPhase(events)])
              : t("numoReviewDone")}
        </span>
        {active ? <Spinner className="shrink-0" /> : null}
        <span className="min-w-0 flex-1" />
        <span className="hidden shrink-0 items-center gap-1.5 text-xs text-muted-foreground/80 sm:flex">
          <ModelLogo model={review.model} size={12} />
          {formatModelName(review.model)}
        </span>
      </div>

      {/* Même respiration que sur le message de verdict : le déroulé ne colle
          pas à la ligne du nom. */}
      <div className="pt-1.5">
        <WorkAccordion
          startedAt={review.createdAt}
          endedAt={review.finishedAt}
          active={active}
        >
          <ReviewSteps events={events} />
        </WorkAccordion>
      </div>

      {/* La synthèse pendant qu'elle s'écrit — sous le déroulé, exactement où le
          message final se lira. Texte brut et non markdown : à mi-phrase, une
          syntaxe à moitié écrite rendrait n'importe quoi. */}
      {live?.summary ? (
        <p className="whitespace-pre-wrap text-sm text-foreground/80">{live.summary}</p>
      ) : null}

      {review.status === "running" && !active ? (
        <p className="text-xs text-muted-foreground">{t("numoReviewInterrupted")}</p>
      ) : null}
    </li>
  );
}

/**
 * Le déroulé de la passe, rattaché à son message de verdict. Même accordéon que
 * la carte en direct : c'est la même session, une fois qu'elle a un message.
 */
export function PrReviewActivity({
  review,
  events,
  comments,
}: {
  review: PrReviewRun;
  events: PrReviewEvent[];
  /** Les commentaires de review de la PR — de quoi rendre chaque point ANCRÉ
      comme il se rend partout ailleurs, extrait de code compris (MIN-159). */
  comments?: PullRequestReviewComment[];
}) {
  if (events.length === 0) return null;
  return (
    <WorkAccordion startedAt={review.createdAt} endedAt={review.finishedAt} active={false}>
      <ReviewSteps events={events} comments={comments} />
    </WorkAccordion>
  );
}

/** Ce que Numo a lu, puis ce qu'il a posé — dans l'ordre où ça a eu lieu. */
function ReviewSteps({
  events,
  comments,
}: {
  events: PrReviewEvent[];
  comments?: PullRequestReviewComment[];
}) {
  return (
    <ol className="flex flex-col gap-2">
      {events.map((event) => {
        switch (event.type) {
          case "context":
            return (
              <ContextRow key={event.id} payload={event.payload as PrReviewContextPayload} />
            );
          case "finding": {
            const payload = event.payload as PrReviewFindingPayload;
            return (
              <FindingRow
                key={event.id}
                payload={payload}
                comment={findAnchoredComment(payload, comments)}
              />
            );
          }
          case "error":
            return (
              <ErrorRow
                key={event.id}
                code={(event.payload as { code?: PrReviewErrorCode })?.code ?? "unknown"}
              />
            );
          // Les phases sont portées par l'en-tête de la carte ; la synthèse est
          // le message lui-même. Les répéter ici ferait dire deux fois la même
          // chose au même endroit.
          default:
            return null;
        }
      })}
    </ol>
  );
}

/** Titre de la phase en cours — le mot juste plutôt qu'un « chargement… ». */
const PHASE_TITLES: Record<
  PrReviewPhase,
  "numoReviewReading" | "numoReviewAnalyzing" | "numoReviewPosting" | "numoReviewDone"
> = {
  reading: "numoReviewReading",
  analyzing: "numoReviewAnalyzing",
  posting: "numoReviewPosting",
  finished: "numoReviewDone",
};

function lastPhase(events: PrReviewEvent[]): PrReviewPhase {
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (event.type === "status") return (event.payload as PrReviewStatusPayload).phase;
  }
  return "reading";
}

/** Une source lue, avec ses chiffres : sur une review, « d'où ça sort » vaut le
 *  verdict lui-même. */
function ContextRow({ payload }: { payload: PrReviewContextPayload }) {
  const t = useTranslations("PullRequests");

  const { icon, label } = useMemo(() => {
    if (payload.kind === "diff") {
      return {
        icon: <FileDiff className="size-3.5" />,
        label: t("numoReviewContextDiff", {
          files: payload.files,
          additions: payload.additions,
          deletions: payload.deletions,
        }),
      };
    }
    if (payload.kind === "issue") {
      return {
        icon: <Ticket className="size-3.5" />,
        label: payload.hasPlan
          ? t("numoReviewContextIssuePlan", { identifier: payload.identifier })
          : t("numoReviewContextIssue", { identifier: payload.identifier }),
      };
    }
    return {
      icon: <MessageSquare className="size-3.5" />,
      label: t("numoReviewContextConversation", {
        count: payload.comments + payload.reviews + payload.reviewComments,
      }),
    };
  }, [payload, t]);

  return (
    <li className="flex items-center gap-2 text-xs text-muted-foreground">
      <span className="shrink-0 text-muted-foreground/70">{icon}</span>
      <span className="min-w-0 truncate">{label}</span>
    </li>
  );
}

const SEVERITY_DOT: Record<FindingSeverity, string> = {
  blocker: "bg-red-500",
  risk: "bg-amber-500",
  nit: "bg-muted-foreground/40",
};

/**
 * Le commentaire de review qu'un point est DEVENU, quand il en est devenu un.
 *
 * `commentId` est la clé exacte, enregistrée à la pose (MIN-159). Les passes
 * d'avant ne l'ont pas : on retombe sur `fichier:ligne`, ce que la forge sait
 * encore rendre ambigu (deux points sur la même ligne), mais qui vaut mieux que
 * de perdre l'extrait de code sur tout l'historique.
 *
 * Rien pour un point REPLIÉ dans la synthèse : il n'est devenu aucun commentaire,
 * et en accrocher un serait montrer le code de quelqu'un d'autre.
 */
function findAnchoredComment(
  payload: PrReviewFindingPayload,
  comments: PullRequestReviewComment[] | undefined,
): PullRequestReviewComment | null {
  if (!payload.anchored || !comments?.length) return null;
  if (payload.commentId != null) {
    return comments.find((c) => c.id === payload.commentId) ?? null;
  }
  return (
    comments.find((c) => c.path === payload.path && displayLineOf(c) === payload.line) ?? null
  );
}

/**
 * Un point, tel qu'il a atterri.
 *
 * Ancré, il se rend EXACTEMENT comme dans l'activité de la PR — chemin, extrait
 * de code, puis le commentaire signé (`ReviewCommentBlock`). C'est le même objet
 * vu au même endroit de la page : lui donner ici une seconde apparence, plus
 * pauvre, obligeait à comprendre deux fois la même chose.
 *
 * Replié dans la synthèse, il n'est devenu aucun commentaire : pas d'extrait à
 * montrer, et c'est justement ce que la mention à droite dit. Il garde donc sa
 * forme courte — c'est le seul cas où elle est la bonne. Même chose tant que les
 * commentaires ne sont pas redescendus de la forge (la passe EN COURS) : la
 * forme courte tient la place, et le bloc complet la remplace au refetch.
 *
 * La pastille de gravité reste dans les deux cas : elle est ce que Numo ajoute
 * au commentaire, et la forge ne la porte nulle part.
 */
function FindingRow({
  payload,
  comment,
}: {
  payload: PrReviewFindingPayload;
  comment: PullRequestReviewComment | null;
}) {
  const t = useTranslations("PullRequests");

  if (comment) {
    return (
      <li className="flex items-start gap-1.5">
        <span
          className={cn(
            "mt-2.5 size-1.5 shrink-0 rounded-full",
            SEVERITY_DOT[payload.severity],
          )}
          aria-hidden
        />
        <ul className="min-w-0 flex-1">
          <ReviewCommentBlock comment={comment} />
        </ul>
      </li>
    );
  }

  return (
    <li className="flex flex-col gap-1 rounded-md border border-border bg-background px-2.5 py-2">
      <span className="flex min-w-0 items-center gap-1.5">
        <span
          className={cn("size-1.5 shrink-0 rounded-full", SEVERITY_DOT[payload.severity])}
          aria-hidden
        />
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
          {payload.path}:{payload.line}
        </span>
        <span className="shrink-0 text-[0.65rem] text-muted-foreground/70">
          {t(payload.anchored ? "numoReviewFindingInline" : "numoReviewFindingSummary")}
        </span>
      </span>
      <Markdown className="text-sm text-foreground">{payload.body}</Markdown>
    </li>
  );
}

const ERROR_LABEL = {
  noDiff: "numoReviewErrorNoDiff",
  modelUnavailable: "numoReviewErrorModelUnavailable",
  modelRefused: "numoReviewErrorModelRefused",
  forge: "numoReviewErrorForge",
  unknown: "numoReviewErrorUnknown",
} as const;

function ErrorRow({ code }: { code: PrReviewErrorCode }) {
  const t = useTranslations("PullRequests");
  return (
    <li className="flex items-start gap-2 text-xs text-amber-600 dark:text-amber-500">
      <AlertTriangle className="mt-px size-3.5 shrink-0" />
      <span>{t(ERROR_LABEL[code] ?? ERROR_LABEL.unknown)}</span>
    </li>
  );
}

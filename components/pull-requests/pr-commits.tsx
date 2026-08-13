"use client";

import { useMemo, useState } from "react";
import { useFormatter, useNow, useTranslations } from "next-intl";
import {
  Badge,
  Button,
  Skeleton,
  cn,
} from "mangue-ui";
import { Check, Copy, ExternalLink, ShieldCheck } from "lucide-react";
import { AuthorNames, AuthorStack } from "@/components/git/author-stack";
import { PrCommitDiffSheet } from "@/components/pull-requests/pr-commit-diff-sheet";
import type { PullRequestCommit } from "@/lib/agent-api";
import { newestFirstPullRequestCommits } from "@/lib/pull-request-commits";
import type { RepoProviderId } from "@/lib/repo-providers";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Onglet Commits d'une pull request : ce qui la COMPOSE, dans l'ordre où le
 * travail s'est fait — la vue que minddy n'avait pas et qui obligeait à ouvrir
 * la forge pour savoir en combien de temps, et en combien de gestes, une PR
 * était arrivée là.
 *
 * Rendu calqué sur GitHub, parce que c'est un standard et pas un endroit à
 * personnaliser : groupes par jour, titre du commit, auteur + date relative,
 * SHA court en monospace (copiable), et le lien vers la forge. Le corps du
 * message — quand il y en a un — se déplie derrière le « … » de GitHub plutôt
 * que d'étirer chaque ligne à la hauteur de son plus long commit.
 */

/** Titre (1re ligne) et corps (le reste) d'un message de commit. */
function splitMessage(message: string): { title: string; body: string } {
  const newline = message.indexOf("\n");
  if (newline === -1) return { title: message.trim(), body: "" };
  return {
    title: message.slice(0, newline).trim(),
    body: message.slice(newline + 1).trim(),
  };
}

/** Les 7 premiers caractères, comme partout ailleurs dans git. */
function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

/**
 * Clé de groupe = le JOUR local du commit. Les commits sans date tombent tous
 * dans le même groupe vide : le rendu leur donne alors l'en-tête « Commits »
 * nu plutôt qu'une date inventée.
 */
function dayKey(authoredAt: string | null): string {
  if (!authoredAt) return "";
  const d = new Date(authoredAt);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

interface CommitDay {
  key: string;
  /** La date du groupe, ou null quand aucun de ses commits n'en porte une. */
  date: Date | null;
  commits: PullRequestCommit[];
}

/** Groupe consécutif par jour — la liste arrive déjà triée du plus récent. */
function groupByDay(commits: PullRequestCommit[]): CommitDay[] {
  const days: CommitDay[] = [];
  for (const commit of commits) {
    const key = dayKey(commit.authoredAt);
    const last = days[days.length - 1];
    if (last && last.key === key) {
      last.commits.push(commit);
      continue;
    }
    days.push({
      key,
      date: key && commit.authoredAt ? new Date(commit.authoredAt) : null,
      commits: [commit],
    });
  }
  return days;
}

/** Le SHA court, cliquable pour le copier — le geste qu'on vient chercher ici. */
function ShaButton({ sha }: { sha: string }) {
  const t = useTranslations("PullRequests");
  const [copied, setCopied] = useState(false);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-2 font-mono text-xs text-muted-foreground hover:text-foreground"
          onClick={() => {
            void navigator.clipboard.writeText(sha);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {shortSha(sha)}
          {copied ? (
            <Check className="size-3.5 text-emerald-500" />
          ) : (
            <Copy className="size-3.5 opacity-60" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">{copied ? t("shaCopied") : t("copySha")}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Le poids du commit, et la porte d'entrée de son diff : ce que ce commit-là
 * change, tout seul, dans le panneau latéral. C'est le chiffre qu'on regarde
 * avant de décider si le commit mérite qu'on l'ouvre — autant qu'il soit le
 * bouton qui l'ouvre.
 */
function CommitStats({
  additions,
  deletions,
  onOpen,
}: {
  additions: number;
  deletions: number;
  onOpen: () => void;
}) {
  const t = useTranslations("PullRequests");
  const format = useFormatter();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-2 font-medium tabular-nums"
          onClick={onOpen}
        >
          <span className="text-green-700 dark:text-green-500">
            +{format.number(additions)}
          </span>
          <span className="text-red-700 dark:text-red-500">
            −{format.number(deletions)}
          </span>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">{t("viewCommitDiff")}</TooltipContent>
    </Tooltip>
  );
}

function CommitRow({
  commit,
  provider,
  onOpenDiff,
}: {
  commit: PullRequestCommit;
  provider: RepoProviderId;
  /** Ouvre le diff de CE commit dans le panneau latéral. */
  onOpenDiff: (sha: string) => void;
}) {
  const t = useTranslations("PullRequests");
  const format = useFormatter();
  const now = useNow();
  const [showBody, setShowBody] = useState(false);
  const { title, body } = useMemo(() => splitMessage(commit.message), [commit.message]);

  // TOUS les auteurs, principal en tête (MIN-159) : un commit co-signé en a
  // plusieurs, et c'est le cas courant dès qu'un agent a tenu le clavier. Le
  // repli — la forge n'a pas répondu, ou la réponse en cache date d'avant le
  // déploiement qui a ajouté le champ — est l'auteur principal seul, exactement
  // ce que cette vue affichait avant.
  const authors =
    commit.authors?.length
      ? commit.authors
      : commit.author || commit.authorName
        ? [
            {
              login: commit.author?.login ?? null,
              name: commit.authorName ?? commit.author?.login ?? commit.sha,
              avatar_url: commit.author?.avatar_url ?? null,
            },
          ]
        : [];

  return (
    <li className="flex items-start gap-3 px-3.5 py-3">
      <AuthorStack authors={authors} className="mt-0.5" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 items-start gap-1.5">
          {/* Le titre ouvre le diff, comme il ouvre le commit sur GitHub : c'est
              le geste qu'on tente d'abord, et l'indicateur +/− à droite fait la
              même chose pour qui vise le chiffre. */}
          <button
            type="button"
            onClick={() => onOpenDiff(commit.sha)}
            className="min-w-0 flex-1 cursor-pointer text-left text-sm leading-snug font-medium break-words outline-none hover:text-brand hover:underline focus-visible:text-brand focus-visible:underline"
          >
            {title || t("commitNoMessage")}
          </button>
          {/* Le « … » de GitHub : le corps du message est souvent long et
              rarement lu — il se déplie, il n'occupe pas la liste. */}
          {body ? (
            <Button
              variant="ghost"
              size="sm"
              aria-expanded={showBody}
              className={cn(
                "h-5 shrink-0 px-1.5 font-mono text-xs leading-none text-muted-foreground",
                showBody && "bg-muted text-foreground",
              )}
              onClick={() => setShowBody((v) => !v)}
            >
              …
              <span className="sr-only">{t("commitMessageToggle")}</span>
            </Button>
          ) : null}
        </div>
        {showBody && body ? (
          <pre className="overflow-x-auto rounded-md bg-muted/50 px-2.5 py-2 font-mono text-xs whitespace-pre-wrap text-muted-foreground">
            {body}
          </pre>
        ) : null}
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
          <AuthorNames authors={authors} />
          {commit.authoredAt ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  {t("committedAt", {
                    time: format.relativeTime(new Date(commit.authoredAt), now),
                  })}
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {format.dateTime(new Date(commit.authoredAt), {
                  dateStyle: "long",
                  timeStyle: "short",
                })}
              </TooltipContent>
            </Tooltip>
          ) : null}
        </p>
      </div>
      {/* Signature : affichée seulement quand la forge l'a VÉRIFIÉE. `null` veut
          dire « on ne sait pas » (GitLab), et un « non vérifié » sur tous les
          commits d'une MR ferait passer un silence pour un défaut. */}
      {commit.verified ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant="secondary"
              icon={<ShieldCheck className="size-3" />}
              className="mt-0.5 h-6 shrink-0 border-emerald-600/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-500"
            >
              {t("commitVerified")}
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="bottom">{t("commitVerifiedHint")}</TooltipContent>
        </Tooltip>
      ) : null}
      <div className="flex shrink-0 items-center">
        {/* Muet quand la forge n'a pas su donner les chiffres : « +0 −0 » se
            lirait comme un commit vide, et ce n'est pas ce qu'on sait. */}
        {commit.additions != null && commit.deletions != null ? (
          <CommitStats
            additions={commit.additions}
            deletions={commit.deletions}
            onOpen={() => onOpenDiff(commit.sha)}
          />
        ) : null}
        <ShaButton sha={commit.sha} />
        {commit.url ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <a
                href={commit.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <ExternalLink className="size-3.5" />
                <span className="sr-only">
                  {t(provider === "gitlab" ? "viewOnGitlab" : "viewOnGithub")}
                </span>
              </a>
            </TooltipTrigger>
            <TooltipContent side="top">
              {t(provider === "gitlab" ? "viewOnGitlab" : "viewOnGithub")}
            </TooltipContent>
          </Tooltip>
        ) : null}
      </div>
    </li>
  );
}

export function PrCommits({
  prId,
  commits,
  truncated,
  loading,
  provider,
}: {
  prId: string;
  commits: PullRequestCommit[];
  /** La PR a plus de commits que minddy n'en liste d'un coup. */
  truncated: boolean;
  loading: boolean;
  provider: RepoProviderId;
}) {
  const t = useTranslations("PullRequests");
  const format = useFormatter();
  const days = useMemo(
    () => groupByDay(newestFirstPullRequestCommits(commits)),
    [commits],
  );
  // Le commit dont on regarde le diff, et l'ouverture du panneau — deux états
  // et non un : le sha doit SURVIVRE à la fermeture, que Radix anime.
  const [diffSha, setDiffSha] = useState<string | null>(null);
  const [diffOpen, setDiffOpen] = useState(false);
  const openDiff = (sha: string) => {
    setDiffSha(sha);
    setDiffOpen(true);
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-32 rounded-lg" />
      </div>
    );
  }
  if (commits.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("noCommits")}</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {days.map((day) => (
        <div key={day.key || "undated"} className="flex flex-col gap-2">
          <h3 className="text-xs font-medium text-muted-foreground">
            {day.date
              ? t("commitsOnDate", {
                  date: format.dateTime(day.date, { dateStyle: "long" }),
                })
              : t("commitsUndated")}
          </h3>
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
            {day.commits.map((commit) => (
              <CommitRow
                key={commit.sha}
                commit={commit}
                provider={provider}
                onOpenDiff={openDiff}
              />
            ))}
          </ul>
        </div>
      ))}
      {truncated ? (
        <p className="text-xs text-muted-foreground">{t("commitsTruncated")}</p>
      ) : null}

      <PrCommitDiffSheet
        prId={prId}
        sha={diffSha}
        open={diffOpen}
        provider={provider}
        onOpenChange={setDiffOpen}
      />
    </div>
  );
}

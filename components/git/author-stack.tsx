"use client";

import { useTranslations } from "next-intl";
import { cn } from "mangue-ui";
import { BotBadge } from "@/components/git/git-login";
import { UserAvatar } from "@/components/user-avatar";
import { parseForgeLogin } from "@/lib/repo-providers";
import type { CommitAuthor } from "@/lib/commit-authors";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Les auteurs d'un commit, empilés — la forme que les forges donnent à un commit
 * CO-SIGNÉ (MIN-159).
 *
 * Ce n'est pas un détail dans minddy : tout commit écrit avec un agent porte un
 * `Co-authored-by:`, donc la quasi-totalité des commits qu'on y lit ont deux
 * auteurs. N'en montrer qu'un attribuait tout le travail à une seule personne.
 *
 * Les avatars se chevauchent plutôt que de s'aligner : la pile dit « une seule
 * paternité, partagée », là où une rangée espacée aurait fait lire plusieurs
 * gestes distincts. Un auteur seul rend exactement l'avatar d'avant — le cas
 * courant reste intact.
 */
export function AuthorStack({
  authors,
  className,
  size = "size-6",
}: {
  authors: CommitAuthor[];
  className?: string;
  /** Classe de taille des avatars — la pile suit ce que la vue lui donne. */
  size?: string;
}) {
  if (authors.length === 0) return null;
  return (
    <span className={cn("flex shrink-0 items-center", className)}>
      {authors.map((author, i) => (
        <Tooltip key={`${author.login ?? author.name}:${i}`}>
          <TooltipTrigger asChild>
            <span
              className={cn(
                // Chaque avatar mord sur le précédent, et l'anneau de la couleur
                // du fond détache celui du dessus : sans lui, deux photos sombres
                // se lisent comme une seule tache.
                i > 0 && "-ml-1.5 ring-2 ring-card",
                "shrink-0 rounded-full",
              )}
              // Empilés du premier au dernier, l'auteur principal DEVANT.
              style={{ zIndex: authors.length - i }}
            >
              <UserAvatar
                url={author.avatar_url}
                seed={author.login ?? author.name}
                className={size}
              />
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom">{author.login ?? author.name}</TooltipContent>
        </Tooltip>
      ))}
    </span>
  );
}

/**
 * Les mêmes auteurs, en toutes lettres : « untel et untel », « untel et 2 autres ».
 *
 * Deux noms tiennent sur une ligne ; au-delà, la ligne se casserait et c'est le
 * NOMBRE qui informe — la pile d'avatars juste à côté dit déjà qui.
 */
export function AuthorNames({
  authors,
  className,
}: {
  authors: CommitAuthor[];
  className?: string;
}) {
  const t = useTranslations("PullRequests");
  if (authors.length === 0) return null;

  const display = (a: CommitAuthor) =>
    (a.login ? parseForgeLogin(a.login).name : null) ?? a.name;
  const isBot = (a: CommitAuthor) => !!a.login && parseForgeLogin(a.login).isBot;

  const [first, second] = authors;
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
      <span className="min-w-0 truncate font-medium text-foreground/80">
        {authors.length === 1
          ? display(first)
          : authors.length === 2
            ? t("authorsPair", { first: display(first), second: display(second) })
            : t("authorsMore", { first: display(first), count: authors.length - 1 })}
      </span>
      {/* La pastille ne suit que l'auteur PRINCIPAL : accolée à une énumération,
          elle ne dirait plus de qui elle parle. */}
      {authors.length === 1 && isBot(first) ? <BotBadge /> : null}
    </span>
  );
}

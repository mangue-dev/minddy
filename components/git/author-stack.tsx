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
 * Authors of a commit, stacked — the shape that forges give to a commit
 * CO-SIGNED (MIN-159).
 *
 * This is not a detail in minddy: any commit written with an agent carries a
 * `Co-authored-by:`, so almost all of the commits we read there have two
 * authors. Showing only one assigned all the work to one person.
 *
 * The avatars overlap rather than align: the stack says "only one
 * paternity, shared", where a spaced row would have made several people read
 * distinct gestures. A single author renders exactly the avatar from before — the case
 * current one remains intact.
 */
export function AuthorStack({
  authors,
  className,
  size = "size-6",
}: {
  authors: CommitAuthor[];
  className?: string;
  /** Avatar size class — the stack follows what the view tells it to be. */
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
                // Each avatar bites on the previous one, and the ring of color
                // at the bottom detaches the one above: without it, two dark photos
                // read like a single spot.
                i > 0 && "-ml-1.5 ring-2 ring-card",
                "shrink-0 rounded-full",
              )}
              // Stacked from first to last, with the main author IN FRONT.
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
 * The same authors, in full: “so-and-so”, “so-and-so and 2 others”.
 *
 * Two names fit on one line; beyond that, the line would break and it is
 * NUMBER that informs — the pile of avatars right next to it already says who.
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
      {/* The pastille only follows the MAIN author: attached to a list,
          elle ne dirait plus de qui elle parle. */}
      {authors.length === 1 && isBot(first) ? <BotBadge /> : null}
    </span>
  );
}

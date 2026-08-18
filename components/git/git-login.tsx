"use client";

import { useTranslations } from "next-intl";
import { Badge, cn } from "mangue-ui";
import { parseForgeLogin } from "@/lib/repo-providers";

/**
 * A forge login, rendered as GitHub renders it: the name, and — if the account is
 * an App — a small “bot” badge instead of `[bot]` in full.
 * The suffix says an account TYPE, not a name; writing it raw makes it read
 * like a copying error, and lengthens an already tight line.
 *
 * The BRUT login remains carried by `title`: he is the one we are looking for to find
 * the account at the forge, and the tablet must not make it untraceable.
 *
 * Only one place for this rule, because a forge login appears in
 * five views (PR thread, line comments, list of PRs, its filter
 * author, ticket history) and that they do not have to agree by hand.
 */
export function GitLogin({
  login,
  className,
}: {
  /** Absent = unknown author (the forge does not always give it): “—”. */
  login: string | null | undefined;
  /** NAME styles (size, fat) — the pastille keeps its own. */
  className?: string;
}) {
  const parsed = login ? parseForgeLogin(login) : null;

  // A single template for both cases: these logins all live in one line
  // tight, and it is the name—never the pastille—that must give way.
  return (
    <span className="inline-flex min-w-0 items-center gap-1" title={login ?? undefined}>
      <span className={cn("min-w-0 truncate", className)}>{parsed?.name ?? "—"}</span>
      {parsed?.isBot ? <BotBadge /> : null}
    </span>
  );
}

/**
 * The sticker alone, for places where the login is embedded in a sentence
 * translated (“Opened by {login}”) and cannot go through `GitLogin`.
 */
export function BotBadge({ className }: { className?: string }) {
  const t = useTranslations("Common");
  return (
    <Badge
      variant="secondary"
      // Lighter shade than the full `secondary`: the tablet marks a type
      // ultimately, it should not weigh as much as the name it follows.
      className={cn(
        "h-5 shrink-0 border-border/60 bg-muted/40 px-2 text-[11px] font-medium tracking-wide",
        className,
      )}
    >
      {t("botAccount")}
    </Badge>
  );
}

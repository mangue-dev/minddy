"use client";

import { Github, Gitlab } from "@/components/git/provider-icons";
import type { RepoProviderId } from "@/lib/repo-providers";

/**
 * Logo of the integration that runs a check: its own image at the forge when
 * there is one, otherwise the forge icon — GitHub Actions shows as GitHub,
 * the CI is GitLab, and there is no other logo to show.
 *
 * Neutral background behind the image: many of these logos are transparent and
 * monochrome — without it, a black logo disappears in a dark theme.
 */
export function CheckLogo({
  url,
  provider,
}: {
  url: string | null;
  provider: RepoProviderId;
}) {
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        className="size-5 shrink-0 rounded-[4px] bg-muted object-cover"
      />
    );
  }
  const Icon = provider === "gitlab" ? Gitlab : Github;
  return (
    <Icon className="size-5 shrink-0 rounded-[4px] bg-muted p-0.5 text-muted-foreground" />
  );
}

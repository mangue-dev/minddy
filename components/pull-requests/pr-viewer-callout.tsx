"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Spinner, toast } from "mangue-ui";
import { Github, Gitlab } from "lucide-react";
import { startGitIdentityConnectApi } from "@/lib/git-integration-api";
import { getRepoProvider } from "@/lib/repo-providers";
import type { PrViewer } from "@/lib/agent-api";

/**
 * The ONLY place where minddy explains what you can do on this PR
 * (MIN-144), placed above the tabs. Elsewhere, the writing affordances
 * DISAPPEAR rather than remaining grayed out: six buttons deactivated without reason
 * say nothing, a sentence says it once.
 *
 * Three messages, and nothing at all when all is well (`capability === "write"`) :
 * • no git account connected → the button that authorizes it;
 * • account connected without rights to this repository → the link to the repository ;
 * • read rights only → “you can comment, not merge”.
 */
export function PrViewerCallout({
  viewer,
  repoUrl,
}: {
  viewer: PrViewer | null;
  /** Link to the PR at the forge - enough to ask for access. */
  repoUrl?: string | null;
}) {
  const t = useTranslations("PullRequests");
  const [connecting, setConnecting] = useState(false);

  // As long as the GET has not responded, we say nothing: a blindfold which
  // appears then disappears with each poll would be worse than silence.
  if (!viewer || viewer.capability === "write") return null;

  const providerName = getRepoProvider(viewer.provider).displayName;
  const Icon = viewer.provider === "gitlab" ? Gitlab : Github;

  const connect = async () => {
    if (connecting) return;
    setConnecting(true);
    try {
      const { url } = await startGitIdentityConnectApi(viewer.provider, "pr");
      window.location.href = url;
    } catch (err) {
      toast.error((err as Error).message);
      setConnecting(false);
    }
  };

  // Five causes, never confused. The two traitors are the last.
  // When the instance doesn't have anything to authorize, it's NOT "you don't have
  // account » — saying it this way accuses the user of a server configuration
  // absent, and lets it look for a button that doesn't exist. And when the forge
  // refuse the token from an account that is connected, this is NOT a right
  // degraded: saying it this way acknowledges one's rights on the deposit - to the point of announcing to
  // owner of the repository that he cannot merge into it.
  const { title, body } = !viewer.connected
    ? !viewer.configured
      ? {
          title: t("viewerProviderUnavailableTitle", { provider: providerName }),
          body: t("viewerProviderUnavailable", { provider: providerName }),
        }
      : viewer.expired
        ? {
            title: t("viewerAccountExpiredTitle", { provider: providerName }),
            body: t("viewerAccountExpiredBody", { provider: providerName }),
          }
        : {
            title: t("viewerNoAccountTitle", { provider: providerName }),
            body: t("viewerNoAccountBody", { provider: providerName }),
          }
    : viewer.capability === "none"
      ? {
          title: t("viewerNoRepoAccessTitle", { provider: providerName }),
          body: t("viewerNoRepoAccessBody", { provider: providerName }),
        }
      : { title: null, body: t("viewerReadOnlyBody") };

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-3.5 py-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        {title ? <p className="text-sm font-medium">{title}</p> : null}
        <p className="text-xs text-muted-foreground">{body}</p>
      </div>
      {/* The button only exists if it leads somewhere: without server-side env
 (self-host), the authorization would respond 400 — the message alone is enough. */}
      {!viewer.connected && viewer.configured ? (
        <Button size="sm" variant="outline" onClick={() => void connect()} disabled={connecting}>
          {connecting ? <Spinner /> : null}
          {t(viewer.expired ? "viewerReauthorizeAccount" : "viewerConnectAccount", {
            provider: providerName,
          })}
        </Button>
      ) : null}
      {viewer.connected && viewer.capability === "none" && repoUrl ? (
        <a
          href={repoUrl}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 text-xs text-brand hover:underline"
        >
          {t(viewer.provider === "gitlab" ? "viewOnGitlab" : "viewOnGithub")}
        </a>
      ) : null}
    </div>
  );
}

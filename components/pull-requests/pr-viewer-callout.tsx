"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Spinner, toast } from "mangue-ui";
import { Github, Gitlab } from "lucide-react";
import { startGitIdentityConnectApi } from "@/lib/git-integration-api";
import { getRepoProvider } from "@/lib/repo-providers";
import type { PrViewer } from "@/lib/agent-api";

/**
 * Le SEUL endroit où minddy explique ce que vous pouvez faire sur cette PR
 * (MIN-144), posé au-dessus des onglets. Ailleurs, les affordances d'écriture
 * DISPARAISSENT plutôt que de rester grisées : six boutons désactivés sans motif
 * ne disent rien, une phrase le dit une fois.
 *
 * Trois messages, et rien du tout quand tout va bien (`capability === "write"`) :
 *  • aucun compte git connecté → le bouton qui l'autorise ;
 *  • compte connecté sans droit sur ce dépôt → le lien vers le dépôt ;
 *  • droit de lecture seulement → « vous pouvez commenter, pas fusionner ».
 */
export function PrViewerCallout({
  viewer,
  repoUrl,
}: {
  viewer: PrViewer | null;
  /** Lien vers la PR chez la forge — de quoi aller demander l'accès. */
  repoUrl?: string | null;
}) {
  const t = useTranslations("PullRequests");
  const [connecting, setConnecting] = useState(false);

  // Tant que le GET n'a pas répondu, on ne raconte rien : un bandeau qui
  // apparaît puis disparaît à chaque poll serait pire que le silence.
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

  // Quatre causes, jamais confondues. La plus traître est la dernière : quand
  // l'instance n'a pas de quoi autoriser, ce n'est PAS « vous n'avez pas de
  // compte » — le dire ainsi accuse l'utilisateur d'une configuration serveur
  // absente, et le laisse chercher un bouton qui n'existe pas.
  const { title, body } = !viewer.connected
    ? viewer.configured
      ? {
          title: t("viewerNoAccountTitle", { provider: providerName }),
          body: t("viewerNoAccountBody", { provider: providerName }),
        }
      : {
          title: t("viewerProviderUnavailableTitle", { provider: providerName }),
          body: t("viewerProviderUnavailable", { provider: providerName }),
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
      {/* Le bouton n'existe que s'il mène quelque part : sans env côté serveur
          (self-host), l'autorisation répondrait 400 — le message seul suffit. */}
      {!viewer.connected && viewer.configured ? (
        <Button size="sm" variant="outline" onClick={() => void connect()} disabled={connecting}>
          {connecting ? <Spinner /> : null}
          {t("viewerConnectAccount", { provider: providerName })}
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

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, CheckCircle2, CircleAlert, Loader2 } from "lucide-react";
import { Github } from "@/components/git/provider-icons";
import { gitConnectionsQueryKey } from "@/lib/use-git-connections-query";
import { gitIdentitiesQueryKey } from "@/lib/use-git-identities-query";
import { useTranslations } from "next-intl";

/**
 * Claim interstitial for the managed forge relay (docs/managed-forge-relay-plan.md).
 *
 * On a relay-only instance, connecting GitHub does not redirect straight to
 * github.com: the installation is bound to THIS instance through the relay
 * claim flow. This page opens the claim URL in a new tab (Cloud → standard
 * GitHub App installation page), polls the instance until the claim resolves,
 * then returns the user where they came from.
 *
 * The claim URL never transits the query string: the poll returns it,
 * derived server-side from the pinned relay configuration, so this page can
 * only ever open the instance's own claim page.
 */

const POLL_INTERVAL_MS = 2_000;
const POLL_MAX_MS = 10 * 60_000;

function safeReturnPath(value: string | null): string {
  return value && value.startsWith("/") && !value.startsWith("//")
    ? value
    : "/settings?tab=git";
}

export function RelayGithubConnect() {
  const t = useTranslations("RelayClaim");
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();

  const code = searchParams.get("code");
  const returnPath = safeReturnPath(searchParams.get("return"));

  const [status, setStatus] = useState<"waiting" | "connected" | "failed">(
    "waiting",
  );
  const [error, setError] = useState<string | null>(null);
  const [claimUrl, setClaimUrl] = useState<string | null>(null);
  const openedRef = useRef(false);

  const poll = useCallback(async () => {
    if (!code) return;
    try {
      const response = await fetch(
        `/api/git/github/relay-claim?code=${encodeURIComponent(code)}`,
      );
      const data = (await response.json()) as {
        status?: string;
        connectionId?: string;
        claimUrl?: string;
        error?: string;
      };
      if (data.claimUrl && typeof data.claimUrl === "string") {
        setClaimUrl(data.claimUrl);
      }
      if (!response.ok) {
        // A definite refusal (invalid or expired code) stops the loop;
        // transient server errors keep the wait going.
        if (response.status === 400 || response.status === 403) {
          setStatus("failed");
          setError(data.error ?? "refused");
        }
        return;
      }
      if (data.status === "connected") {
        setStatus("connected");
        void queryClient.invalidateQueries({
          queryKey: gitConnectionsQueryKey,
        });
        void queryClient.invalidateQueries({ queryKey: gitIdentitiesQueryKey });
        setTimeout(() => router.replace(returnPath), 800);
      }
    } catch {
      // Transient network error: keep polling until the deadline.
    }
  }, [code, queryClient, returnPath, router]);

  useEffect(() => {
    if (!code) {
      setStatus("failed");
      setError("missing-code");
      return;
    }
    const startedAt = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - startedAt > POLL_MAX_MS) {
        setStatus("failed");
        setError("timeout");
        return;
      }
      void poll();
    }, POLL_INTERVAL_MS);
    void poll();
    return () => clearInterval(timer);
  }, [code, poll]);

  // Try to open the claim page right away; popup blockers may refuse without
  // a user gesture, so the manual button below always stays available.
  useEffect(() => {
    if (openedRef.current || !claimUrl) return;
    openedRef.current = true;
    window.open(claimUrl, "_blank", "noopener,noreferrer");
  }, [claimUrl]);

  if (status === "connected") {
    return (
      <ClaimCard title={t("title")}>
        <CheckCircle2 className="h-10 w-10 text-primary" aria-hidden />
        <p className="text-sm text-muted-foreground">{t("connected")}</p>
      </ClaimCard>
    );
  }

  if (status === "failed") {
    return (
      <ClaimCard title={t("title")}>
        <CircleAlert className="h-10 w-10 text-destructive" aria-hidden />
        <p className="text-sm text-muted-foreground">
          {t("failed", { reason: error ?? "unknown" })}
        </p>
        <button
          type="button"
          onClick={() => router.replace(returnPath)}
          className="mt-2 inline-flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          {t("back")}
          <ArrowRight className="h-4 w-4" aria-hidden />
        </button>
      </ClaimCard>
    );
  }

  return (
    <ClaimCard title={t("title")}>
      <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
      <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
        {t("waiting")}
      </p>
      {claimUrl && (
        <a
          href={claimUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Github className="h-4 w-4" aria-hidden />
          {t("openGithub")}
          <ArrowRight className="h-4 w-4" aria-hidden />
        </a>
      )}
    </ClaimCard>
  );
}

function ClaimCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-lg flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-8 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Github className="h-4 w-4" aria-hidden />
          {title}
        </div>
        {children}
      </div>
    </div>
  );
}

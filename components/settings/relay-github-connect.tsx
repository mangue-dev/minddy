"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { AppIcon } from "@/components/icon";
import { AlertCircleIcon, CheckIcon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
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

type ClaimState =
  | { kind: "waiting" }
  | { kind: "connected" }
  | { kind: "failed"; reason: string };

/**
 * One poll of the claim endpoint. `result` is set only when the claim has
 * resolved; transient errors (network, 5xx, still pending) leave it empty so
 * the wait goes on.
 */
async function pollClaim(code: string): Promise<{
  claimUrl?: string;
  result?: Exclude<ClaimState, { kind: "waiting" }>;
}> {
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
    const claimUrl = typeof data.claimUrl === "string" && data.claimUrl ? data.claimUrl : undefined;
    if (!response.ok) {
      // A definite refusal (invalid or expired code) stops the loop;
      // transient server errors keep the wait going.
      if (response.status === 400 || response.status === 403) {
        return { claimUrl, result: { kind: "failed", reason: data.error ?? "refused" } };
      }
      return { claimUrl };
    }
    if (data.status === "connected") return { claimUrl, result: { kind: "connected" } };
    return { claimUrl };
  } catch {
    // Transient network error: keep polling until the deadline.
    return {};
  }
}

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

  // One lifecycle: waiting until the claim resolves, then a terminal state
  // that no later poll response can leave.
  const [state, setState] = useState<ClaimState>({ kind: "waiting" });
  const [claimUrl, setClaimUrl] = useState<string | null>(null);
  const openedRef = useRef(false);

  useEffect(() => {
    if (!code) {
      setState({ kind: "failed", reason: "missing-code" });
      return;
    }
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const startedAt = Date.now();
    const finish = (next: Exclude<ClaimState, { kind: "waiting" }>) => {
      stopped = true;
      setState(next);
      if (next.kind === "connected") {
        void queryClient.invalidateQueries({ queryKey: gitConnectionsQueryKey });
        void queryClient.invalidateQueries({ queryKey: gitIdentitiesQueryKey });
        timer = setTimeout(() => router.replace(returnPath), 800);
      }
    };
    // Each poll schedules the next one only once it has settled, so two
    // requests never overlap and nothing runs after a terminal state.
    const poll = async () => {
      if (stopped) return;
      if (Date.now() - startedAt > POLL_MAX_MS) {
        finish({ kind: "failed", reason: "timeout" });
        return;
      }
      const outcome = await pollClaim(code);
      if (stopped) return;
      if (outcome.claimUrl) setClaimUrl(outcome.claimUrl);
      if (outcome.result) {
        finish(outcome.result);
        return;
      }
      timer = setTimeout(() => { void poll(); }, POLL_INTERVAL_MS);
    };
    void poll();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [code, queryClient, returnPath, router]);

  // Try to open the claim page right away; popup blockers may refuse without
  // a user gesture, so the manual button below always stays available.
  useEffect(() => {
    if (openedRef.current || !claimUrl) return;
    openedRef.current = true;
    window.open(claimUrl, "_blank", "noopener,noreferrer");
  }, [claimUrl]);

  if (state.kind === "connected") {
    return (
      <ClaimCard title={t("title")}>
        <AppIcon icon={CheckIcon} className="h-10 w-10 text-primary" aria-hidden />
        <p className="text-sm text-muted-foreground">{t("connected")}</p>
      </ClaimCard>
    );
  }

  if (state.kind === "failed") {
    return (
      <ClaimCard title={t("title")}>
        <HugeiconsIcon icon={AlertCircleIcon} className="h-10 w-10 text-destructive" aria-hidden />
        <p role="alert" className="text-sm text-muted-foreground">
          {t("failed", { reason: state.reason })}
        </p>
        <Button type="button" variant="outline" className="mt-2" onClick={() => router.replace(returnPath)}>
          {t("back")}
        </Button>
      </ClaimCard>
    );
  }

  return (
    <ClaimCard title={t("title")}>
      {/* Running work: the waiting line shimmers instead of a spinner. */}
      <p role="status" className="text-shimmer max-w-md text-sm leading-relaxed text-muted-foreground">
        {t("waiting")}
      </p>
      {claimUrl && (
        <Button asChild className="mt-1">
          <a href={claimUrl} target="_blank" rel="noopener noreferrer">
            <Github aria-hidden />
            {t("openGithub")}
          </a>
        </Button>
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
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-8">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Github className="h-4 w-4" aria-hidden />
          {title}
        </div>
        {children}
      </div>
    </div>
  );
}

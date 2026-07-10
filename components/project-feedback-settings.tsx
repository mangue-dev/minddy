"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Input, Skeleton, Spinner, Switch, toast } from "mangue-ui";
import { Check, Copy, ExternalLink, RefreshCw } from "lucide-react";

/**
 * Réglages du board de feedback public (MIN-37) — onglet des settings projet.
 * Toggle de publication (la collecte API/interne/IA continue board éteint),
 * URL publique (token opaque, rotation), secret SSO HS256 (généré/rotaté ici,
 * réaffichable par le owner) et rappel des deux chaînes d'identité.
 */

interface BoardSettings {
  enabled: boolean;
  token: string;
  sso_secret: string | null;
  sso_configured: boolean;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  const data = (await response.json().catch(() => null)) as
    | (T & { error?: string })
    | null;
  if (!response.ok) throw new Error(data?.error || "error");
  return data as T;
}

export function ProjectFeedbackSettings({
  projectId,
  isOwner,
}: {
  projectId: string;
  isOwner: boolean;
}) {
  const t = useTranslations("Settings");
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const settingsPath = `/api/projects/${projectId}/feedback/settings`;

  const { data, isLoading } = useQuery({
    queryKey: ["feedback-settings", projectId],
    queryFn: () => api<{ board: BoardSettings | null }>(settingsPath),
  });
  const board = data?.board ?? null;

  const mutate = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      await queryClient.invalidateQueries({ queryKey: ["feedback-settings", projectId] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const setEnabled = (enabled: boolean) =>
    mutate(() =>
      api(settingsPath, { method: "PATCH", body: JSON.stringify({ enabled }) })
    );
  const post = (action: string) =>
    mutate(() => api(settingsPath, { method: "POST", body: JSON.stringify({ action }) }));

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-2/3" />
      </div>
    );
  }

  const publicUrl = board
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/f/${board.token}`
    : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <p className="text-sm font-medium">{t("feedbackEnable")}</p>
          <p className="text-xs text-muted-foreground">{t("feedbackEnableDesc")}</p>
        </div>
        <Switch
          checked={board?.enabled ?? false}
          disabled={busy || !isOwner}
          onCheckedChange={(v) => void setEnabled(v)}
        />
      </div>

      {board?.enabled && publicUrl && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">{t("feedbackUrl")}</p>
          <div className="flex items-center gap-2">
            <Input readOnly value={publicUrl} className="font-mono text-xs" />
            <CopyButton value={publicUrl} />
            <Button variant="ghost" size="icon-sm" asChild>
              <a href={publicUrl} target="_blank" rel="noreferrer" aria-label={t("feedbackUrl")}>
                <ExternalLink className="size-4" />
              </a>
            </Button>
          </div>
          {isOwner && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void post("rotate_token")}
              className="flex w-fit items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <RefreshCw className="size-3" />
              {t("feedbackRotateToken")}
            </button>
          )}
        </div>
      )}

      {board && (
        <div className="flex flex-col gap-2 border-t pt-5">
          <p className="text-sm font-medium">{t("feedbackSsoTitle")}</p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t("feedbackSsoDesc")}
          </p>
          {isOwner ? (
            board.sso_secret ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <Input readOnly value={board.sso_secret} className="font-mono text-xs" />
                  <CopyButton value={board.sso_secret} />
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void post("rotate_sso")}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <RefreshCw className="size-3" />
                    {t("feedbackSsoRotate")}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void post("clear_sso")}
                    className="text-xs text-destructive/80 transition-colors hover:text-destructive"
                  >
                    {t("feedbackSsoClear")}
                  </button>
                </div>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="w-fit"
                disabled={busy}
                onClick={() => void post("rotate_sso")}
              >
                {busy && <Spinner />}
                {t("feedbackSsoGenerate")}
              </Button>
            )
          ) : (
            <p className="text-xs text-muted-foreground">
              {board.sso_configured ? "✓" : "—"}
            </p>
          )}
        </div>
      )}

      <p className="border-t pt-5 text-xs leading-relaxed text-muted-foreground">
        {t("feedbackApiHint")}
      </p>
    </div>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Copy"
      onClick={() => {
        void navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check className="size-4 text-emerald-500" /> : <Copy className="size-4" />}
    </Button>
  );
}

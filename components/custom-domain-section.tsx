"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Input, Spinner, cn, toast } from "mangue-ui";
import { Check, Copy, RefreshCw } from "lucide-react";

/**
 * Section « Domaine personnalisé » (MIN-36), partagée entre les réglages du
 * board de feedback et le dialog de partage d'une vue — les deux routes API
 * (endpoint) exposent la même forme { configured, domain }. Invisible quand le
 * déploiement n'a pas les env VERCEL_* (configured=false) ou pour un
 * non-owner sans domaine configuré.
 */

export interface CustomDomainDns {
  type: "CNAME" | "TXT";
  name: string;
  value: string;
}

export interface CustomDomainStatus {
  domain: string;
  status: "pending" | "verified";
  misconfigured: boolean;
  dns: CustomDomainDns[];
}

export interface CustomDomainPayload {
  configured: boolean;
  /** Le serveur décide : owner du projet → mutations visibles. */
  can_manage: boolean;
  domain: CustomDomainStatus | null;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  const data = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok) throw new Error(data?.error || "error");
  return data as T;
}

/** Partagé avec les parents qui veulent lire le domaine (même queryKey). */
export function fetchCustomDomainApi(endpoint: string): Promise<CustomDomainPayload> {
  return api<CustomDomainPayload>(endpoint);
}

export function CustomDomainSection({
  endpoint,
  queryKey,
  className,
}: {
  /** Route API GET/PUT/DELETE, ex. /api/projects/<id>/feedback/domain. */
  endpoint: string;
  queryKey: readonly unknown[];
  /** Appliqué au conteneur — absent du DOM quand la section est masquée. */
  className?: string;
}) {
  const t = useTranslations("CustomDomain");
  const queryClient = useQueryClient();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => fetchCustomDomainApi(endpoint),
  });

  if (isLoading || !data) return null;
  const { configured, can_manage: canManage, domain } = data;
  // Déploiement sans env VERCEL_*, ou lecteur sans rien à voir : silence.
  if (!configured || (!domain && !canManage)) return null;

  const mutate = async (fn: () => Promise<CustomDomainPayload>) => {
    setBusy(true);
    try {
      const fresh = await fn();
      queryClient.setQueryData(queryKey, fresh);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    const value = input.trim();
    if (!value) return;
    void mutate(() =>
      api<CustomDomainPayload>(endpoint, {
        method: "PUT",
        body: JSON.stringify({ domain: value }),
      })
    ).then(() => setInput(""));
  };

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center gap-2">
        <p className="text-xs font-medium text-muted-foreground">{t("title")}</p>
        {domain &&
          (domain.status === "verified" ? (
            <Badge variant="secondary" className="border-brand/30 text-brand">
              {t("statusVerified")}
            </Badge>
          ) : (
            <Badge variant="secondary">{t("statusPending")}</Badge>
          ))}
      </div>

      {!domain ? (
        <>
          <p className="text-xs leading-relaxed text-muted-foreground">{t("description")}</p>
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t("placeholder")}
              className="font-mono text-xs"
              disabled={busy}
            />
            <Button
              type="submit"
              variant="outline"
              size="sm"
              className="shrink-0"
              disabled={busy || !input.trim()}
            >
              {busy && <Spinner />}
              {t("save")}
            </Button>
          </form>
          <p className="text-xs text-muted-foreground">{t("apexHint")}</p>
        </>
      ) : (
        <>
          <p className="font-mono text-xs">{domain.domain}</p>
          {domain.status !== "verified" && (
            <>
              <p className="text-xs leading-relaxed text-muted-foreground">{t("dnsIntro")}</p>
              <div className="flex flex-col gap-1 rounded-md border border-border bg-muted/40 px-3 py-2">
                {domain.dns.map((record) => (
                  <div
                    key={`${record.type}:${record.name}`}
                    className="flex items-center gap-2 font-mono text-xs"
                  >
                    <span className="w-12 shrink-0 text-muted-foreground">{record.type}</span>
                    <span className="min-w-0 flex-1 truncate">{record.name}</span>
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">
                      {record.value}
                    </span>
                    <CopyValueButton value={record.value} />
                  </div>
                ))}
              </div>
            </>
          )}
          {canManage && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void mutate(() => api<CustomDomainPayload>(`${endpoint}?refresh=1`))
                }
                className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <RefreshCw className="size-3" />
                {t("refresh")}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void mutate(() => api<CustomDomainPayload>(endpoint, { method: "DELETE" }))
                }
                className="text-xs text-destructive/80 transition-colors hover:text-destructive"
              >
                {t("remove")}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function CopyValueButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Copy"
      className="shrink-0"
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

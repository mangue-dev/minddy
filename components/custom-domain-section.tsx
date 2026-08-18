"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Input, Spinner, cn, toast } from "mangue-ui";
import { Check, Copy, ExternalLink, RefreshCw } from "lucide-react";

/**
 * “Custom domain” section (MIN-36), shared between the settings of the
 * feedback board and the view sharing dialog — both API routes
 * (endpoint) expose the same form { configured, domain }. Invisible when the
 * deployment does not have the VERCEL_* env (configured=false) or for a
 * non-owner with no domain configured.
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
  /** The server decides: project owner → visible mutations. */
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

/** Shared with parents who want to read the domain (same queryKey). */
export function fetchCustomDomainApi(endpoint: string): Promise<CustomDomainPayload> {
  return api<CustomDomainPayload>(endpoint);
}

export function CustomDomainSection({
  endpoint,
  queryKey,
  className,
  primaryUrlShown = false,
}: {
  /** Route API GET/PUT/DELETE, ex. /api/projects/<id>/feedback/domain. */
  endpoint: string;
  queryKey: readonly unknown[];
  /** Applied to container — absent from the DOM when the section is hidden. */
  className?: string;
  /** The parent already shows the verified domain as the primary public link:
   * we therefore do not repeat the value here (avoid duplication). */
  primaryUrlShown?: boolean;
}) {
  const t = useTranslations("CustomDomain");
  const queryClient = useQueryClient();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  const { data, isPending } = useQuery({
    queryKey,
    queryFn: () => fetchCustomDomainApi(endpoint),
  });

  if (isPending || !data) return null;
  const { configured, can_manage: canManage, domain } = data;
  // Deployment without env VERCEL_*, or reader with nothing to do: silence.
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

  const verified = domain?.status === "verified";

  return (
    <div className={cn("flex flex-col gap-2.5", className)}>
      {/* Header: title on the left, status aligned on the right. */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{t("title")}</p>
        {domain &&
          (verified ? (
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
          {/* No `<form>` here, and that's the only thing you need to know before you
 return one: this section lives IN surfaces that are already one — the view sharing dialog, a step in the returns configuration wizard. A form within a form is invalid HTML, which React flags for hydration. Hence the
 Entry key managed by hand, and the `type="button"`: without it, the
 button would submit the PARENT's form (the wizard step would advance,
 the sharing dialog would close). */}
          <div className="flex items-center gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                save();
              }}
              placeholder={t("placeholder")}
              className="font-mono text-xs"
              disabled={busy}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0"
              disabled={busy || !input.trim()}
              onClick={save}
            >
              {busy && <Spinner />}
              {t("save")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t("apexHint")}</p>
        </>
      ) : (
        <>
          {/* The domain value: clickable link if verified, otherwise plain text.
 Hidden if the parent already displays it as the primary public link. */}
          {!(primaryUrlShown && verified) &&
            (verified ? (
              <a
                href={`https://${domain.domain}`}
                target="_blank"
                rel="noreferrer"
                className="group flex w-fit items-center gap-1.5 font-mono text-xs transition-colors hover:text-brand"
              >
                {domain.domain}
                <ExternalLink className="size-3 opacity-60 transition-opacity group-hover:opacity-100" />
              </a>
            ) : (
              <p className="font-mono text-xs">{domain.domain}</p>
            ))}

          {!verified && (
            <>
              {/* The domain is of no use until it is verified (MIN-337).
 Say it here, otherwise the only thing the user observes is
 a 404 on a domain they have just configured. */}
              <p className="text-xs leading-relaxed text-muted-foreground">
                {t("pendingNotServing")}
              </p>
              <p className="text-xs leading-relaxed text-muted-foreground">{t("dnsIntro")}</p>
              <DnsTable records={domain.dns} />
            </>
          )}

          {canManage && (
            <div className="flex items-center justify-end gap-2">
              {!verified && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => void mutate(() => api<CustomDomainPayload>(`${endpoint}?refresh=1`))}
                >
                  {busy ? <Spinner /> : <RefreshCw className="size-3.5" />}
                  {t("refresh")}
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() =>
                  void mutate(() => api<CustomDomainPayload>(endpoint, { method: "DELETE" }))
                }
                className="text-destructive hover:text-destructive"
              >
                {t("remove")}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Table of DNS records to create: explicit headers (Type, Name,
 * Value, TTL) and copyable value. The TTL is free on the registrar side → “Auto”. */
function DnsTable({ records }: { records: CustomDomainDns[] }) {
  const t = useTranslations("CustomDomain");
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-border bg-muted/50 text-left text-muted-foreground">
            <th className="px-3 py-1.5 font-medium">Type</th>
            <th className="px-3 py-1.5 font-medium">{t("dnsName")}</th>
            <th className="px-3 py-1.5 font-medium">{t("dnsValue")}</th>
            <th className="px-3 py-1.5 font-medium">TTL</th>
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr
              key={`${record.type}:${record.name}`}
              className="border-b border-border align-top last:border-b-0"
            >
              <td className="px-3 py-2 font-mono">{record.type}</td>
              <td className="px-3 py-2 font-mono">
                <DnsValue value={record.name} />
              </td>
              <td className="px-3 py-2 font-mono">
                <DnsValue value={record.value} />
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">Auto</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** DNS cell: value (collapsible when long) + copy button. */
function DnsValue({ value }: { value: string }) {
  return (
    <div className="flex items-start gap-1.5">
      <span className="min-w-0 break-all">{value}</span>
      <CopyValueButton value={value} />
    </div>
  );
}

function CopyValueButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label="Copy"
      className="shrink-0 text-muted-foreground/70 transition-colors hover:text-foreground"
      onClick={() => {
        void navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? (
        <Check className="size-3.5 text-emerald-500" />
      ) : (
        <Copy className="size-3.5" />
      )}
    </button>
  );
}

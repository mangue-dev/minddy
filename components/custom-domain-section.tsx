"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Input, Spinner, cn, toast } from "mangue-ui";
import { Check, Copy, ExternalLink, RefreshCw } from "lucide-react";

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
  primaryUrlShown = false,
}: {
  /** Route API GET/PUT/DELETE, ex. /api/projects/<id>/feedback/domain. */
  endpoint: string;
  queryKey: readonly unknown[];
  /** Appliqué au conteneur — absent du DOM quand la section est masquée. */
  className?: string;
  /** Le parent affiche déjà le domaine vérifié comme lien public principal :
   *  on n'en répète donc pas la valeur ici (évite le doublon). */
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

  const verified = domain?.status === "verified";

  return (
    <div className={cn("flex flex-col gap-2.5", className)}>
      {/* En-tête : titre à gauche, statut aligné à droite. */}
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
          {/* La valeur du domaine : lien cliquable si vérifié, sinon texte brut.
              Masquée si le parent l'affiche déjà comme lien public principal. */}
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

/** Tableau des enregistrements DNS à créer : en-têtes explicites (Type, Nom,
 *  Valeur, TTL) et valeur copiable. Le TTL est libre côté registrar → « Auto ». */
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

/** Cellule DNS : valeur (repliable si longue) + bouton copier. */
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

"use client";

import { useTranslations } from "next-intl";
import { cn } from "mangue-ui";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  HelpCircle,
  Loader2,
  type LucideIcon,
} from "lucide-react";
import type { AgentRunStatus } from "@/lib/agent-api";

/**
 * Métadonnées d'affichage du statut d'un run d'agent (MIN-46), partagées par la
 * pastille du panneau d'issue et l'en-tête de la modal d'activité.
 */
export const STATUS_META: Record<
  AgentRunStatus,
  { key: string; cls: string; icon: LucideIcon; spin?: boolean }
> = {
  queued: { key: "statusQueued", cls: "border-brand/20 bg-brand/10 text-brand", icon: Loader2, spin: true },
  running: { key: "statusRunning", cls: "border-brand/20 bg-brand/10 text-brand", icon: Loader2, spin: true },
  needs_input: {
    key: "statusNeedsInput",
    cls: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
    icon: HelpCircle,
  },
  completed: {
    key: "statusCompleted",
    cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    icon: CheckCircle2,
  },
  failed: { key: "statusFailed", cls: "border-destructive/30 bg-destructive/10 text-destructive", icon: AlertTriangle },
  canceled: { key: "statusCanceled", cls: "border-border bg-muted text-muted-foreground", icon: Ban },
};

/** Modèle raccourci (dernier segment de `provider/model`). */
export function shortModel(model: string | null): string | null {
  return model ? (model.split("/").pop() ?? model) : null;
}

/** Pastille de statut (icône + libellé traduit). */
export function AgentStatusBadge({ status }: { status: AgentRunStatus }) {
  const t = useTranslations("Agent");
  const meta = STATUS_META[status] ?? STATUS_META.queued;
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium",
        meta.cls,
      )}
    >
      <Icon className={cn("size-3.5", meta.spin && "animate-spin")} />
      {t(meta.key)}
    </span>
  );
}

"use client";

import Link from "next/link";
import { Button, Progress } from "mangue-ui";
import { Pencil, X } from "lucide-react";
import { OBJECTIVE_STATUS_MAP } from "@/lib/objective-constants";
import { initials } from "@/lib/avatar";
import { displayName } from "@/lib/display-name";
import type { Member, Objective } from "@/lib/types";

function formatDate(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Header banner shown when the board is filtered to a single objective (plan §6). */
export function ObjectiveBanner({
  objective,
  projectId,
  progress,
  lead,
  onEdit,
}: {
  objective: Objective;
  projectId: string;
  progress: { done: number; total: number; percent: number };
  lead: Member | null;
  onEdit: () => void;
}) {
  const status = OBJECTIVE_STATUS_MAP[objective.status];
  const StatusIcon = status.icon;

  return (
    <div className="mb-3 flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card px-4 py-3">
      <span
        className="size-3 shrink-0 rounded-full"
        style={{ backgroundColor: objective.color ?? "var(--muted-foreground)" }}
        aria-hidden
      />
      <div className="min-w-0">
        <p className="truncate font-medium">{objective.name}</p>
        <div className="mt-0.5 flex items-center gap-1.5">
          <StatusIcon className={`size-3.5 ${status.color}`} />
          <span className="text-xs text-muted-foreground">{status.label}</span>
        </div>
      </div>

      <div className="flex w-40 flex-col gap-1">
        <Progress value={progress.percent} />
        <span className="text-xs text-muted-foreground">
          {progress.done}/{progress.total} terminées
        </span>
      </div>

      {objective.target_date && (
        <span className="text-xs text-muted-foreground">
          Cible : {formatDate(objective.target_date)}
        </span>
      )}
      {lead && (
        <span
          className="flex size-7 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground"
          title={displayName(lead)}
        >
          {initials(displayName(lead))}
        </span>
      )}

      <div className="ml-auto flex items-center gap-1">
        <Button variant="outline" size="sm" onClick={onEdit}>
          <Pencil />
          Éditer
        </Button>
        <Button asChild variant="ghost" size="icon-sm" aria-label="Fermer le filtre">
          <Link href={`/projects/${projectId}`}>
            <X />
          </Link>
        </Button>
      </div>
    </div>
  );
}

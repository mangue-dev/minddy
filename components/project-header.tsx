"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge, Button, cn } from "mangue-ui";
import { Settings2 } from "lucide-react";
import { ProjectSettingsDialog } from "@/components/project-settings-dialog";
import type { Project } from "@/lib/types";

function Tab({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "border-b-2 px-1 pb-2 text-sm transition-colors",
        active
          ? "border-foreground font-medium text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </Link>
  );
}

/** Shared project chrome: identity + Issues/Objectifs tabs + settings, with an
 *  optional right-side action slot (e.g. "Nouvelle issue"). */
export function ProjectHeader({
  project,
  active,
  right,
}: {
  project: Project;
  active: "issues" | "objectives";
  right?: React.ReactNode;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const base = `/projects/${project.id}`;

  return (
    <div className="shrink-0 border-b border-border px-6 pt-6">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span
            className="flex size-9 items-center justify-center rounded-lg font-mono text-xs font-semibold"
            style={{
              backgroundColor: project.color ?? "var(--muted)",
              color: project.color ? "#fff" : "var(--muted-foreground)",
            }}
            aria-hidden
          >
            {project.key.slice(0, 2)}
          </span>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-xl font-semibold tracking-tight">
              {project.name}
            </h1>
            <Badge variant="secondary" className="font-mono">
              {project.key}
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {right}
          <Button
            variant="outline"
            size="icon"
            aria-label="Paramètres"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings2 />
          </Button>
        </div>
      </div>

      <nav className="flex items-center gap-5">
        <Tab href={base} active={active === "issues"}>
          Issues
        </Tab>
        <Tab href={`${base}/objectives`} active={active === "objectives"}>
          Objectifs
        </Tab>
      </nav>

      <ProjectSettingsDialog
        project={project}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
      />
    </div>
  );
}

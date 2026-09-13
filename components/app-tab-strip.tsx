"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Loader2, AlertCircle, Home } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, Input } from "mangue-ui";
import { useAppTabs } from "@/lib/app-tabs-context";
import { useProjects } from "@/lib/projects-context";
import { appTabRoute } from "@/lib/app-tab-location";
import { APP_TAB_MAX_NAME, type AppTab } from "@/lib/app-tabs";
import { AppTabIcon } from "./app-tab-icon";
import { AppTabItem } from "./app-tab-item";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import type { MessageKey } from "@/lib/i18n-keys";

const routeLabels: Record<string, MessageKey<"Nav">> = {
  home: "home", all: "allIssues", inbox: "inbox", numo: "agents", agents: "agents", routines: "routines",
  "pull-requests": "pullRequests", statistics: "statistics", trash: "trash", settings: "settings", billing: "billing",
  admin: "adminDashboard", pages: "pages", tickets: "tickets", objectives: "objectives", feedback: "feedback", triage: "triage",
};

export function AppTabStrip() {
  const { tabs, activeId, session, busy, error, loading, loadError, reload } = useAppTabs();
  const { projects } = useProjects();
  const projectById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);
  const t = useTranslations("AppTabs");
  const nav = useTranslations("Nav");
  const common = useTranslations("Common");
  const strip = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<AppTab | null>(null);
  const [name, setName] = useState("");
  useEffect(() => {
    strip.current?.querySelector<HTMLElement>(`[data-app-tab-id="${activeId}"]`)?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [activeId, tabs.length]);
  const focusId = focused && tabs.some((tab) => tab.id === focused) ? focused : activeId;
  const close = (id: string) => {
    void session.close(id).then(() => {
      const active = session.getSnapshot().activeId;
      strip.current?.querySelector<HTMLElement>(`[data-app-tab-id="${active}"]`)?.focus();
    });
  };
  const errorKey = error === "save_failed" ? "saveFailed" : error === "conflict" ? "conflict" : error === "last_tab" ? "lastTab" : error === "destination_unavailable" ? "destinationUnavailable" : "syncFailed";
  return <>
    <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden px-2">
      <div ref={strip} role="tablist" aria-label={t("label")} aria-busy={loading || busy}
        className="scrollbar-quiet flex min-w-0 shrink items-center gap-1 overflow-x-auto py-1"
        onKeyDown={(event) => {
          const controls = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
          const index = controls.indexOf(document.activeElement as HTMLButtonElement);
          if (index < 0) return;
          let next: number;
          if (event.key === "ArrowRight") next = (index + 1) % controls.length;
          else if (event.key === "ArrowLeft") next = (index + controls.length - 1) % controls.length;
          else if (event.key === "Home") next = 0;
          else if (event.key === "End") next = controls.length - 1;
          else return;
          event.preventDefault(); controls[next]?.focus();
        }}>
        {tabs.map((tab) => {
          const { section, projectId } = appTabRoute(tab.id === activeId ? session.getActiveHref() ?? tab.href : tab.href);
          const project = projectId ? projectById.get(projectId) : undefined;
          const sectionLabel = nav(routeLabels[section] ?? "home");
          const label = tab.custom_name ?? (projectId ? `${sectionLabel} - ${project?.name ?? t("unavailableProject")}` : sectionLabel);
          return <AppTabItem key={tab.id} tab={tab} active={tab.id === activeId} focusable={tab.id === focusId} label={label}
            icon={<AppTabIcon section={section} project={project} projectId={projectId} />} busy={busy} last={tabs.length <= 1}
            onActivate={() => { if (!busy) void session.activate(tab.id); }} onClose={() => close(tab.id)}
            onPin={() => { void session.update(tab.id, { pinned: !tab.pinned }); }}
            onRename={() => { setName(tab.custom_name ?? ""); setRenaming(tab); }} onFocus={() => setFocused(tab.id)} />;
        })}
        {loading && <Loader2 aria-label={t("loading")} className="size-4 shrink-0 animate-spin" />}
      </div>
      <Tooltip><TooltipTrigger asChild><button type="button" aria-label={t("newTab")} disabled={busy || loading || loadError}
        onClick={() => { void session.create(); }} className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40">
        <Plus className="size-4" aria-hidden />
      </button></TooltipTrigger><TooltipContent side="bottom">{t("newTab")}</TooltipContent></Tooltip>
      {(loadError || error) && <Tooltip><TooltipTrigger asChild><button type="button" aria-label={t("retry")}
        onClick={() => { reload(); void session.retry(); }} className="flex size-7 shrink-0 items-center justify-center text-destructive">
        <AlertCircle className="size-4" aria-hidden /><span role="alert" className="sr-only">{t(errorKey)}</span>
      </button></TooltipTrigger><TooltipContent side="bottom">{t(errorKey)} {t("retry")}</TooltipContent></Tooltip>}
      {error === "destination_unavailable" && <Tooltip><TooltipTrigger asChild><button type="button" aria-label={nav("home")}
        disabled={busy} onClick={() => { void session.goHome(); }} className="flex size-7 shrink-0 items-center justify-center rounded-md hover:bg-sidebar-accent">
        <Home className="size-4" aria-hidden />
      </button></TooltipTrigger><TooltipContent side="bottom">{nav("home")}</TooltipContent></Tooltip>}
    </div>
    <Dialog open={Boolean(renaming)} onOpenChange={(open) => { if (!open) setRenaming(null); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>{t("rename")}</DialogTitle><DialogDescription>{t("renameHint")}</DialogDescription></DialogHeader>
        <form onSubmit={(event) => { event.preventDefault(); if (renaming) void session.update(renaming.id, { custom_name: name.trim() || null }).then(() => { if (!session.getSnapshot().error) setRenaming(null); }); }}>
          <label htmlFor="app-tab-name" className="mb-2 block text-sm">{t("name")}</label>
          <Input id="app-tab-name" autoFocus value={name} maxLength={APP_TAB_MAX_NAME} onChange={(event) => setName(event.target.value)} />
          <DialogFooter className="mt-4"><Button type="button" variant="outline" onClick={() => setRenaming(null)}>{common("cancel")}</Button>
            <Button type="submit" disabled={busy}>{common("save")}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </>;
}

"use client";

import { Suspense, useCallback, useMemo, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  cn,
} from "mangue-ui";
import type { LucideIcon } from "lucide-react";
import { trackEvent } from "@/lib/analytics";

export type SettingsTab = {
  value: string;
  label: string;
  icon?: LucideIcon;
  hidden?: boolean;
  content: ReactNode;
};

type SettingsShellProps = {
  title: string;
  description?: string;
  defaultTab: string;
  tabs: SettingsTab[];
  /** Rendered between the header and the tab grid (banners, warnings…). */
  topSlot?: ReactNode;
  /** Page max-width in px (default 1080). */
  maxWidth?: number;
};

/**
 * The settings layout shared by the account and project settings pages: a
 * centered, max-width column with a page header, an optional top slot, then a
 * left vertical tab rail (sticky on desktop) beside a content pane. Mirrors
 * AutoKap's SettingsShell. The active tab is driven by the `?tab=` query param
 * so tabs are deep-linkable and survive reloads; selecting the default tab
 * drops the param to keep the URL clean.
 */
export function SettingsShell({
  title,
  description,
  defaultTab,
  tabs,
  topSlot,
  maxWidth = 1080,
}: SettingsShellProps) {
  return (
    <div
      className="mx-auto space-y-8 p-4 md:p-8"
      style={{ maxWidth: `${maxWidth}px` }}
    >
      <header>
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </header>

      {topSlot}

      {/* SettingsTabs reads `?tab=`; useSearchParams needs a Suspense boundary
          so the route can still be statically prerendered. */}
      <Suspense fallback={<div className="min-h-64" />}>
        <SettingsTabs defaultTab={defaultTab} tabs={tabs} />
      </Suspense>
    </div>
  );
}

function SettingsTabs({
  defaultTab,
  tabs,
}: {
  defaultTab: string;
  tabs: SettingsTab[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const visibleTabs = useMemo(() => tabs.filter((t) => !t.hidden), [tabs]);
  const validValues = useMemo(
    () => new Set(visibleTabs.map((t) => t.value)),
    [visibleTabs],
  );

  const tabParam = searchParams.get("tab");
  const fallback = validValues.has(defaultTab)
    ? defaultTab
    : (visibleTabs[0]?.value ?? defaultTab);
  const activeTab = tabParam && validValues.has(tabParam) ? tabParam : fallback;

  const setActiveTab = useCallback(
    (value: string) => {
      // Deux écrans partagent ce shell : les réglages du compte (/settings) et
      // ceux d'un projet (/projects/<id>/settings). Le chemin les distingue.
      trackEvent("settings_tab_switched", {
        scope: pathname.startsWith("/projects/") ? "project" : "account",
        tab: value,
      });
      const params = new URLSearchParams(searchParams.toString());
      if (value === fallback) {
        params.delete("tab");
      } else {
        params.set("tab", value);
      }
      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [fallback, pathname, router, searchParams],
  );

  return (
    <Tabs
      orientation="vertical"
      value={activeTab}
      onValueChange={setActiveTab}
      className="grid grid-cols-1 gap-6 md:grid-cols-[220px_1fr] md:items-start md:gap-8"
    >
      <aside className="space-y-2 md:sticky md:top-4 md:self-start">
        <TabsList variant="line" className="h-auto w-full items-stretch p-0">
          {visibleTabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="h-9 w-full justify-start gap-2 px-3 py-1.5"
              >
                {Icon && <Icon className="h-4 w-4" />}
                <span>{tab.label}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>
      </aside>

      <div className="min-w-0">
        {visibleTabs.map((tab) => (
          <TabsContent
            key={tab.value}
            value={tab.value}
            className="mt-0 space-y-10"
          >
            {tab.content}
          </TabsContent>
        ))}
      </div>
    </Tabs>
  );
}

/**
 * A titled block inside a settings tab: a small heading (+ optional
 * description) above its body. Matches AutoKap's section convention.
 */
export function SettingsSection({
  title,
  description,
  destructive,
  children,
}: {
  title: string;
  description?: string;
  destructive?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="space-y-5">
      <div className="space-y-1">
        <h2
          className={cn(
            "text-sm font-semibold",
            destructive && "text-destructive",
          )}
        >
          {title}
        </h2>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </section>
  );
}

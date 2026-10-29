"use client";

import { BotIcon, DollarCircleIcon as CircleDollarSign, ServerStack01Icon, UserGroupIcon } from "@hugeicons/core-free-icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useReducedMotion } from "framer-motion";
import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { AppIcon } from "@/components/icon";
import { SecondarySidebar } from "@/components/secondary-sidebar";
import { AppContentHeader } from "@/components/app-content-header";
import { SidebarNavRail } from "@/components/sidebar-nav-rail";
import { matchesFilter } from "@/components/sidebar-filter-field";
import { useScrollFade } from "@/lib/use-scroll-fade";
import { useAdminCapabilities } from "@/lib/use-admin-capabilities";
import { useAssistantContext } from "@/lib/assistant-panel-context";
import {
  DEFAULT_ADMIN_TAB,
  resolveAdminTab,
  visibleAdminTabs,
  type AdminTabId,
} from "@/lib/admin-tabs";
import {
  ADMIN_SECTION_PARAM,
  adminSectionAnchor,
  useAdminSections,
  type AdminSection,
  type AdminSectionId,
} from "@/lib/admin-sections";

function PanelLoading() {
  return <Skeleton className="h-48 rounded-xl" />;
}

const AdminAccountsDashboard = dynamic(
  () => import("./admin-accounts-dashboard").then((module) => module.AdminAccountsDashboard),
  { loading: PanelLoading },
);
const AdminInstanceDashboard = dynamic(
  () => import("./admin-instance-dashboard").then((module) => module.AdminInstanceDashboard),
  { loading: PanelLoading },
);
const AdminModelsDashboard = dynamic(
  () => import("./admin-models-dashboard").then((module) => module.AdminModelsDashboard),
  { loading: PanelLoading },
);
const AdminCostsDashboard = dynamic(
  () => import("./admin-costs-dashboard").then((module) => module.AdminCostsDashboard),
  { loading: PanelLoading },
);

/**
 * Shell of `/admin`: the administration of ONE instance (MIN-90, MIN-829).
 * Three tabs: “Accounts” (how many there are, and support on one of them),
 * “Costs” (what the AI providers cost) and “Models” (which model does what).
 *
 * The tab values of earlier releases still open the right screen
 * (`resolveAdminTab`, lib/admin-tabs.ts): `?tab=finances` is a CONTRACT, the
 * spend-guard push notification carries it, and it lands on Costs.
 *
 * Actions live where the account is looked at, never in a tab of their own:
 * one tab = one object, not a verb.
 *
 * The rail is a SECONDARY SIDEBAR (MIN-262), with the same grammar as
 * settings. The filter searches the sections inside those tabs, then opens
 * and highlights the selected section.
 *
 * The current tab lives in the URL (`?tab=`) — a link to `/admin?tab=models`
 * reopens the correct view.
 *
 * Access locked on the server side by `app/(app)/admin/layout.tsx`.
 */

type AdminTab = AdminTabId;

const DEFAULT_TAB: AdminTab = DEFAULT_ADMIN_TAB;
const ICONS: Record<AdminTab, AppIcon> = {
  accounts: UserGroupIcon,
  costs: CircleDollarSign,
  models: BotIcon,
  instance: ServerStack01Icon,
};

/** The content column is wider than the settings column (`max-w-3xl`):
 the cost table is already cramped there. */
const ADMIN_MAX_WIDTH = "max-w-5xl";
const FOCUS_HIGHLIGHT_MS = 2000;
const FOCUS_WAIT_MS = 5000;

function useAdminSectionFocus(
  target: { id: AdminSectionId; nonce: number } | null,
  reduceMotion: boolean,
) {
  useEffect(() => {
    if (!target) return;
    const domId = adminSectionAnchor(target.id);
    const deadline = Date.now() + FOCUS_WAIT_MS;
    let frame = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let marked: HTMLElement | null = null;

    const look = () => {
      const element = document.getElementById(domId);
      if (!element) {
        if (Date.now() < deadline) frame = requestAnimationFrame(look);
        return;
      }
      element.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "center",
      });
      element.setAttribute("data-settings-focus", "");
      marked = element;
      timer = setTimeout(
        () => element.removeAttribute("data-settings-focus"),
        FOCUS_HIGHLIGHT_MS,
      );
    };
    frame = requestAnimationFrame(look);

    return () => {
      cancelAnimationFrame(frame);
      if (timer) clearTimeout(timer);
      marked?.removeAttribute("data-settings-focus");
    };
  }, [target, reduceMotion]);
}

export function AdminDashboard() {
  const t = useTranslations("Admin");
  const tCommon = useTranslations("Common");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const reduceMotion = useReducedMotion();
  const contentFade = useScrollFade<HTMLDivElement>();
  // Tab existence follows the instance, not the product (MIN-416): the
  // “Costs” screen reads the OpenRouter ledger, so an instance without a
  // linked OpenRouter key has nothing to show there and the tab disappears.
  // While the capabilities have not arrived (`null`) the tab stays — no
  // flicker on first paint; the API itself re-checks every access anyway.
  const capabilities = useAdminCapabilities();
  const openRouterLinked = capabilities.configured("managedAi");

  const rawTab = searchParams.get("tab");
  const requested = resolveAdminTab(rawTab);
  const instanceOverrides = capabilities.instanceOverrides;
  const visibleTabs = useMemo(
    () => visibleAdminTabs(openRouterLinked, instanceOverrides),
    [openRouterLinked, instanceOverrides],
  );
  const active: AdminTab = requested && visibleTabs.includes(requested) ? requested : DEFAULT_TAB;

  // A tab value of an earlier release (`finances`, `overview`, `users`) is
  // rewritten to the tab that replaced it, so the address bar names it.
  useEffect(() => {
    if (!rawTab || !requested || rawTab === requested) return;
    const params = new URLSearchParams(searchParams.toString());
    if (requested === DEFAULT_TAB) params.delete("tab");
    else params.set("tab", requested);
    const qs = params.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [pathname, rawTab, requested, router, searchParams]);

  const [query, setQuery] = useState("");

  // Numo opened here knows which admin tab the user is on (MIN-829).
  const assistantContext = useMemo(() => ({ admin: active }), [active]);
  useAssistantContext(assistantContext);

  const items = useMemo(
    () =>
      visibleTabs.map((tab) => ({
        value: tab,
        label: t(`tabs.${tab}`),
        icon: ICONS[tab],
      })),
    [t, visibleTabs],
  );

  const sections = useAdminSections();
  const searchableSections = useMemo(
    () => sections.filter((section) => visibleTabs.includes(section.tab)),
    [sections, visibleTabs],
  );
  const matches = useMemo(() => {
    if (!query.trim()) return [];
    return searchableSections.filter((section) =>
      matchesFilter(query, [
        section.title,
        section.tabLabel,
        ...section.keywords,
      ]),
    );
  }, [query, searchableSections]);

  const setActive = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value === DEFAULT_TAB) params.delete("tab");
      else params.set("tab", value);
      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const openSection = useCallback(
    (section: AdminSection) => {
      setQuery("");
      const params = new URLSearchParams(searchParams.toString());
      if (section.tab === DEFAULT_TAB) params.delete("tab");
      else params.set("tab", section.tab);
      params.set(ADMIN_SECTION_PARAM, section.id);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const sectionParam = searchParams.get(ADMIN_SECTION_PARAM);
  const [focus, setFocus] = useState<{
    id: AdminSectionId;
    nonce: number;
  } | null>(null);
  const consumedSection = useRef<string | null>(null);

  useEffect(() => {
    if (!sectionParam) {
      consumedSection.current = null;
      return;
    }
    if (consumedSection.current === sectionParam) return;
    consumedSection.current = sectionParam;

    const section = searchableSections.find((item) => item.id === sectionParam);
    const params = new URLSearchParams(searchParams.toString());
    params.delete(ADMIN_SECTION_PARAM);
    if (section) {
      if (section.tab === DEFAULT_TAB) params.delete("tab");
      else params.set("tab", section.tab);
      setFocus((previous) => ({
        id: section.id,
        nonce: (previous?.nonce ?? 0) + 1,
      }));
    }
    const queryString = params.toString();
    router.replace(`${pathname}${queryString ? `?${queryString}` : ""}`, {
      scroll: false,
    });
  }, [pathname, router, searchableSections, searchParams, sectionParam]);

  useAdminSectionFocus(focus, !!reduceMotion);

  return (
    // The ROW of the screen: the rail leaves in the secondary sidebar (by
    // portal, in the frame) and the content remains on the right.
    <div className="flex h-full min-h-0">
      <SecondarySidebar
        title={t("pageTitle")}
        hiddenOnMobile
        filter={{
          value: query,
          onChange: setQuery,
          placeholder: t("filterPlaceholder", {
            count: searchableSections.length,
          }),
          clearLabel: tCommon("clearFilter"),
        }}
      >
        {query.trim() ? (
          matches.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              {tCommon("noFilterMatch")}
            </p>
          ) : (
            <ul className="flex flex-col gap-1 pt-2 pb-4">
              {matches.map((section) => {
                const Icon = section.icon;
                return (
                  <li key={section.id}>
                    <button
                      type="button"
                      data-sidebar-filter-result
                      data-navigation-href={`/admin?tab=${encodeURIComponent(section.tab)}&${ADMIN_SECTION_PARAM}=${encodeURIComponent(section.id)}`}
                      onClick={() => openSection(section)}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left outline-none transition-colors hover:bg-muted/60 focus-visible:bg-muted/60"
                    >
                      <AppIcon icon={Icon} className="size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {section.title}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {section.tabLabel}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )
        ) : (
          /* These are buttons rather than tab primitives because the rail is
             portaled outside the content panel. See SidebarNavRail. */
          <SidebarNavRail
            label={t("pageTitle")}
            items={items}
            value={active}
            onValueChange={setActive}
            hrefForValue={(value) => value === DEFAULT_TAB ? "/admin" : `/admin?tab=${encodeURIComponent(value)}`}
          />
        )}
      </SecondarySidebar>

      <div
        className="flex min-h-0 min-w-0 flex-1 flex-col"
      >
        {/* Navigation already names the active section; keep the shared spacing. */}
        <AppContentHeader />

        <div
          ref={contentFade.ref}
          {...contentFade.scrollProps}
          className="min-h-0 flex-1 overflow-y-auto px-4 pt-1 pb-8 app-desktop:px-6 app-desktop:pt-6"
        >
          <div className={cn("mx-auto flex flex-col gap-4", ADMIN_MAX_WIDTH)}>
            {/* Only the open panel is mounted: each one fetches its data
                when it mounts, and the others would load for nothing. */}
            {active === "accounts" && <AdminAccountsDashboard />}
            {active === "costs" && <AdminCostsDashboard />}
            {active === "models" && <AdminModelsDashboard />}
            {active === "instance" && <AdminInstanceDashboard />}
          </div>
        </div>
      </div>
    </div>
  );
}

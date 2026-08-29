"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useReducedMotion } from "framer-motion";
import { Button, cn } from "mangue-ui";
import { useTranslations } from "next-intl";
import {
  Bot,
  ChevronLeft,
  CircleDollarSign,
  LayoutDashboard,
  Users,
  type LucideIcon,
} from "lucide-react";
import { SecondarySidebar } from "@/components/secondary-sidebar";
import { SidebarNavRail } from "@/components/sidebar-nav-rail";
import { matchesFilter } from "@/components/sidebar-filter-field";
import { useScrollFade } from "@/lib/use-scroll-fade";
import { useAdminCapabilities } from "@/lib/use-admin-capabilities";
import {
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
import { AdminOverviewDashboard } from "./admin-overview-dashboard";
import { AdminUsersDashboard } from "./admin-users-dashboard";
import { AdminModelsDashboard } from "./admin-models-dashboard";
import { AdminFinanceDashboard } from "./admin-finance-dashboard";

/**
 * Shell of `/admin` (MIN-90). Four tabs: “Overview” (the app in
 * numbers), “Users” (THE accounts view, where all of them now live
 * the admin actions), “Finances” and “Models”.
 *
 * “Finances” (MIN-92) replaces the old “AI Costs”, which only showed a
 * half of the equation. Its tab value is a CONTRACT: this is the URL that
 * carries the expense guard push notification (`/admin?tab=finances`).
 *
 * The “Quotas” and “Billing” tabs have disappeared: they were not
 * screens but actions — resetting a budget, forcing a plan — and a
 * action is taken where we look at the account concerned, not in a tab which
 * asks for his email again. The dashboard therefore follows the same rule as the rest of
 * the app: one tab = one object, not a verb.
 *
 * The miter rail is a SECONDARY SIDEBAR (MIN-262), and no longer a line
 * of tabs placed above the cards: the same full height column, at the
 * same place and with the same grammar as sorting, returns, pull
 * requests, agent sessions and settings. The title of the screen is
 * title line of this bar; it is therefore no longer written above the content,
 * where it duplicated the breadcrumbs. The filter searches the individual
 * sections inside those tabs, then opens and highlights the selected section,
 * matching account and project settings.
 *
 * The current tab lives in the URL (`?tab=`) — a link to `/admin?tab=users`
 * reopens the correct view.
 *
 * Access locked on the server side by `app/(app)/admin/layout.tsx`.
 */

type AdminTab = AdminTabId;

const DEFAULT_TAB: AdminTab = "overview";
const ICONS: Record<AdminTab, LucideIcon> = {
  overview: LayoutDashboard,
  users: Users,
  finances: CircleDollarSign,
  models: Bot,
};

/** The content column is wider than the settings column (`max-w-3xl`):
 the financial tables and the counter grids are already cramped there. */
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
  // “Finances” screen reads the OpenRouter ledger, so an instance without a
  // linked OpenRouter key has nothing to show there and the tab disappears.
  // While the capabilities have not arrived (`null`) the tab stays — no
  // flicker on first paint; the API itself re-checks every access anyway.
  const openRouterLinked = useAdminCapabilities().configured("managedAi");

  const requested = searchParams.get("tab");
  const visibleTabs = useMemo(() => visibleAdminTabs(openRouterLinked), [openRouterLinked]);
  const valid = (visibleTabs as readonly string[]).includes(requested ?? "");
  const active: AdminTab = valid ? (requested as AdminTab) : DEFAULT_TAB;

  // Under `md`, the rail and the content take turns in full screen, like everywhere
  // elsewhere in the app. A URL that NAMEs its tab directly opens the
  // content: we arrive from the palette, a link or a push notification.
  const [mobileDetail, setMobileDetail] = useState(valid);
  const [query, setQuery] = useState("");

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
      setMobileDetail(true);
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
      setMobileDetail(true);
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
        hiddenOnMobile={mobileDetail}
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
            <ul className="flex flex-col gap-1 px-2 pt-2 pb-4">
              {matches.map((section) => {
                const Icon = section.icon;
                return (
                  <li key={section.id}>
                    <button
                      type="button"
                      data-sidebar-filter-result
                      onClick={() => openSection(section)}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left outline-none transition-colors hover:bg-muted/60 focus-visible:bg-muted/60"
                    >
                      <Icon className="size-4 shrink-0 text-muted-foreground" />
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
          />
        )}
      </SecondarySidebar>

      <div
        className={cn(
          "min-h-0 min-w-0 flex-1 flex-col md:flex",
          mobileDetail ? "flex" : "hidden",
        )}
      >
        {/* Panel header, MOBILE only: return to rail and
 name of the open tab. On desktop the rail is on the screen and the
 is already highlighted. */}
        <div className="flex shrink-0 items-center gap-2 px-4 py-3 md:hidden">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={tCommon("back")}
            onClick={() => setMobileDetail(false)}
          >
            <ChevronLeft />
          </Button>
          <span className="truncate text-sm font-medium">
            {t(`tabs.${active}`)}
          </span>
        </div>

        <div
          ref={contentFade.ref}
          {...contentFade.scrollProps}
          className="min-h-0 flex-1 overflow-y-auto px-4 pt-1 pb-8 md:px-6 md:pt-6"
        >
          <div className={cn("mx-auto flex flex-col gap-4", ADMIN_MAX_WIDTH)}>
            {/* Only the open panel is mounted - this is already what was done
 `TabsContent`, which dismantles the others: each of them leaves
 to look for its numbers during assembly, and the four at once
 would wake up the entire dashboard to show only a quarter. */}
            {active === "overview" && <AdminOverviewDashboard />}
            {active === "users" && <AdminUsersDashboard />}
            {active === "finances" && <AdminFinanceDashboard />}
            {active === "models" && <AdminModelsDashboard />}
          </div>
        </div>
      </div>
    </div>
  );
}

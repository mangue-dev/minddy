"use client";

import { useCallback, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
import { useScrollFade } from "@/lib/use-scroll-fade";
import { useAdminCapabilities } from "@/lib/use-admin-capabilities";
import {
  visibleAdminTabs,
  type AdminTabId,
} from "@/lib/admin-tabs";
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
 * where it duplicated the breadcrumbs. There is no filter field:
 * four entries can be read at a glance.
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

export function AdminDashboard() {
  const t = useTranslations("Admin");
  const tCommon = useTranslations("Common");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
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

  const items = useMemo(
    () =>
      visibleTabs.map((tab) => ({
        value: tab,
        label: t(`tabs.${tab}`),
        icon: ICONS[tab],
      })),
    [t, visibleTabs],
  );

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

  return (
    // The ROW of the screen: the rail leaves in the secondary sidebar (by
    // portal, in the frame) and the content remains on the right.
    <div className="flex h-full min-h-0">
      <SecondarySidebar title={t("pageTitle")} hiddenOnMobile={mobileDetail}>
        {/* Cards of ours, and not the `Tabs` of mango-ui: the selection is
 drawn by a SLIDING pellet, which the indicator of the
 library doubled with a lined capsule. See SidebarNavRail. */}
        <SidebarNavRail
          label={t("pageTitle")}
          items={items}
          value={active}
          onValueChange={setActive}
        />
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

"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useReducedMotion } from "framer-motion";
import { Button, cn } from "mangue-ui";
import { ChevronLeft, type LucideIcon } from "lucide-react";
import { trackEvent } from "@/lib/analytics";
import { AppContentHeader } from "@/components/app-content-header";
import { SecondarySidebar } from "@/components/secondary-sidebar";
import { SidebarNavRail } from "@/components/sidebar-nav-rail";
import { matchesFilter } from "@/components/sidebar-filter-field";
import { useScrollFade } from "@/lib/use-scroll-fade";
import { projectIdFromPath } from "@/lib/project-id-from-path";
import {
  SETTINGS_SECTION_PARAM,
  settingsSectionAnchor,
  settingsSectionHref,
  useSettingsSections,
  type SettingsSection,
  type SettingsSectionId,
} from "@/lib/settings-sections";

export type SettingsTab = {
  value: string;
  label: string;
  icon?: LucideIcon;
  hidden?: boolean;
  /** Caution mark on the tab — a setting is incomplete. The chain
      is what the hover says and what a screen reader reads: the point alone
      would teach nothing to those who do not see it. */
  indicator?: string;
  content: ReactNode;
};

type SettingsShellProps = {
  title: string;
  defaultTab: string;
  tabs: SettingsTab[];
  /**
   * “Filter the 18 settings…”. A FUNCTION, not a string: the namespace
   * differs (account / project) so the translation comes from the page, but the
   * number — that of the sections actually searchable here, after the rights and
   * hidden tabs — is only known to the shell.
   */
  filterPlaceholder: (count: number) => string;
  /**
   * Who is looking at the screen, for the reserved sections: “Sensitive zone” and
   * "Leave project" live in the SAME tab and exclude each other
   * the other. Without this response, the research would suggest to the non-owner
   * a map that he will never have before his eyes - and his anchor would never be
   * found, so the unroll would wait five seconds in a vacuum. Omitted for
   * account settings, where no section is conditional.
   */
  audience?: "owner" | "member";
};

/** The width of the column of cards, the SAME on both sides (MIN-167). THE
    account took in 880 px and the project in 1080: two screens which share a
    shell and do not have the same width, it is already "each tab has a different look
    different ". Since the tab rail came out in the sidebar
    secondary, it is `max-w-3xl` — the same column centered as the detail of a
    triage, return or pull request. */
const SETTINGS_MAX_WIDTH = "max-w-3xl";

/** The time the ring lasts: that of placing the eye, no more. */
const FOCUS_HIGHLIGHT_MS = 2000;
/** Beyond that, the requested section will not arrive (tab without it, rights which do not
 * do not return it, request in failure): we stop watching for it. */
const FOCUS_WAIT_MS = 5000;

/**
 * Scroll to the requested card and highlight it (MIN — search for
 * settings in ⌘K).
 *
 * It almost never exists in the frame where the URL arrives: the tab comes from
 * change, and most sections are waiting for a request (members, filing
 * linked, board settings). Hence the watch rather than a single test - without it,
 * every other section received nothing and the user landed at the top
 * of the tab, looking for what he had just named.
 */
function useSectionFocus(
  target: { id: SettingsSectionId; nonce: number } | null,
  reduceMotion: boolean,
) {
  useEffect(() => {
    if (!target) return;
    const domId = settingsSectionAnchor(target.id);
    const deadline = Date.now() + FOCUS_WAIT_MS;
    let frame = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let marked: HTMLElement | null = null;

    const look = () => {
      const el = document.getElementById(domId);
      if (!el) {
        if (Date.now() < deadline) frame = requestAnimationFrame(look);
        return;
      }
      el.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "center",
      });
      el.setAttribute("data-settings-focus", "");
      marked = el;
      timer = setTimeout(
        () => el.removeAttribute("data-settings-focus"),
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

/**
 * The settings screen, shared by the account (/settings) and a project
 * (/projects/<id>/settings). The miter rail is a SECONDARY SIDEBAR: it
 * leaves the content column for the navigation column, full height, at
 * left of the header — the same place and the same grammar as the sorting list,
 * returns, pull requests and agent sessions. The screen title
 * is the title line of this bar; it is therefore no longer written above the
 * maps, where it duplicated the breadcrumbs.
 *
 * The active tab is controlled by `?tab=`: the tabs are shareable and
 * survive reloading; choosing the default tab removes the setting
 * to keep the URL clean.
 */
export function SettingsShell({
  title,
  defaultTab,
  tabs,
  audience,
  filterPlaceholder,
}: SettingsShellProps) {
  return (
    // SettingsTabs reads `?tab=`; useSearchParams needs a Suspense boundary
    // so the route can still be statically prerendered.
    <Suspense fallback={<div className="min-h-64" />}>
      <SettingsTabs
        title={title}
        defaultTab={defaultTab}
        tabs={tabs}
        audience={audience}
        filterPlaceholder={filterPlaceholder}
      />
    </Suspense>
  );
}

function SettingsTabs({
  title,
  defaultTab,
  tabs,
  audience,
  filterPlaceholder,
}: SettingsShellProps) {
  const tCommon = useTranslations("Common");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const reduceMotion = useReducedMotion();

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

  // Under `md`, the rail and the content take turns in full screen, like everywhere
  // elsewhere in the app. A URL that NAMEs its tab directly opens the
  // content: we arrive from the pallet or a link, not from the rail.
  const [mobileDetail, setMobileDetail] = useState(!!tabParam);
  const contentFade = useScrollFade<HTMLDivElement>();
  const activeLabel =
    visibleTabs.find((t) => t.value === activeTab)?.label ?? title;

  const setActiveTab = useCallback(
    (value: string) => {
      setMobileDetail(true);
      // Two screens share this shell: account settings (/settings) and
      // those of a project (/projects/<id>/settings). The path distinguishes them.
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

  // `?section=`: the palette does not just open the right tab, it
  // name the card. The parameter is CONSUMED as soon as it is read — copied as it stands
  // local then removed from the URL. Without this removal, changing tab carries it around
  // (setActiveTab copies the query) and a reload would replay the highlighting
  // from a section that we no longer look for.
  const sectionParam = searchParams.get(SETTINGS_SECTION_PARAM);
  const [focus, setFocus] = useState<{
    id: SettingsSectionId;
    nonce: number;
  } | null>(null);
  const consumed = useRef<string | null>(null);

  useEffect(() => {
    if (!sectionParam) {
      consumed.current = null;
      return;
    }
    if (consumed.current === sectionParam) return;
    consumed.current = sectionParam;
    // The counter, and not the id alone: ​​requesting the same section TWICE must
    // re-roll it, but its id has not changed.
    setFocus((prev) => ({
      id: sectionParam as SettingsSectionId,
      nonce: (prev?.nonce ?? 0) + 1,
    }));
    const params = new URLSearchParams(searchParams.toString());
    params.delete(SETTINGS_SECTION_PARAM);
    const qs = params.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [sectionParam, searchParams, pathname, router]);

  useSectionFocus(focus, !!reduceMotion);

  // ── Recherche de sections ────────────────────────────────────────────────
  // The miter rail answers "where is it?" ", but what we type is the name of
  // the CARD: “pace”, “sensitive zone”, “act on your behalf” — none of
  // these words is not a tab. The ⌘K palette already knows how to find them; the column
  // replays exactly the same path, with the same catalog and the same URL
  // (right tab, unrolled anchor, highlighted map) — cf. settingsSectionHref.
  const [query, setQuery] = useState("");
  const allSections = useSettingsSections();
  const scope = pathname.startsWith("/projects/") ? "project" : "account";
  const projectId = projectIdFromPath(pathname);
  // What this screen can offer: its scope, the rights of who watches, and
  // the tabs actually mounted. A hidden tab (rights, plan) has no
  // returned cards — sending someone there would land them on the tab by
  // fault, without anything, and the unfolding would wait five seconds for an absent anchor.
  const searchable = useMemo(
    () =>
      allSections.filter(
        (s) =>
          s.scope === scope &&
          (!s.audience || s.audience === audience) &&
          validValues.has(s.tab),
      ),
    [allSections, scope, audience, validValues],
  );
  const matches = useMemo(() => {
    if (!query.trim()) return [];
    // The keywords in the catalog carry BOTH languages: “security” is
    // found from an English screen, and “security” from a French one.
    return searchable.filter((s) =>
      matchesFilter(query, [s.title, s.tabLabel, ...s.keywords]),
    );
  }, [query, searchable]);

  const openSection = useCallback(
    (section: SettingsSection) => {
      setMobileDetail(true);
      setQuery("");
      // `replace` and not `push`: we are already on the screen, only the destination
      // internal change — like a tab change, which does not stack either.
      router.replace(settingsSectionHref(section, projectId ?? undefined), {
        scroll: false,
      });
    },
    [router, projectId],
  );

  return (
    // The ROW of the screen: the rail leaves in the secondary sidebar (by
    // gate, in the chassis) and the cards remain on the right.
    <div className="flex h-full min-h-0">
      <SecondarySidebar
        title={title}
        hiddenOnMobile={mobileDetail}
        filter={{
          value: query,
          onChange: setQuery,
          placeholder: filterPlaceholder(searchable.length),
          clearLabel: tCommon("clearFilter"),
        }}
      >
        {/* Research in progress REPLACES the rail: these are two answers to the
            same question — where to go — and stacking them would make a column of two
            lists. The rail returns as soon as the field is emptied. */}
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
                      {/* The tab that contains it, in dim context — the same
                          reading only on the paddle line. */}
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
          /* Cards of ours, and not the `Tabs` of mango-ui: the selection is
             drawn by a pellet that SLIDES, that the indicator of the
             library lined with a lined capsule. See SidebarNavRail. */
          <SidebarNavRail
            label={title}
            items={visibleTabs}
            value={activeTab}
            onValueChange={setActiveTab}
          />
        )}
      </SecondarySidebar>

      <div
        className={cn(
          "min-h-0 min-w-0 flex-1 flex-col md:flex",
          mobileDetail ? "flex" : "hidden",
        )}
      >
        {/* The settings content keeps the same structural header as the other
            list/detail screens. It stays intentionally empty on desktop: the
            secondary rail already names the active tab, while the blank header
            gives the settings cards the expected top breathing room. */}
        <AppContentHeader
          contentClassName="gap-2"
        >
          <Button
            variant="ghost"
            size="icon-sm"
            className="md:hidden"
            aria-label={title}
            onClick={() => setMobileDetail(false)}
          >
            <ChevronLeft />
          </Button>
          <span className="truncate text-sm font-medium md:hidden">
            {activeLabel}
          </span>
        </AppContentHeader>

        <div
          ref={contentFade.ref}
          {...contentFade.scrollProps}
          className="min-h-0 flex-1 overflow-y-auto px-4 pt-1 pb-8 md:px-6 md:pt-6"
        >
          <div className={cn("mx-auto flex flex-col gap-4", SETTINGS_MAX_WIDTH)}>
            {/* Only the open tab is mounted — that's already what it did
                `TabsContent`, which dismantles the others. The key forces a
                reassembly at each change: a panel must not inherit from
                the state of its neighbor.

                Spacing lives BETWEEN the cards: each group carries its
                own frame, a `space-y-10` (which separated blocks without borders)
                laisserait des trous. */}
            <div key={activeTab} className="flex flex-col gap-4">
              {visibleTabs.find((tab) => tab.value === activeTab)?.content}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

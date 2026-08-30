"use client";

import {
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type MouseEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { APP_VERSION } from "@/lib/app-version";
import { getDesktopBridge } from "@/lib/desktop/bridge";
import { useDesktopUpdateStatus } from "@/lib/desktop/use-update-status";
import {
  useHoldWindowButtons,
  useWideLayout,
  useWindowButtonsSlot,
} from "@/lib/use-window-buttons";
import {
  WINDOW_BUTTONS_WIDTH,
  WindowButtonDecoys,
} from "@/components/desktop-window-buttons";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useLocale, useTranslations } from "next-intl";
import {
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  cn,
  type NavItem,
  type NavSection,
} from "mangue-ui";
import { Kbd, KbdSequence } from "@/components/ui/kbd";
import {
  IssueContextMenu,
  type ContextMenuAction,
} from "@/components/issue-context-menu";
import {
  LogOut,
  Megaphone,
  BarChart3,
  CreditCard,
  Settings,
  ArrowUpRight,
  Shield,
  CircleHelp,
  Search,
  Trash2,
  ArrowDownToLine,
  Loader2,
  Check,
  ChevronDown,
  ChevronLeft,
  Home,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { authDisplayName, type AuthNameMeta } from "@/lib/display-name";
import { useIsAdmin } from "@/lib/use-is-admin";
import { useMyAvatarSource } from "@/lib/use-my-avatar";
import { MinddyLogo } from "@/components/minddy-logo";
import { ProjectOrb } from "@/components/project-orb";
import { UserAvatar } from "@/components/user-avatar";
import { getAppEnv, ENV_LOGO_TINT } from "@/lib/env";
import { projectOrbSeed } from "@/lib/project-orb-colors";
import { useChordPrefix, CHORD_PREFIX } from "@/lib/keyboard/keyboard-context";
import { useModKey } from "@/lib/keyboard/use-mod-shortcut";
import { transitions } from "@/lib/motion";
import { projectIdFromPath, projectTabHref } from "@/lib/project-id-from-path";
import { usePrefetchProject } from "@/lib/use-prefetch-project";
import { useRuntimeConfig } from "@/lib/runtime-config-provider";
import { NewMenu } from "@/components/new-menu";
import { ScratchpadTrigger } from "@/components/scratchpad/scratchpad-trigger";
import { UsageIndicator } from "@/components/usage-indicator";
import {
  SIDEBAR_COMPACT_CONTROL_CLASS,
  SIDEBAR_TOOLTIP_DELAY_MS,
} from "@/lib/sidebar-control-styles";
import type { Locale } from "@/i18n/config";
import type { MessageKey } from "@/lib/i18n-keys";
import {
  CHANGELOG_ENTRIES,
  formatChangelogAge,
  formatChangelogDate,
} from "@/lib/changelog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Project } from "@/lib/types";

/** The bar unfolded. Exported for the Zen mode navigation block, which
 * unfolds out of the flow and must know its width to tidy up. */
export const EXPANDED_WIDTH = 256;
const COLLAPSED_WIDTH = 56;

/**
 * ─── The icon column ────────────────────── ──────────────────────
 *
 * An icon must NOT move one pixel between the open bar and the bar
 * folded: it is the only mark that survives the animation, and see it slide
 * of a few pixels makes the whole bar look like it's floating.
 *
 * The timing starts from the rail, where the icon is in the middle:
 *
 * rail 56 = 10 (gutter) + 9 + 18 (icon) + 9 + 10
 * └── center at 28, left edge at 19 ──┘
 *
 * Hence two constants held by hand in the two states — the gutter of
 * the nav (`px-2.5`) and the withdrawal of the line (`pl-[9px]`). Change them without
 * redoing the addition resets the offset.
 *
 * What counts is the CENTER at 28, not the edge at 19: the edge is only enough
 * for 18 px glyphs. Two exceptions, therefore, both based on
 * the center — the account avatar (22 px, indented by 7) and the logo (26 px of
 * large, viewBox 104×96 at `h-6`), which we CENTER in the 36 px box instead
 * to align it from the left: placed at 19, it extended 4 px to the right.
 */
/** Nav, foot and brand line gutter. Both states. */
const GUTTER = "px-2.5";
/** Removing a line: 18 px icon → left edge 19 px from the bar. */
const ROW_PL = "pl-[9px]";
/** Same for the account avatar, wider by 4 px. */
const AVATAR_PL = "pl-[7px]";
/** The box of a folded line: 9 + 18 + 9. Center at 28 from the bar. */
const ROW_BOX = "w-9";
/**
 * Tooltips in the bar wait before appearing. Without this delay they
 * spring up under the pointer which only crosses the bar to
 * come out, and then land across the secondary sidebar.
 * `disableHoverableContent` finishes the job: the tooltip does not hover,
 * it therefore cannot retain the pointer that we thought we had output.
 */

/** A sidebar nav item that can advertise its `G`-chord second key (e.g. "M"). */
export type AppNavItem = NavItem & {
  shortcut?: string;
  /**
   * Replays the `badge` in a corner of the icon when the sidebar is FOLDED (the
   * normal badges are not returned there due to lack of space). To be worn by EVERYONE
   * input that signals something — “agent in progress” spinner, pad
   * unread, queue counter: rail mode is that of the pages where we sort,
   * and this is precisely where the line must not disappear.
   *
   * The corner only holds a COMPACT shape (≈ 14 px). A larger badge —
   * a three-character counter, two marks side by side — goes through
   * `badgeCollapsed`, which gives it its folded version.
   */
  showBadgeCollapsed?: boolean;
  /**
   * What the corner patch bears in place of the `badge`, when the latter is not there
   * would not hold: counter capped at “9+” (`countBadgeCollapsed`), or a
   * only marks of a badge which combines several. Real case: the entrance
   * “Home” in project mode combines the Smart Assign triangle and a counter;
   * folded, it keeps the triangle, and the counter only in default.
   */
  badgeCollapsed?: ReactNode;
  /**
   * Right-click actions on the row. Reserved for entries that bear a
   * OBJECT that we can do something with — a draft of a project, which we throw away
   * from there rather than reopening it. A navigation entry does not have one.
   */
  contextActions?: ContextMenuAction[];
};
export type AppNavSection = Omit<NavSection, "items"> & { items: AppNavItem[] };

const MotionLink = motion.create(Link);

const WhatsNewDialog = dynamic(
  () => import("@/components/whats-new-dialog").then((m) => m.WhatsNewDialog),
  { ssr: false },
);

/* ─── Brand ────────────────────────────────────────────────────────── */

/** Minddy mark for web, Windows, Linux, and the collapsed macOS rail. */
function SidebarBrand() {
  return (
    <Link
      href="/home"
      aria-label="minddy"
      className={cn(
        "sidebar-brand-mark inline-flex shrink-0 items-center justify-center text-sidebar-foreground",
        ROW_BOX,
      )}
    >
      <MinddyLogo className={cn("h-6 w-auto", ENV_LOGO_TINT[getAppEnv()])} />
    </Link>
  );
}

function SidebarTopAction({
  icon: Icon,
  label,
  href,
  onClick,
  onWarm,
  badge,
  shortcut,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  href?: string;
  onClick?: () => void;
  onWarm?: () => void;
  badge?: ReactNode;
  shortcut?: ReactNode;
}) {
  const className = cn(
    SIDEBAR_COMPACT_CONTROL_CLASS,
    "text-sidebar-foreground/65 hover:text-sidebar-foreground",
  );
  const content = (
    <>
      <Icon className="size-[18px]" />
      {badge != null ? (
        <span className="absolute -right-0.5 -top-0.5 flex items-center justify-center rounded-full bg-sidebar">
          {badge}
        </span>
      ) : null}
    </>
  );
  const control = href ? (
    <Link href={href} aria-label={label} className={className}>
      {content}
    </Link>
  ) : (
    <button
      type="button"
      aria-label={label}
      className={className}
      onClick={onClick}
      onPointerEnter={onWarm}
      onFocus={onWarm}
    >
      {content}
    </button>
  );

  return (
    <Tooltip
      delayDuration={SIDEBAR_TOOLTIP_DELAY_MS}
      disableHoverableContent
    >
      <TooltipTrigger asChild>{control}</TooltipTrigger>
      <TooltipContent side="bottom" className="flex items-center gap-2">
        <span>{label}</span>
        {shortcut}
      </TooltipContent>
    </Tooltip>
  );
}

function SidebarTopActions({
  collapsed,
  inbox,
  onSearch,
  onSearchWarm,
}: {
  collapsed: boolean;
  inbox: AppNavItem;
  onSearch: () => void;
  onSearchWarm?: () => void;
}) {
  const t = useTranslations("Nav");
  const tk = useTranslations("Keyboard");
  const modKey = useModKey();
  if (collapsed) return null;

  return (
    <div className="ml-auto flex shrink-0 items-center gap-1">
      <SidebarTopAction
        icon={Search}
        label={t("searchPlaceholder")}
        onClick={onSearch}
        onWarm={onSearchWarm}
        shortcut={<KbdSequence keys={[[modKey, "K"]]} size="sm" />}
      />
      <SidebarTopAction
        icon={inbox.icon!}
        label={inbox.label}
        href={inbox.href as string}
        badge={inbox.badgeCollapsed ?? inbox.badge}
        shortcut={
          inbox.shortcut ? (
            <KbdSequence
              keys={[[CHORD_PREFIX.toUpperCase()], [inbox.shortcut]]}
              separator={tk("then")}
              size="sm"
            />
          ) : null
        }
      />
    </div>
  );
}

function SidebarQuickActions({
  collapsed,
  onScratchpadWarm,
}: {
  collapsed: boolean;
  onScratchpadWarm?: () => void;
}) {
  return (
    <div className={cn("flex shrink-0 gap-1 pt-3", GUTTER)}>
      <NewMenu variant="sidebar" collapsed={collapsed} />
      {!collapsed ? (
        <ScratchpadTrigger variant="sidebar" onWarm={onScratchpadWarm} />
      ) : null}
    </div>
  );
}

/* ─── Nav ──────────────────────────────────────────────────────────── */

function SidebarRow({
  item,
  collapsed,
}: {
  item: AppNavItem;
  collapsed: boolean;
}) {
  const Icon = item.icon;
  const active = item.active;
  const tk = useTranslations("Keyboard");
  // While a G-chord is armed, surface this row's second key as a Kbd hint
  // (AutoKap-style) — takes the trailing slot over the badge for the moment.
  const chordPrefix = useChordPrefix();
  const hint =
    !collapsed && chordPrefix === CHORD_PREFIX && item.shortcut
      ? item.shortcut
      : null;

  const rowClass = cn(
    "group relative flex h-9 cursor-pointer items-center gap-3 rounded-lg text-sm font-medium transition-colors",
    // The left indent is the SAME in both states (see the column of
    // icons at the head of the file): the icon does not move when the bar is animated.
    // Folded, the line closes at 36 px on its icon — 9 + 18 + 9.
    ROW_PL,
    collapsed ? cn(ROW_BOX, "gap-0 pr-[9px]") : "pr-3",
    active
      ? "bg-sidebar-accent text-sidebar-accent-foreground"
      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
    item.disabled && "pointer-events-none opacity-50",
  );

  const collapsedBadge = item.badgeCollapsed ?? item.badge;

  const inner = (
    <>
      {Icon ? <Icon className="h-[18px] w-[18px] shrink-0" /> : null}
      {!collapsed ? <span className="truncate">{item.label}</span> : null}
      {hint ? (
        <Kbd size="sm" className="ml-auto shrink-0">
          {hint}
        </Kbd>
      ) : !collapsed && item.badge != null ? (
        <span className="ml-auto flex items-center">{item.badge}</span>
      ) : null}
      {/* Folded: the badge (“current agent” spinner / unread badge) folds
          in the corner of the icon — otherwise the information disappears in rail mode. */}
      {collapsed && item.showBadgeCollapsed && collapsedBadge != null ? (
        <span className="absolute right-1 top-1 flex items-center justify-center rounded-full bg-sidebar">
          {collapsedBadge}
        </span>
      ) : null}
    </>
  );

  // Preheating of board caches on hover / keyboard focus (MIN-89): on
  // a project entry only — other routes do not have a range of
  // requests to be covered. `projectIdFromPath` only returns an id for
  // /projects/<uuid>, so the section links (…/objectives) preheat it
  // also, what exactly is wanted.
  const prefetchProject = usePrefetchProject();
  const warm = item.href
    ? () => {
        const projectId = projectIdFromPath(item.href as string);
        if (projectId) prefetchProject(projectId);
      }
    : undefined;

  // Right click: the same menu anchored to the pointer as the board cards, on the
  // only lines that carry actions (today project drafts).
  const [menuPosition, setMenuPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const openContextMenu = item.contextActions?.length
    ? (e: MouseEvent) => {
        e.preventDefault();
        setMenuPosition({ x: e.clientX, y: e.clientY });
      }
    : undefined;

  let row: ReactNode;
  if (item.href) {
    row = (
      <MotionLink
        href={item.href}
        className={rowClass}
        aria-current={active ? "page" : undefined}
        onMouseEnter={warm}
        onFocus={warm}
        onContextMenu={openContextMenu}
        whileTap={{ scale: 0.97 }}
        transition={transitions.snappy}
      >
        {inner}
      </MotionLink>
    );
  } else {
    row = (
      <motion.button
        type="button"
        onClick={item.onClick}
        disabled={item.disabled}
        onContextMenu={openContextMenu}
        className={cn(rowClass, "text-left", !collapsed && "w-full")}
        whileTap={{ scale: 0.97 }}
        transition={transitions.snappy}
      >
        {inner}
      </motion.button>
    );
  }

  // ⚠ The `<Tooltip>` is rendered UNCONDITIONALLY, and it is its OPENING which
  // varies (MIN-313). Wrapping conditionally would change the TYPE of
  // the element rendered at this position, and React does not reconcile two types
  // different: it dismantles the subtree and mounts a new one, therefore the DOM node
  // is replaced and the focus it had falls on <body>. Here relaxation
  // is daily — `collapsed` switches each time the bar is hovered: we
  // clicks a project entry, `onFocusCapture` only retains the focus
  // keyboard, the pointer leaves, 150 ms later the focused line is
  // replaced, and the tab starts again from the top of the document.
  row = (
    <Tooltip
      delayDuration={SIDEBAR_TOOLTIP_DELAY_MS}
      disableHoverableContent
      open={collapsed || item.shortcut ? undefined : false}
    >
      <TooltipTrigger asChild>{row}</TooltipTrigger>
      <TooltipContent side="right" className="flex items-center gap-2">
        <span>{item.tooltip ?? item.label}</span>
        {item.shortcut && (
          <>
            <Kbd size="sm">{CHORD_PREFIX.toUpperCase()}</Kbd>
            <span>{tk("then")}</span>
            <Kbd size="sm">{item.shortcut}</Kbd>
          </>
        )}
      </TooltipContent>
    </Tooltip>
  );

  if (!item.contextActions?.length) return row;
  return (
    <>
      {row}
      {/* Short menu: no search field, it would only add noise. */}
      <IssueContextMenu
        position={menuPosition}
        onClose={() => setMenuPosition(null)}
        actions={item.contextActions}
        searchable={false}
      />
    </>
  );
}

function SidebarNav({
  sections,
  collapsed,
  currentProject,
  projects,
  onMenuOpenChange,
}: {
  sections: AppNavSection[];
  collapsed: boolean;
  currentProject: Project | null;
  projects: Project[];
  onMenuOpenChange?: (open: boolean) => void;
}) {
  return (
    <nav
      className={cn(
        "scrollbar-quiet flex-1 overflow-x-hidden overflow-y-auto pt-1 pb-2",
        GUTTER,
      )}
    >
      {sections.map((section, index) => (
        <div key={section.key ?? index} className={cn(index > 0 && "mt-4")}>
          {section.label && !collapsed ? (
            <div
              className={cn(
                "truncate pt-1 pr-3 pb-1 text-[11px] font-medium tracking-wide text-sidebar-foreground/45",
                ROW_PL,
              )}
            >
              {section.label}
            </div>
          ) : null}
          <ul className="flex flex-col gap-1">
            {section.items.map((item) => (
              <li key={item.key}>
                {item.key === "home-back" && currentProject ? (
                  <ProjectContextRow
                    homeItem={item}
                    currentProject={currentProject}
                    projects={projects}
                    collapsed={collapsed}
                    onMenuOpenChange={onMenuOpenChange}
                  />
                ) : (
                  <SidebarRow item={item} collapsed={collapsed} />
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function ProjectContextRow({
  homeItem,
  currentProject,
  projects,
  collapsed,
  onMenuOpenChange,
}: {
  homeItem: AppNavItem;
  currentProject: Project;
  projects: Project[];
  collapsed: boolean;
  onMenuOpenChange?: (open: boolean) => void;
}) {
  const t = useTranslations("Nav");
  const tk = useTranslations("Keyboard");
  const pathname = usePathname();
  const prefetchProject = usePrefetchProject();
  const compactBadge = homeItem.badgeCollapsed ?? homeItem.badge;

  const projectTrigger = (
    <DropdownMenuTrigger
      aria-label={currentProject.name}
      className={cn(
        "flex h-9 cursor-pointer items-center rounded-lg text-sm font-medium text-sidebar-foreground/70 outline-none transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground focus-visible:bg-sidebar-accent focus-visible:text-sidebar-foreground",
        collapsed
          ? cn(ROW_BOX, ROW_PL, "gap-0 pr-[9px]")
          : "min-w-0 flex-1 gap-2 px-2.5 text-left",
      )}
    >
      <ProjectOrb
        seed={projectOrbSeed(currentProject)}
        iconUrl={currentProject.icon_url}
        className="size-[18px] rounded-[5px]"
      />
      {!collapsed ? (
        <>
          <span className="min-w-0 flex-1 truncate">{currentProject.name}</span>
          <ChevronDown
            className="size-3.5 shrink-0 text-sidebar-foreground/45"
            aria-hidden
          />
        </>
      ) : null}
    </DropdownMenuTrigger>
  );

  return (
    <DropdownMenu onOpenChange={onMenuOpenChange}>
      {collapsed ? (
        <Tooltip delayDuration={SIDEBAR_TOOLTIP_DELAY_MS} disableHoverableContent>
          <TooltipTrigger asChild>{projectTrigger}</TooltipTrigger>
          <TooltipContent side="right">{currentProject.name}</TooltipContent>
        </Tooltip>
      ) : (
        <div className="flex items-center gap-1">
          <Tooltip delayDuration={SIDEBAR_TOOLTIP_DELAY_MS} disableHoverableContent>
            <TooltipTrigger asChild>
              <MotionLink
                href={homeItem.href as string}
                aria-label={homeItem.label}
                className="relative flex h-9 w-12 shrink-0 cursor-pointer items-center justify-center gap-0.5 rounded-lg text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground focus-visible:bg-sidebar-accent focus-visible:text-sidebar-foreground"
                whileTap={{ scale: 0.97 }}
                transition={transitions.snappy}
              >
                <ChevronLeft className="size-3.5" aria-hidden />
                <Home className="size-[18px]" aria-hidden />
                {compactBadge != null ? (
                  <span className="absolute right-0.5 top-0.5 flex items-center justify-center rounded-full bg-sidebar">
                    {compactBadge}
                  </span>
                ) : null}
              </MotionLink>
            </TooltipTrigger>
            <TooltipContent side="right" className="flex items-center gap-2">
              <span>{homeItem.label}</span>
              {homeItem.shortcut ? (
                <KbdSequence
                  keys={[[CHORD_PREFIX.toUpperCase()], [homeItem.shortcut]]}
                  separator={tk("then")}
                  size="sm"
                />
              ) : null}
            </TooltipContent>
          </Tooltip>
          {projectTrigger}
        </div>
      )}

      <DropdownMenuContent side="right" align="start" sideOffset={6} className="w-60">
        <DropdownMenuLabel>{t("projects")}</DropdownMenuLabel>
        {projects.map((project) => {
          const href = projectTabHref(pathname, project.id);
          const current = project.id === currentProject.id;
          return (
            <DropdownMenuItem key={project.id} asChild>
              <Link
                href={href}
                aria-current={current ? "page" : undefined}
                onMouseEnter={() => prefetchProject(project.id)}
                onFocus={() => prefetchProject(project.id)}
              >
                <ProjectOrb
                  seed={projectOrbSeed(project)}
                  iconUrl={project.icon_url}
                  className="size-[18px] rounded-[5px]"
                />
                <span className="min-w-0 flex-1 truncate">{project.name}</span>
                {current ? <Check className="ml-auto size-4 shrink-0" /> : null}
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ─── Footer ───────────────────────────────────────────────────────── */

function AccountButton({
  collapsed,
  onMenuOpenChange,
}: {
  collapsed: boolean;
  onMenuOpenChange?: (open: boolean) => void;
}) {
  const t = useTranslations("Nav");
  const { user, signOut } = useAuth();
  const isAdmin = useIsAdmin();
  const meta = user?.user_metadata as AuthNameMeta | undefined;
  const name = authDisplayName(meta, user?.email ?? null, t("accountFallback"));
  const seed = useMyAvatarSource();

  return (
    <DropdownMenu onOpenChange={onMenuOpenChange}>
      <DropdownMenuTrigger
        className={cn(
          "flex h-10 cursor-pointer items-center rounded-lg outline-none transition-colors hover:bg-sidebar-accent focus-visible:bg-sidebar-accent",
          // The avatar is 22 px: its own removal refocuses it on the same
          // vertical than the 18 px icons (see the icons column).
          AVATAR_PL,
          collapsed ? cn(ROW_BOX, "pr-[7px]") : "w-full gap-3 pr-3 text-left",
        )}
      >
        <UserAvatar seed={seed} className="size-[22px]" />
        {!collapsed && (
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {name}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-56">
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings />
            {t("accountSettings")}
          </Link>
        </DropdownMenuItem>
        {/* Secondary account destinations stay grouped here so the primary
            sidebar footer only carries the account and status controls. */}
        <DropdownMenuItem asChild>
          <Link href="/statistics">
            <BarChart3 />
            {t("statistics")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/trash">
            <Trash2 />
            {t("trash")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/billing">
            <CreditCard />
            {t("billing")}
          </Link>
        </DropdownMenuItem>
        {isAdmin && (
          <DropdownMenuItem asChild>
            <Link href="/admin">
              <Shield />
              {t("adminDashboard")}
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => void signOut()}>
          <LogOut />
          {t("signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const CHANGELOG_PREVIEW_ENTRIES = CHANGELOG_ENTRIES.slice(0, 3);

function ChangelogTimelineMarker({
  position,
}: {
  position: "first" | "middle" | "last";
}) {
  return (
    <span
      aria-hidden
      className="relative flex w-4 shrink-0 self-stretch items-center justify-center"
    >
      {position !== "first" ? (
        <span className="absolute top-0 h-[calc(50%-6px)] w-px bg-border" />
      ) : null}
      <span className="relative z-10 size-2.5 rounded-full border-2 border-muted-foreground/60 bg-popover" />
      {position !== "last" ? (
        <span className="absolute bottom-0 h-[calc(50%-6px)] w-px bg-border" />
      ) : null}
    </span>
  );
}

function ChangelogButton({
  productFeedbackUrl,
  onMenuOpenChange,
}: {
  productFeedbackUrl: string | null;
  onMenuOpenChange?: (open: boolean) => void;
}) {
  const t = useTranslations("Nav");
  const tc = useTranslations("Changelog");
  const locale = useLocale() as Locale;
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMounted, setDialogMounted] = useState(false);
  const handleMenuOpenChange = (nextOpen: boolean) => {
    setMenuOpen(nextOpen);
    onMenuOpenChange?.(nextOpen);
  };

  const control = (
    <button
      type="button"
      aria-label={t("whatsNew")}
      className={SIDEBAR_COMPACT_CONTROL_CLASS}
    >
      <CircleHelp className="size-[18px]" />
    </button>
  );

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={handleMenuOpenChange}>
        <DropdownMenuTrigger asChild>{control}</DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" className="w-80">
          <DropdownMenuLabel className="font-normal text-muted-foreground">
            {t("whatsNew")}
          </DropdownMenuLabel>
          <ol>
            {CHANGELOG_PREVIEW_ENTRIES.map((entry, index) => (
              <li
                key={entry.id}
                className="flex h-8 items-center gap-1.5 px-2.5 text-sm leading-tight"
              >
                <ChangelogTimelineMarker
                  position={index === 0 ? "first" : "middle"}
                />
                <span className="min-w-0 flex-1 truncate">
                  {tc(
                    `entry_${entry.id}_title` as MessageKey<"Changelog">,
                  )}
                </span>
                <time
                  dateTime={entry.date}
                  title={formatChangelogDate(entry.date, locale)}
                  className="shrink-0 text-xs tabular-nums text-muted-foreground"
                >
                  {formatChangelogAge(entry.date, locale)}
                </time>
              </li>
            ))}
          </ol>
          <DropdownMenuItem
            onSelect={() => {
              handleMenuOpenChange(false);
              setDialogMounted(true);
              setDialogOpen(true);
            }}
            className="h-8 cursor-pointer gap-1.5 py-0 max-[1199px]:py-0"
          >
            <ChangelogTimelineMarker position="last" />
            <span className="min-w-0 flex-1 truncate">
              {t("viewFullChangelog")}
            </span>
          </DropdownMenuItem>
          {productFeedbackUrl ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => {
                  handleMenuOpenChange(false);
                  window.open(
                    productFeedbackUrl,
                    "_blank",
                    "noopener,noreferrer",
                  );
                }}
                className="cursor-pointer py-1.5 max-[1199px]:py-1.5"
              >
                <Megaphone className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">
                  {t("shareFeedback")}
                </span>
                <ArrowUpRight className="ml-auto size-4 shrink-0 text-muted-foreground" />
              </DropdownMenuItem>
            </>
          ) : null}
          <DropdownMenuSeparator />
          <p className="flex h-8 items-center justify-between gap-3 px-2.5 text-xs text-muted-foreground">
            <span>{t("version")}</span>
            <span className="tabular-nums">{APP_VERSION}</span>
          </p>
        </DropdownMenuContent>
      </DropdownMenu>
      {dialogMounted ? (
        <WhatsNewDialog open={dialogOpen} onOpenChange={setDialogOpen} />
      ) : null}
    </>
  );
}

function FooterRow({
  icon: Icon,
  label,
  onClick,
  collapsed,
  active = false,
  disabled = false,
  iconClassName,
  trailingIcon: TrailingIcon,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  collapsed: boolean;
  active?: boolean;
  /**
   * A line that only NOTICES — downloading an update in
   * course. It keeps its place, its tooltip and its wording; only the gesture
   * disappears.
   *
   * ⚠ `aria-disabled` and NOT `disabled`: a deactivated button no longer emits
   * pointer event, so no more `pointerenter` — and the tooltip of the
   * rail mode, which is the ONLY place the label reads when the bar is
   * folded, would never open. We therefore remove the action (the `onClick` is not
   * not plugged in) without removing the line at the pointer.
   */
  disabled?: boolean;
  iconClassName?: string;
  trailingIcon?: LucideIcon;
}) {
  const btn = (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      aria-disabled={disabled || undefined}
      className={cn(
        "flex h-9 items-center rounded-lg text-sm font-medium transition-colors",
        disabled
          ? "cursor-default"
          : "cursor-pointer hover:bg-sidebar-accent hover:text-foreground",
        active ? "bg-sidebar-accent text-foreground" : "text-muted-foreground",
        ROW_PL,
        collapsed ? cn(ROW_BOX, "pr-[9px]") : "w-full gap-3 pr-3 text-left",
      )}
    >
      <Icon className={cn("size-[18px] shrink-0", iconClassName)} />
      {/* `truncate` (so no line break): the label remains mounted
          while the bar animates from 56 to 256 px, and without it “Share a
          return” folds into three lines in the first images of the
          unfolding before laying flat again. Cut cleanly, it is simply
          cropped by the `overflow-hidden` of the bar — we see nothing. */}
      {!collapsed && <span className="min-w-0 flex-1 truncate">{label}</span>}
      {!collapsed && TrailingIcon && <TrailingIcon className="size-4 shrink-0" />}
    </button>
  );
  // Same reason as `SidebarRow`: unconditional rendering, controlled opening. A
  // conditional envelope changes the type of the root, therefore replaces the node
  // and loses focus with each tilt of the rail (MIN-313).
  return (
    <Tooltip
      delayDuration={SIDEBAR_TOOLTIP_DELAY_MS}
      disableHoverableContent
      open={collapsed ? undefined : false}
    >
      <TooltipTrigger asChild>{btn}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Updating the desktop app, in the sidebar (MIN-353).
 *
 * ## Why here, and not just in the native box
 *
 * The box is an instant: it opens at the end of the download, and which
 * answers “later” no longer has anything in front of his eyes. This insert LASTS as long as
 * that the new version is waiting on disk — it's the same information, but
 * that we can find instead of catching up with her.
 *
 * ## One insert, and not one more line
 *
 * It was first a line like its neighbors (Corbeille, Partager un
 * return): she could barely see herself. An update is not a destination
 * more in a list of destinations, it's the only thing on the foot that DEMANDS
 * something — hence the frame, the label that names the version, and the button
 * full which carries the verb. The grammar of the neighboring lines would say the
 * opposite: “one more menu entry, we’ll see later”.
 *
 * ## It doesn't return anything most of the time, and that's the point
 *
 * On the web there is no bridge, so never a state other than `idle`, so
 * never an insert: nothing to condition at `isDesktop()`, the state is enough. And in
 * the app, the lack of updating is almost always the case — a foot of
 * sidebar which would carry a permanently dead frame would cost its place to
 * quelque chose d'utile.
 *
 * The click does not install: it reopens the native box, which asks for the last yes
 * (`installUpdate`, lib/desktop/bridge.ts).
 */
function UpdateFooterCard({ collapsed }: { collapsed: boolean }) {
  const t = useTranslations("Nav");
  const status = useDesktopUpdateStatus();
  if (status.state === "idle") return null;

  const ready = status.state === "ready";
  const install = () => getDesktopBridge()?.installUpdate();

  // **Rail mode: 56 px, and the frame does not fit there.** We land on the
  // grammar of neighboring lines — an icon in the box of 36, its
  // tooltip, and the same gesture. This is the only place on the bar where the shape
  // changes with width, because it is the only content of the foot which is not
  // not already a line.
  if (collapsed) {
    return (
      <FooterRow
        icon={ready ? ArrowDownToLine : Loader2}
        // Folded, the line only has its icon to distinguish itself from its
        // neighbors: it takes the color of the button it replaces.
        iconClassName={ready ? "text-primary" : "animate-spin"}
        // ⚠ BOTH messages carry `{version}`: called without its values,
        // next-intl silently falls back to the path of the key, and it's him
        // that we read on the screen (see CLAUDE.md).
        label={t(ready ? "updateReady" : "updateDownloading", {
          version: status.version,
        })}
        collapsed
        disabled={!ready}
        onClick={install}
      />
    );
  }

  return (
    <div className="mb-1 rounded-lg border border-border bg-sidebar-accent/50 p-2.5">
      {/* `text-pretty` and no `truncate`: the version number is half
          of the sentence, and he would fall first. Two lines are better
          than a “Update to ver…”. */}
      <p className="flex items-start gap-1.5 text-pretty text-xs leading-snug text-muted-foreground">
        {!ready && <Loader2 className="mt-px size-3 shrink-0 animate-spin" />}
        <span className="min-w-0">
          {t(ready ? "updateReady" : "updateDownloading", {
            version: status.version,
          })}
        </span>
      </p>
      {/* The button ONLY appears when it can act. A full grayed out button
          while downloading draws the eye to an impossible gesture — the
          spinning wheel of the wording already says that something is moving forward. */}
      {ready && (
        <Button
          size="sm"
          className="mt-2 w-full cursor-pointer"
          onClick={install}
        >
          {t("updateAction")}
        </Button>
      )}
    </div>
  );
}

function SidebarFooter({
  collapsed,
  onMenuOpenChange,
}: {
  collapsed: boolean;
  onMenuOpenChange?: (open: boolean) => void;
}) {
  const { productFeedbackUrl } = useRuntimeConfig();
  return (
    <div className="flex flex-col gap-0.5">
      {/* The update card stays above the stable account/status row because it
          appears only while a desktop update is active. */}
      <UpdateFooterCard collapsed={collapsed} />
      <div className="flex items-center gap-0.5">
        <div className={cn(!collapsed && "min-w-0 flex-1")}>
          <AccountButton
            collapsed={collapsed}
            onMenuOpenChange={onMenuOpenChange}
          />
        </div>
        {!collapsed ? (
          <>
            <UsageIndicator
              variant="sidebar"
              onOpenChange={onMenuOpenChange}
            />
            <ChangelogButton
              productFeedbackUrl={productFeedbackUrl}
              onMenuOpenChange={onMenuOpenChange}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}

/* ─── Shell ────────────────────────────────────────────────────────── */

/** Delay before fallback when the pointer leaves the bar in rail mode. Quite short
 * so that the fold follows the gesture, long enough to tolerate a brush. */
const RAIL_CLOSE_DELAY_MS = 150;

/**
 * The desktop sidebar. Hand-rolled (rather than mangue-ui's <Sidebar>) so the
 * nav region can animate the home ↔ project swap like AutoKap: the logo and
 * footer stay put while only the nav fades/slides — project enters from the
 * right, home from the left. `modeKey` ("home" | `project-<id>`) drives the
 * swap; navigating between a project's sub-pages keeps the same key (no replay).
 *
 * `overlay` is RAIL mode: the page has a secondary sidebar, and the
 * primary gives way to it. It only keeps its 56 px of icons in the flow
 * and unfolds ABOVE the secondary on hover (or when focus passes
 * keyboard), without ever shifting anything — the layout of a two-bar page is the
 * same, primary bar open or not.
 *
 * This is the ONLY fallback. There is no longer a button to fold the bar by hand,
 * nor ⌘B: the rail exists where a second bar needs the space, and
 * everywhere else the bar is simply open. A manual fallback in addition to
 * this one was two bars folded for two different reasons, one of which
 * that you had to know a shortcut to undo.
 */
export function AppSidebar({
  sections,
  modeKey,
  currentProject,
  projects,
  inbox,
  onSearch,
  onSearchWarm,
  onScratchpadWarm,
  overlay = false,
}: {
  sections: AppNavSection[];
  modeKey: string;
  currentProject: Project | null;
  projects: Project[];
  inbox: AppNavItem;
  onSearch: () => void;
  onSearchWarm?: () => void;
  onScratchpadWarm?: () => void;
  overlay?: boolean;
}) {
  const reduce = useReducedMotion();
  const dx = modeKey === "home" ? -16 : 16;

  // Rail mode: which unfolds the bar. Hover, keyboard focus (tab
  // in the nav should read it), and the account menu — it arises out of the
  // bar (Radix portal), so going there would count as leaving it.
  const [hovered, setHovered] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** The bar itself, to know if the pointer returns to it (see below). */
  const railRef = useRef<HTMLElement>(null);
  /** The pointer return watcher, and what to remove it. */
  const returnWatcher = useRef<(() => void) | null>(null);
  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    returnWatcher.current?.();
  }, []);

  // Belt and suspenders: navigation dismantles the line that had the focus,
  // and a `blur` then has no one to reach. Without this reset, the
  // bar could remain unfolded on the next page.
  //
  // SURVOL leaves with it, and for the same reason. Resetting from below
  // is connected to the rail mode output: it therefore sees nothing when we go
  // from one secondary bar page to ANOTHER — `overlay` never falls back.
  // This is the path of the palette: we fly over the bar, ⌘K puts on his veil
  // over it (the bar is no longer the target of the pointer, its `pointerleave`
  // may never come), we choose a page on the keyboard, and we arrive primary
  // UNFOLDED over the secondary, pointer at the other end of the screen.
  //
  // Falling back upon arrival is what we want anyway, including when
  // it's a click IN the bar that navigated: that's what the
  // comment from `onFocusCapture`, and `onPointerMove` catches up at the slightest
  // movement in the case of the pointer remaining on it.
  const routeKey = usePathname();
  useEffect(() => {
    setFocusWithin(false);
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    returnWatcher.current?.();
    setHovered(false);
  }, [routeKey]);

  // Same story for hover and account menu, but when EXIT mode
  // rail: their installers are connected to `overlay`. Exit a barred page
  // secondary PASSING THROUGH THE BAR (we hover over it, it is unfolded, we
  // click “Home”) so disconnect `onPointerLeave` with the pointer still
  // above: no one will ever see it come out, and `hovered` remains true for
  // always. The next secondary bar page — reached by the palette,
  // so without going back over the bar — then opened primary UNFOLDED
  // over the secondary, pointer at the other end of the screen, and nothing
  // couldn't close it.
  //
  // Outside rail mode these two states are not read: resetting them does not
  // changes nothing to what we see, and guarantees that we return to the clean rail.
  useEffect(() => {
    if (overlay) return;
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    // The pointer watcher goes with it: exiting rail mode while it waits
    // returning the pointer would leave it connected to a bar that no longer has
    // nothing to close.
    returnWatcher.current?.();
    setHovered(false);
    setMenuOpen(false);
  }, [overlay]);

  const openRail = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    // The pointer return watcher is DISARMED here (MIN-314): the bar
    // has just regained control, he has nothing left to decide. Without that, he
    // remained connected and closed the rail at the first mouse movement —
    // sometimes minutes later, unrelated to the gesture that armed him.
    returnWatcher.current?.();
    setHovered(true);
  };

  /**
   * Does the pointer move out of the bar THROUGH THE macOS BUTTONS? (MIN-291)
   *
   * They are native: drawn over the page, they receive no
   * DOM event and do not emit any. Go and click them from a rail
   * unfolded, it is therefore EXIT from the bar from Chromium's point of view — the rail
   * closes, the pimples disappear with it, and they become
   * impossible to reach. The pointer will not even have finished its gesture.
   *
   * We recognize this outing from the place where it takes place, for lack of a better word: the
   * top left corner, the same one that the score line reserves for them. There
   * box takes `trafficLightPosition` (desktop/src/main.ts) and the
   * `padding-left` de `.sidebar-brand-row` (app/globals.css) — trois endroits,
   * a single object, and they must be read together.
   */
  const leavesThroughWindowButtons = (e: { clientX: number; clientY: number }) =>
    windowButtons.reserved && e.clientX <= WINDOW_BUTTONS_WIDTH && e.clientY <= 60;

  /**
   * The pointer has gone to the buttons: we do not close, and we wait to
   * REVIEW it to decide. As long as it is on them, the page receives nothing;
   * his first return movement says if he enters the bar (she resumes
   * hand) or if it is elsewhere (we close it). Without this lookout, the rail
   * would remain open indefinitely — and this is exactly the fault that the
   * comments above describe, only worse.
   */
  const watchPointerReturn = () => {
    returnWatcher.current?.();
    const onMove = (event: PointerEvent) => {
      disarm();
      if (railRef.current?.contains(event.target as Node)) return;
      closeRail();
    };
    /**
     * The EMERGENCY withdrawal (MIN-314). The watcher above has no bounds:
     * it waits for a `pointermove` which may never come — the red light HIDES
     * the window instead of destroying it (desktop/src/main.ts), it is therefore
     * rail row unfolded and reopened as is, lookout still armed. A
     * sequence entirely on the keyboard then left the bar unfolded
     * over the secondary, until the first mouse movement.
     *
     * ⚠ **Not a timer.** This would reopen the fault that MIN-291 closed:
     * a rail that closes under a pointer on its way to the buttons. We
     * clings to what says that the gesture is FINISHED — the window has lost its
     * hand, or it is no longer visible.
     */
    const onGiveUp = () => {
      disarm();
      closeRail();
    };
    const onVisibility = () => {
      if (document.hidden) onGiveUp();
    };

    const disarm = () => {
      document.removeEventListener("pointermove", onMove);
      window.removeEventListener("blur", onGiveUp);
      document.removeEventListener("visibilitychange", onVisibility);
      returnWatcher.current = null;
    };

    document.addEventListener("pointermove", onMove, { once: true });
    window.addEventListener("blur", onGiveUp);
    document.addEventListener("visibilitychange", onVisibility);
    returnWatcher.current = disarm;
  };

  /**
   * Arm the fallback — and never REPELL him back if he is already armed. The deadline is here
   * to tolerate a brush, not to recharge: the net below
   * calls this every `pointermove` off the bar, and a timer resets
   * zero on each movement would only fire when the pointer stops.
   */
  const scheduleClose = () => {
    if (closeTimer.current) return;
    closeTimer.current = setTimeout(() => {
      closeTimer.current = null;
      setHovered(false);
    }, RAIL_CLOSE_DELAY_MS);
  };

  const closeRail = (e?: { clientX: number; clientY: number }) => {
    if (e && leavesThroughWindowButtons(e)) {
      watchPointerReturn();
      return;
    }
    scheduleClose();
  };

  /**
   * The net: **`pointerleave` is not guaranteed.** It assumes that the bar is
   * the target of the pointer when it leaves — but a veil can intervene
   * while hovering over it (the palette, a dialog box), and the pointer
   * then leaves without the bar finding out. `hovered` remains true, the primary
   * remains unfolded over the secondary, and nothing closes it anymore
   * that we did not return to fly over it to come out.
   *
   * As long as the bar is unfolded BY HOVER, we therefore check at the source:
   * a movement of the pointer outside the bar closes it, wherever it comes from.
   *
   * Nothing to do with `onPointerMove` on the bar, which does the opposite (open) —
   * and nothing that costs: neither state nor return, one `contains` per movement, and
   * only while the bar is unfolded (MIN-323).
   *
   * ⚠ Does not break MIN-291: on native macOS buttons, the page does not receive
   * NO movement. The returning watcher therefore keeps control in this case.
   */
  useEffect(() => {
    if (!overlay || !hovered) return;
    const onMove = (event: PointerEvent) => {
      if (railRef.current?.contains(event.target as Node)) return;
      scheduleClose();
    };
    document.addEventListener("pointermove", onMove);
    return () => document.removeEventListener("pointermove", onMove);
    // `scheduleClose` only reads refs: its closure may be out of date without
    // que rien ne change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlay, hovered]);

  const collapsed = overlay && !(hovered || focusWithin || menuOpen);

  /**
   * macOS buttons, in the desktop app (MIN-291). They land on the
   * mark line, in place of the mark — and we remove them when the bar
   * is FOLDED: 56 px does not hold three buttons plus the mark, and the
   * leaving it would overflow the navigation.
   *
   * It is `collapsed` who decides, not `overlay`: the bar unfolded ABOVE
   * the secondary is an unfolded bar like any other, it has its 256 px and
   * must therefore take back the buttons. Flying over the rail brings them back, leaving it
   * puts them aside — it's the same gesture that makes navigation
   * readable, and it is valid for everything that the mark line contains.
   *
   * What we deliver, on the other hand, does not follow the request but the RESULT — the
   * full screen takes them elsewhere without the bar knowing anything about it. And one
   * dialog box removes them without the place moving: we then draw
   * lures, otherwise the mark would jump at each opening. See
   * lib/use-window-buttons.ts.
   *
   * ⚠ **And only when the bar is RENDERED.** Under 768 px the AppShell
   * cache, but it remains mounted: without `wide`, it continued to request the
   * removal of the buttons as soon as its rail — invisible — folded, and their
   * keep a place that no one was looking at. The corner then returns to
   * the header (`HeaderWindowButtonsSlot`), which occupies it for real.
   */
  const wide = useWideLayout();
  useHoldWindowButtons("rail", wide && collapsed);
  const windowButtons = useWindowButtonsSlot(wide);

  // Two widths, and that's the whole mechanism: that which the bar OCCUPIES in
  // the flow, and that which it MEASURES. In rail mode the first one stays on the rail
  // whatever happens — the bar unfolds over the secondary, never to
  // side. Outside rail mode the two are equal, and the bar is therefore in the flow
  // without making it look that way.
  //
  // This ghost is also what makes the MODE CHANGE animable: quit
  // a page with a secondary sidebar does not change any structure, only
  // widths — 56 → 256 here, 320 → 0 for the gutter next door, on the same
  // curve. Everything to the right slides one block instead of jumping.
  const flowWidth = overlay ? COLLAPSED_WIDTH : EXPANDED_WIDTH;
  const asideWidth = collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH;
  const shellTransition = reduce ? { duration: 0 } : transitions.shell;

  return (
    <>
      {/* `initial` explicit, and not `initial={false}`: it is he who framer
          written in the server's HTML. Without width at first display, the
          gutter would start from zero and the whole frame would return to its place at
          hydration. In editing it is already the target: nothing comes alive. */}
      <motion.div
        aria-hidden
        className="h-full shrink-0"
        initial={{ width: flowWidth }}
        animate={{ width: flowWidth }}
        transition={shellTransition}
      />
      <motion.aside
        ref={railRef}
        data-collapsed={collapsed}
        initial={{ width: asideWidth }}
        animate={{ width: asideWidth }}
        transition={shellTransition}
        onPointerEnter={overlay ? openRail : undefined}
        // Arriving on a page with a secondary sidebar FOLDS the bar under a
        // pointer that does not move: it is the click on the entry that navigated,
        // so the pointer was already there and no `pointerenter` will come.
        // The slightest movement catches this state, instead of waiting for an exit
        // and a return.
        //
        // Disconnected as soon as the bar is open (MIN-323): `openRail` has
        // then nothing more to do, and without this guard each movement of
        // pointer on an unfolded bar crossed a `setState`.
        onPointerMove={overlay && !hovered ? openRail : undefined}
        // The EVENT has passed, and it matters: this is the exit location
        // which says if the pointer goes to the macOS buttons (see closeRail).
        onPointerLeave={overlay ? (e) => closeRail(e) : undefined}
        onFocusCapture={
          overlay
            ? (e) => {
                // `:focus-visible`, and not “has focus”: CLICK an entry
                // gives it the focus, and the bar then remained unfolded for a
                // once the pointer left - we had just navigated,
                // this is the precise moment when it must retreat. Only the focus
                // COMING FROM THE KEYBOARD (tabulation) holds it, because there there is no
                // has no pointer to reopen it.
                const el = e.target as HTMLElement;
                if (el.matches?.(":focus-visible")) setFocusWithin(true);
              }
            : undefined
        }
        onBlurCapture={
          overlay
            ? (e) => {
                // A loss of focus that does not designate ANY new target is
                // not necessarily an exit from the bar (MIN-313): that's what
                // produces disabling of the window — the menu bar
                // macOS, a ⌘Tab. Falling back on this would close the bar under a
                // pointer which has not moved.
                //
                // But this is ALSO what a click on an area not produced
                // focusable of the page: the focus falls on the document, and
                // sticking to “no target, we keep” left the bar
                // unfolded over the secondary for good, after a
                // simple tab in it. What separates the two is
                // who has the hand: the window still has it, or it has lost it.
                const next = e.relatedTarget as Node | null;
                if (next === null) {
                  if (!document.hasFocus()) return;
                  if (e.currentTarget.contains(document.activeElement)) return;
                  setFocusWithin(false);
                  return;
                }
                if (!e.currentTarget.contains(next)) {
                  setFocusWithin(false);
                }
              }
            : undefined
        }
        className={cn(
          // Always superimposed on its own ghost, rail mode or not:
          // This is what makes switching from one to the other a simple matter.
          // widths. Out of rail mode the ghost is exactly its width,
          // and nothing is seen.
          "absolute inset-y-0 left-0 z-40 flex h-full flex-col overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground",
          // Unfolded over the secondary, the two bars share the same
          // background: without a cast shadow, only the border separates them, and it
          // disappears in dark theme. An explicit shadow rather than
          // `shadow-2xl`, which cannot be seen on a black background. She blends in instead
          // to disappear suddenly: leave a page with a secondary sidebar by
          // hovering over the bar turns it off at the same time as everything snaps back into place.
          "transition-shadow duration-300",
          overlay && !collapsed && "shadow-[8px_0_32px_-8px_rgba(0,0,0,0.45)]",
        )}
      >
        {/* The top row keeps one stable DOM structure while the rail opens and
            closes, so keyboard focus is preserved. On macOS it hosts the native
            window controls; CSS hides the logo there, leaving search and inbox on
            the right. Web, Windows, and Linux keep the logo on the left. */}
        <div
          className={cn(
            "sidebar-brand-row relative flex h-[60px] shrink-0 items-center border-b border-border",
            GUTTER,
          )}
        >
          {windowButtons.decoy && <WindowButtonDecoys />}
          <SidebarBrand />
          <SidebarTopActions
            collapsed={collapsed}
            inbox={inbox}
            onSearch={onSearch}
            onSearchWarm={onSearchWarm}
          />
        </div>

        <SidebarQuickActions
          collapsed={collapsed}
          onScratchpadWarm={onScratchpadWarm}
        />

        {/* Nav — animated swap between home and project modes */}
        {reduce ? (
          <SidebarNav
            sections={sections}
            collapsed={collapsed}
            currentProject={currentProject}
            projects={projects}
            onMenuOpenChange={overlay ? setMenuOpen : undefined}
          />
        ) : (
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={modeKey}
              className="flex min-h-0 flex-1 flex-col"
              initial={{ opacity: 0, x: dx }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: dx }}
              transition={transitions.fade}
            >
              <SidebarNav
                sections={sections}
                collapsed={collapsed}
                currentProject={currentProject}
                projects={projects}
                onMenuOpenChange={overlay ? setMenuOpen : undefined}
              />
            </motion.div>
          </AnimatePresence>
        )}

        {/* Footer */}
        <div className={cn("pt-2 pb-2.5", GUTTER)}>
          <SidebarFooter
            collapsed={collapsed}
            onMenuOpenChange={overlay ? setMenuOpen : undefined}
          />
        </div>
      </motion.aside>
    </>
  );
}

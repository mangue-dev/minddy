"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { APP_VERSION } from "@/lib/app-version";
import { getDesktopBridge } from "@/lib/desktop/bridge";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";
import {
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  cn,
  type NavItem,
  type NavSection,
} from "mangue-ui";
import { Kbd, KbdSequence } from "@/components/ui/kbd";
import {
  IssueContextMenu,
  type ContextMenuAction,
} from "@/components/issue-context-menu";
import { useNavigationContextActions } from "@/components/navigation-context-actions";
import {
  LogOut,
  Megaphone,
  BarChart3,
  CreditCard,
  Settings,
  ArrowUpRight,
  Shield,
  CircleHelp,
  Trash2,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Home,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { authDisplayName, type AuthNameMeta } from "@/lib/display-name";
import { useIsAdmin } from "@/lib/use-is-admin";
import { useMyAvatarSource } from "@/lib/use-my-avatar";
import { ProjectOrb } from "@/components/project-orb";
import { UserAvatar } from "@/components/user-avatar";
import { projectOrbSeed } from "@/lib/project-orb-colors";
import { useChordPrefix, CHORD_PREFIX } from "@/lib/keyboard/keyboard-context";
import { transitions } from "@/lib/motion";
import { useSecondarySidebar } from "@/lib/secondary-sidebar-context";
import { projectIdFromPath, projectTabHref } from "@/lib/project-id-from-path";
import { usePrefetchProject } from "@/lib/use-prefetch-project";
import { usePrefetchPages } from "@/lib/use-pages-query";
import { useRuntimeConfig } from "@/lib/runtime-config-provider";
import { NewMenu } from "@/components/new-menu";
import { UsageIndicator } from "@/components/usage-indicator";
import {
  SIDEBAR_COMPACT_CONTROL_CLASS,
  SIDEBAR_TOOLTIP_DELAY_MS,
} from "@/lib/sidebar-control-styles";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { MessageKey } from "@/lib/i18n-keys";
import { CHANGELOG_ENTRIES } from "@/lib/changelog";
import type { Project } from "@/lib/types";

/** Expanded width the sidebar keeps on every level — the old secondary
 * column's width (MIN-546): the sidebar never resizes anymore. */
export const EXPANDED_WIDTH = 320;

/**
 * ─── The icon column ────────────────────── ──────────────────────
 *
 * An icon must NOT move one pixel between the open bar and the bar
 * folded: it is the only mark that survives the animation, and see it slide
 * of a few pixels makes the whole bar look like it's floating.
 *
 * The timing historically started from the 56 px rail, where the icon is in the
 * middle:
 *
 * rail 56 = 10 (gutter) + 9 + 18 (icon) + 9 + 10
 * └── center at 28, left edge at 19 ──┘
 *
 * Hence two constants held by hand — the gutter of the nav (`px-2.5`) and
 * the withdrawal of the line (`pl-[9px]`). Change them without redoing the
 * addition resets the offset.
 *
 * What counts is the CENTER of the icon, not the edge: the edge is only enough
 * for 18 px glyphs. Two exceptions, both based on the center — the account
 * avatar (22 px, indented by 7) and the logo (26 px of large, viewBox
 * 104×96 at `h-6`).
 */
/** Nav, foot and brand line gutter. */
const GUTTER = "px-2.5";
/** Removing a line: 18 px icon. */
const ROW_PL = "pl-[9px]";
/** Same for the account avatar, wider by 4 px. */
const AVATAR_PL = "pl-[7px]";
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
   * This page descends in the sidebar's navigation levels (MIN-546): reaching
   * it swaps the primary sidebar to the page's teleported bar. The row bears
   * a chevron-right, after any badge, to say so before clicking.
   */
  descends?: boolean;
  /** Additional right-click actions for rows that represent editable objects. */
  contextActions?: ContextMenuAction[];
};
export type AppNavSection = Omit<NavSection, "items"> & { items: AppNavItem[] };

const MotionLink = motion.create(Link);

const WhatsNewDialog = dynamic(
  () => import("@/components/whats-new-dialog").then((m) => m.WhatsNewDialog),
  { ssr: false },
);

const ProductFeedbackDialog = dynamic(
  () => import("@/components/product-feedback-dialog").then((m) => m.ProductFeedbackDialog),
  { ssr: false },
);

/* ─── Brand ────────────────────────────────────────────────────────── */

function SidebarQuickActions() {
  return (
    <div className={cn("flex w-full min-w-0 shrink-0 gap-1")}>
      <NewMenu variant="sidebar" collapsed={false} />
    </div>
  );
}

/* ─── Nav ──────────────────────────────────────────────────────────── */

function SidebarRow({ item }: { item: AppNavItem }) {
  const Icon = item.icon;
  const active = item.active;
  const tk = useTranslations("Keyboard");
  const navigationActions = useNavigationContextActions(item.href);
  const contextActions = [...navigationActions, ...(item.contextActions ?? [])];
  // While a G-chord is armed, surface this row's second key as a Kbd hint
  // (AutoKap-style) — takes the trailing slot over the badge for the moment.
  const chordPrefix = useChordPrefix();
  const hint = chordPrefix === CHORD_PREFIX && item.shortcut ? item.shortcut : null;

  const rowClass = cn(
    "group relative flex h-9 cursor-pointer items-center gap-3 rounded-lg text-sm font-medium transition-colors",
    // The left indent aligns the 18 px icons with the account avatar and
    // the keyboard chord hints from the same edge.
    ROW_PL,
    "pr-3",
    active
      ? "bg-sidebar-accent text-sidebar-accent-foreground"
      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
    item.disabled && "pointer-events-none opacity-50",
  );

  const inner = (
    <>
      {Icon ? <Icon className="h-[18px] w-[18px] shrink-0" /> : null}
      <span className="min-w-0 truncate">{item.label}</span>
      {hint ? (
        <Kbd size="sm" className="ml-auto shrink-0">
          {hint}
        </Kbd>
      ) : (item.badge != null || item.descends) && (
        <span className="ml-auto flex items-center gap-2">
          {item.badge}
          {item.descends ? (
            <ChevronRight
              className="size-3.5 shrink-0 text-sidebar-foreground/40"
              aria-hidden
            />
          ) : null}
        </span>
      )}
    </>
  );

  // Preheating of board caches on hover / keyboard focus (MIN-89): on
  // a project entry only — other routes do not have a range of
  // requests to be covered. `projectIdFromPath` only returns an id for
  // /projects/<uuid>, so the section links (…/objectives) preheat it
  // also, what exactly is wanted.
  const prefetchProject = usePrefetchProject();
  const prefetchPages = usePrefetchPages();
  const warm = item.href
    ? () => {
        const projectId = projectIdFromPath(item.href as string);
        if (!projectId) return;
        prefetchProject(projectId);
        if (/\/pages(?:\/|$)/.test(item.href as string)) {
          prefetchPages(projectId);
        }
      }
    : undefined;

  // Right click: the same menu anchored to the pointer as the board cards, on the
  // only lines that carry actions (today project drafts).
  const [menuPosition, setMenuPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const openContextMenu = contextActions.length
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
        className={cn(rowClass, "text-left", "w-full")}
        whileTap={{ scale: 0.97 }}
        transition={transitions.snappy}
      >
        {inner}
      </motion.button>
    );
  }

  // The tooltip repeats what the row already says — a project name under its
  // own label is noise (MIN-546 review) — so only rows that carry REAL extra
  // information (a gating explanation, the resume hint of a draft, a G-chord)
  // get one. Entries that gain/lose their `tooltip` keep their DOM shape:
  // the wrapper is chosen by data, not hover state.
  const hasTooltip = Boolean(item.tooltip || item.shortcut);

  row = (
    <Tooltip
      delayDuration={SIDEBAR_TOOLTIP_DELAY_MS}
      disableHoverableContent
      open={hasTooltip ? undefined : false}
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
  return (
    <>
      {row}
      {/* Short menu: no search field, it would only add noise. */}
      <IssueContextMenu
        position={menuPosition}
        onClose={() => setMenuPosition(null)}
        actions={contextActions}
        searchable={false}
      />
    </>
  );
}

function SidebarNav({
  sections,
  currentProject,
  projects,
  onMenuOpenChange,
}: {
  sections: AppNavSection[];
  currentProject: Project | null;
  projects: Project[];
  onMenuOpenChange?: (open: boolean) => void;
}) {
  return (
    <nav
      className={cn(
        "scrollbar-quiet flex-1 overflow-x-hidden overflow-y-auto pt-[calc((var(--app-content-header-height)-2.25rem)/2)] pb-2",
        GUTTER,
      )}
    >
      {sections.map((section, index) => (
        <div key={section.key ?? index} className={cn(index > 0 && "mt-4")}>
          {section.label ? (
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
                    onMenuOpenChange={onMenuOpenChange}
                  />
                ) : (
                  <SidebarRow item={item} />
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
  onMenuOpenChange,
}: {
  homeItem: AppNavItem;
  currentProject: Project;
  projects: Project[];
  onMenuOpenChange?: (open: boolean) => void;
}) {
  const tk = useTranslations("Keyboard");
  const pathname = usePathname();
  const prefetchProject = usePrefetchProject();
  const homeActions = useNavigationContextActions(homeItem.href);
  const [homeMenuPosition, setHomeMenuPosition] = useState<{ x: number; y: number } | null>(null);

  const projectTrigger = (
    <DropdownMenuTrigger
      aria-label={currentProject.name}
      className={cn(
        "flex h-9 cursor-pointer items-center rounded-lg text-sm font-medium text-sidebar-foreground/70 outline-none transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground focus-visible:bg-sidebar-accent focus-visible:text-sidebar-foreground",
        "min-w-0 flex-1 gap-2 px-2.5 text-left",
      )}
    >
      <ProjectOrb
        seed={projectOrbSeed(currentProject)}
        iconUrl={currentProject.icon_url}
        className="size-[18px] rounded-[5px]"
      />
      <span className="min-w-0 flex-1 truncate">{currentProject.name}</span>
      <ChevronDown
        className="size-3.5 shrink-0 text-sidebar-foreground/45"
        aria-hidden
      />
    </DropdownMenuTrigger>
  );

  return (
    <>
    <DropdownMenu onOpenChange={onMenuOpenChange}>
      <div className="flex items-center gap-1">
        <Tooltip delayDuration={SIDEBAR_TOOLTIP_DELAY_MS} disableHoverableContent>
          <TooltipTrigger asChild>
            <MotionLink
              href={homeItem.href as string}
              aria-label={homeItem.label}
              onContextMenu={(event) => {
                event.preventDefault();
                setHomeMenuPosition({ x: event.clientX, y: event.clientY });
              }}
              className="relative flex h-9 w-12 shrink-0 cursor-pointer items-center justify-center gap-0.5 rounded-lg outline-hidden text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground focus-visible:bg-sidebar-accent focus-visible:text-sidebar-foreground"
              whileTap={{ scale: 0.97 }}
              transition={transitions.snappy}
            >
              <ChevronLeft className="size-3.5" aria-hidden />
              <Home className="size-[18px]" aria-hidden />
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

      {/* No label above the switcher list: the row itself names the project,
            the menu holds nothing but projects. */}
      <DropdownMenuContent side="right" align="start" sideOffset={6} className="w-60">
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
    <IssueContextMenu
      position={homeMenuPosition}
      onClose={() => setHomeMenuPosition(null)}
      actions={homeActions}
      searchable={false}
    />
    </>
  );
}

/* ─── Footer ───────────────────────────────────────────────────────── */

function AccountButton({
  onMenuOpenChange,
}: {
  onMenuOpenChange?: (open: boolean) => void;
}) {
  const t = useTranslations("Nav");
  const tCommon = useTranslations("Common");
  const { user, signOut } = useAuth();
  const { capabilities } = useRuntimeConfig();
  const hasManagedService = capabilities.managedBilling?.configured || capabilities.managedAi?.configured;
  const isAdmin = useIsAdmin();
  const confirmationId = useId();
  const confirmationTitleId = `${confirmationId}-title`;
  const confirmationDescriptionId = `${confirmationId}-description`;
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmationPending, setConfirmationPending] = useState(false);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const confirmationPendingRef = useRef(false);
  const meta = user?.user_metadata as AuthNameMeta | undefined;
  const name = authDisplayName(meta, user?.email ?? null, t("accountFallback"));
  const seed = useMyAvatarSource();

  useEffect(() => {
    onMenuOpenChange?.(menuOpen || confirmationPending || confirmationOpen);
  }, [confirmationOpen, confirmationPending, menuOpen, onMenuOpenChange]);

  const openSignOutConfirmation = () => {
    confirmationPendingRef.current = true;
    setConfirmationPending(true);
    setMenuOpen(false);
  };

  const finishOpeningSignOutConfirmation = (event: Event) => {
    if (!confirmationPendingRef.current) return;
    event.preventDefault();
    confirmationPendingRef.current = false;
    setConfirmationOpen(true);
    setConfirmationPending(false);
  };

  const confirmSignOut = () => {
    setConfirmationOpen(false);
    void signOut();
  };

  return (
    <Popover open={confirmationOpen} onOpenChange={setConfirmationOpen}>
      <PopoverAnchor asChild>
        <div>
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger
              className={cn(
                "flex h-10 cursor-pointer items-center rounded-lg outline-none transition-colors hover:bg-sidebar-accent focus-visible:bg-sidebar-accent",
                // The avatar is 22 px: its own removal refocuses it on the same
                // vertical than the 18 px icons (see the icons column).
                AVATAR_PL,
                "w-full gap-3 pr-3 text-left",
              )}
            >
              <UserAvatar seed={seed} className="size-[22px] max-w-none" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {name}
              </span>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              side="top"
              className="w-56"
              onCloseAutoFocus={finishOpeningSignOutConfirmation}
            >
              <DropdownMenuItem asChild>
                <Link href="/settings?tab=profile">
                  <UserAvatar seed={seed} className="size-4" />
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {name}
                  </span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {hasManagedService && (
                <DropdownMenuItem asChild>
                  <Link href="/billing">
                    <CreditCard />
                    {t("billing")}
                  </Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem asChild>
                <Link href="/settings">
                  <Settings />
                  {t("accountSettings")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/trash">
                  <Trash2 />
                  {t("trash")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/statistics">
                  <BarChart3 />
                  {t("statistics")}
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
              <DropdownMenuItem
                variant="destructive"
                onSelect={(event) => {
                  event.preventDefault();
                  openSignOutConfirmation();
                }}
              >
                <LogOut />
                {t("signOut")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </PopoverAnchor>
      <PopoverContent
        id={confirmationId}
        role="dialog"
        aria-labelledby={confirmationTitleId}
        aria-describedby={confirmationDescriptionId}
        side="top"
        align="start"
        sideOffset={8}
        collisionPadding={10}
        className="w-72 gap-3 rounded-xl p-3"
      >
        <PopoverHeader>
          <PopoverTitle id={confirmationTitleId}>
            {t("signOutConfirmTitle")}
          </PopoverTitle>
          <PopoverDescription id={confirmationDescriptionId}>
            {t("signOutConfirmDescription")}
          </PopoverDescription>
        </PopoverHeader>
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setConfirmationOpen(false)}
          >
            {tCommon("cancel")}
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={confirmSignOut}
          >
            {t("signOut")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
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
  productFeedbackIntegrationEnabled,
  productFeedbackUrl,
  onMenuOpenChange,
  portalOwner,
}: {
  productFeedbackIntegrationEnabled: boolean;
  productFeedbackUrl: string | null;
  onMenuOpenChange?: (open: boolean) => void;
  portalOwner: string;
}) {
  const t = useTranslations("Nav");
  const tc = useTranslations("Changelog");
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMounted, setDialogMounted] = useState(false);
  const [feedbackDialogOpen, setFeedbackDialogOpen] = useState(false);
  const [feedbackDialogMounted, setFeedbackDialogMounted] = useState(false);
  const [desktopVersion, setDesktopVersion] = useState<string | null>(null);

  useEffect(() => {
    const bridge = getDesktopBridge();
    if (bridge) setDesktopVersion(bridge.version);
  }, []);

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
        <DropdownMenuContent
          align="start"
          side="top"
          className="w-80"
          data-sidebar-owner={portalOwner}
        >
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
          {productFeedbackIntegrationEnabled || productFeedbackUrl ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => {
                  handleMenuOpenChange(false);
                  if (productFeedbackIntegrationEnabled) {
                    setFeedbackDialogMounted(true);
                    setFeedbackDialogOpen(true);
                  } else if (productFeedbackUrl) {
                    window.open(
                      productFeedbackUrl,
                      "_blank",
                      "noopener,noreferrer",
                    );
                  }
                }}
                className="cursor-pointer py-1.5 max-[1199px]:py-1.5"
              >
                <Megaphone className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">
                  {t("shareFeedback")}
                </span>
                {!productFeedbackIntegrationEnabled ? (
                  <ArrowUpRight className="ml-auto size-4 shrink-0 text-muted-foreground" />
                ) : null}
              </DropdownMenuItem>
            </>
          ) : null}
          <DropdownMenuSeparator />
          <div className="flex flex-col px-2.5 text-xs text-muted-foreground">
            <p className="flex h-8 items-center justify-between gap-3">
              <span>{t("webVersion")}</span>
              <span className="tabular-nums">{APP_VERSION}</span>
            </p>
            {desktopVersion ? (
              <p className="flex h-8 items-center justify-between gap-3">
                <span>{t("appVersion")}</span>
                <span className="tabular-nums">{desktopVersion}</span>
              </p>
            ) : null}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
      {dialogMounted ? (
        <WhatsNewDialog open={dialogOpen} onOpenChange={setDialogOpen} />
      ) : null}
      {feedbackDialogMounted ? (
        <ProductFeedbackDialog
          open={feedbackDialogOpen}
          onOpenChange={setFeedbackDialogOpen}
        />
      ) : null}
    </>
  );
}

function SidebarFooter({
  onMenuOpenChange,
  portalOwner,
}: {
  onMenuOpenChange?: (open: boolean) => void;
  portalOwner: string;
}) {
  const { productFeedbackIntegrationEnabled, productFeedbackUrl } = useRuntimeConfig();
  return (
    <div className="flex items-center gap-0.5">
      <div className="min-w-9 flex-1">
        <AccountButton onMenuOpenChange={onMenuOpenChange} />
      </div>
      <UsageIndicator
        variant="sidebar"
        onOpenChange={onMenuOpenChange}
      />
      <ChangelogButton
        portalOwner={portalOwner}
        productFeedbackIntegrationEnabled={productFeedbackIntegrationEnabled}
        productFeedbackUrl={productFeedbackUrl}
        onMenuOpenChange={onMenuOpenChange}
      />
    </div>
  );
}

/* ─── Levels (MIN-546) ─────────────────────────────────────────────── */

/**
 * Where the back row of a level 2/3 sidebar returns, and how the current
 * page is named there.
 *
 * Global pages go back to the home level; a project page goes back to the
 * project's Tickets page. Pure static route mapping: the level switches from
 * the server's HTML, no mounted-count involved.
 */
export function secondaryNavBackTarget(
  pathname: string,
  t: (key: MessageKey<"Nav">) => string
): { label: string; href: string } | null {
  const project = /\/projects\/([^/]+)\/(triage|feedback|objectives|pages|settings)(?:\/|$)/.exec(
    pathname,
  );
  if (project) {
    const labels: Record<string, MessageKey<"Nav">> = {
      triage: "triage",
      feedback: "feedback",
      objectives: "objectives",
      pages: "pages",
      settings: "projectSettings",
    };
    return { label: t(labels[project[2]]), href: `/projects/${project[1]}` };
  }
  if (pathname.startsWith("/trash")) return { label: t("trash"), href: "/home" };
  if (pathname.startsWith("/pull-requests")) return { label: t("pullRequests"), href: "/home" };
  if (pathname.startsWith("/routines")) return { label: t("routines"), href: "/home" };
  if (pathname.startsWith("/settings")) return { label: t("accountSettings"), href: "/home" };
  if (pathname.startsWith("/admin")) return { label: t("adminDashboard"), href: "/home" };
  return null;
}


/**
 * The desktop sidebar — the MODULAR primary (MIN-546).
 *
 * Hand-rolled (rather than mangue-ui's <Sidebar>) so the navigation can play
 * its level swaps: the top band (quick actions, then the page's filter strip)
 * and the footer stay put while only the panel between them fades/slides —
 * level 2 enters from the right, level 1 from the left. `modeKey` ("home" |
 * `project-<id>`) keys the level-1 panel; the panel itself is chosen by the
 * route: `routeHasSecondaryNav` routes swap the nav for the page's teleported
 * secondary bar, under the back row. The aside NEVER resizes: a level change
 * is a content swap inside the same column, and nothing outside moves.
 *
 * The teleport points (`headerSlot`, `slot`) are installed by the level-2/3
 * panel and stay mounted across route changes within it — the pages' bars
 * portal INTO the sidebar. Under 768 px none of this renders (mobile shell).
 */
export function AppSidebar({
  sections,
  modeKey,
  currentProject,
  projects,
  onLayerOpenChange,
}: {
  sections: AppNavSection[];
  modeKey: string;
  currentProject: Project | null;
  projects: Project[];
  onLayerOpenChange?: (open: boolean) => void;
}) {
  const reduce = useReducedMotion();
  const t = useTranslations("Nav");
  const pathname = usePathname();
  const router = useRouter();
  const { setHeaderSlot, setSlot } = useSecondarySidebar();

  // The active route names which level the sidebar shows. Route-derived, so
  // the server HTML already carries the right one; the `present` count is not
  // consulted — the level switches as the URL switches, and the teleported
  // bar arrives with it.
  const back = secondaryNavBackTarget(pathname, t);

  // Menus open out of the bar (Radix portal); while one is up, the hidden
  // navigation overlay must stay pinned (see SidebarNavOverlay).
  const handleMenuOpenChange = useCallback(
    (open: boolean) => {
      onLayerOpenChange?.(open);
    },
    [onLayerOpenChange],
  );

  const shellTransition = reduce ? { duration: 0 } : transitions.shell;

  const level1 = (
    <SidebarNav
      sections={sections}
      currentProject={currentProject}
      projects={projects}
      onMenuOpenChange={handleMenuOpenChange}
    />
  );

  /**
   * Level 2/3 panel: the back row — one level up, named after the current
   * page — and, under it, the empty frame the page's bar teleports into.
   * The panel stays mounted across sibling routes (pull requests →
   * routines); only the back row swaps.
   */
  const level2 = back && (
    <>
      <AnimatePresence mode="wait" initial={false}>
        {back && (
          <motion.div
            key={`back:${back.href}:${back.label}`}
            className="shrink-0 pt-[calc((var(--app-content-header-height)-2.25rem)/2)] pb-2"
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 16 }}
            transition={shellTransition}
          >
            {/* Same geometry as a nav row — gutter, 36 px height, rounded
                control, regular weight — it is a row, not a title stuck to
                the border. */}
            <div className={GUTTER}>
              <button
                type="button"
                onClick={() => router.push(back.href)}
                className={cn(
                  "relative flex h-9 w-full min-w-0 cursor-pointer items-center rounded-lg text-sm font-medium transition-colors",
                  ROW_PL,
                  "pr-3",
                  "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground focus-visible:bg-sidebar-accent focus-visible:text-sidebar-foreground",
                )}
              >
                {/* Out of the flow: the label is centered on the FULL row
                    width, the chevron does not push it off-center. */}
                <ChevronLeft
                  className="absolute left-[9px] top-1/2 size-[18px] shrink-0 -translate-y-1/2"
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate text-center">
                  {back.label}
                </span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Same horizontal gutter as the level-1 rows: whatever the level or
          the page, the options start and end at the same width. */}
      <div ref={setSlot} className={cn("flex min-h-0 flex-1 flex-col", GUTTER)} />
    </>
  );

  const railId = useId();

  // Navigation resets any transient state the route left behind; there is no
  // hover/fold machine anymore — the rail is gone (MIN-546).
  useEffect(() => {
    onLayerOpenChange?.(false);
    return () => onLayerOpenChange?.(false);
  }, [onLayerOpenChange]);

  return (
    <motion.aside
      id={railId}
      initial={{ width: EXPANDED_WIDTH }}
      animate={{ width: EXPANDED_WIDTH }}
      transition={shellTransition}
      className={cn(
        "flex h-full flex-col overflow-hidden bg-sidebar text-sidebar-foreground",
      )}
    >
      {/* The top band COMMANDS the column: level 1 keeps the creation
          controls, level 2/3 shows the page's filter strip teleported here.
          Pinned strip — what drives the list should be here. */}
      <div
        className={cn(
          "sidebar-brand-row relative flex h-[var(--app-content-header-height)] shrink-0 items-center",
          // Level 2/3: the teleported filter strip carries its own gutter, so
          // the band's px-2.5 must not wrap it a second time.
          !back && GUTTER,
          // Level 1 closes the band with the same hairline the level-2/3
          // filter strip draws (border-b on its header): the command row is
          // separated from the option rows below on every level.
          !back && "border-b border-border",
        )}
      >
        <div className={cn("flex h-full w-full min-w-0 items-center", back && "hidden")}>
          <SidebarQuickActions />
        </div>
        <div
          ref={setHeaderSlot}
          className={cn(
            "relative h-[var(--app-content-header-height)] w-full min-w-0",
            !back && "hidden",
          )}
        />
      </div>

      {/* Both levels live in the same flex-1 area, stacked absolutely so a
          swap animates over a stable layout instead of resizing anything. */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <AnimatePresence mode="wait" initial={false}>
          {back ? (
            <motion.div
              key="secondary-level"
              className="absolute inset-0 flex min-h-0 flex-col pr-0"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 16 }}
              transition={shellTransition}
            >
              {level2}
            </motion.div>
          ) : (
            <motion.div
              key={modeKey}
              className="absolute inset-0 flex min-h-0 flex-col"
              initial={{ opacity: 0, x: modeKey === "home" ? -16 : 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: modeKey === "home" ? -16 : 16 }}
              transition={reduce ? { duration: 0 } : transitions.fade}
            >
              {level1}
            </motion.div>
          )}
        </AnimatePresence>
        {/* Fades: scrolling options dissolve into the panel instead of being
            clipped hard against the band and the footer. The top fade lives
            on level 2/3 ONLY: it milestones the back row, which level 1 does
            not have (its first row is a plain option, e.g. pull requests,
            and a fade there just dims it). Starts BELOW the first row —
            geometry: row top padding + h-9 (2.25rem) + pb-2. Kept short
            (h-5): the panel's own scroll gap is wide, and a taller fade
            would sit on the first option row. */}
        {back ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-[calc((var(--app-content-header-height)-2.25rem)/2+2.25rem+0.5rem)] h-5 bg-gradient-to-b from-sidebar to-transparent"
          />
        ) : null}
        {/* Bottom fade, on every level: options dissolve just above the
            account line. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-sidebar to-transparent"
        />
      </div>

      {/* The account line is the only option present on EVERY level — the
          separator keeps it apart from whichever level runs above it. */}
      <div className={cn("pt-2 pb-2.5", GUTTER)}>
        <SidebarFooter
          portalOwner={railId}
          onMenuOpenChange={handleMenuOpenChange}
        />
      </div>
    </motion.aside>
  );
}

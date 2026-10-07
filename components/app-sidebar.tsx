"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon, ArrowLeft01Icon, ArrowRight01Icon, ArrowUpRight01Icon, Analytics01Icon, CreditCardIcon, Delete02Icon, HelpCircleIcon, Home01Icon, LogOutIcon, Megaphone01Icon, Settings01Icon, Shield01Icon, CheckIcon } from "@hugeicons/core-free-icons";
import { AppIcon } from "@/components/icon";
import { useMobileAccountIdentity } from "@/components/mobile-account";
import { Dialog, DialogContent, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { MobileSheetScrollArea } from "@/components/ui/mobile-sheet";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
  type Ref,
} from "react";
import Link from "@/components/app-link";
import dynamic from "next/dynamic";
import { APP_VERSION } from "@/lib/app-version";
import { getDesktopBridge } from "@/lib/desktop/bridge";
import { usePathname } from "next/navigation";
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
import { useAuth } from "@/lib/auth-context";
import { authDisplayName, type AuthNameMeta } from "@/lib/display-name";
import { useIsAdmin } from "@/lib/use-is-admin";
import { useBillingSummary } from "@/lib/use-billing-query";
import { type BillingPlanId } from "@/lib/billing-plans";
import { useMyAvatarSource } from "@/lib/use-my-avatar";
import { ProjectOrb } from "@/components/project-orb";
import { UserAvatar } from "@/components/user-avatar";
import { projectOrbSeed } from "@/lib/project-orb-colors";
import { useChordPrefix, CHORD_PREFIX } from "@/lib/keyboard/keyboard-context";
import { transitions } from "@/lib/motion";
import { isPlainNavigationClick } from "@/components/editor-node-link";
import { useSecondarySidebar, sidebarPanelForRoute } from "@/lib/secondary-sidebar-context";
import { projectIdFromPath, projectTabHref } from "@/lib/project-id-from-path";
import { usePrefetchProject } from "@/lib/use-prefetch-project";
import { usePrefetchPages } from "@/lib/use-pages-query";
import { SidebarPanelTransition } from "@/components/sidebar-panel-transition";
import { useRuntimeConfig } from "@/lib/runtime-config-provider";
import { NewMenu } from "@/components/new-menu";
import { SidebarOnboarding } from "@/components/sidebar-onboarding";
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
export type AppNavItem = Omit<NavItem, "icon"> & {
  /** Hugeicons icon data, or a React SVG component (Lucide, bespoke icons). */
  icon?: AppIcon;
  shortcut?: string;
  /**
   * This page descends in the sidebar's navigation levels (MIN-546): reaching
   * it swaps the primary sidebar to the page's teleported bar. The row bears
   * a chevron-right, after any badge, to say so before clicking.
   */
  descends?: boolean;
  /** Additional right-click actions for rows that represent editable objects. */
  contextActions?: ContextMenuAction[];
  /** A mobile browse target; selecting it changes levels without navigation. */
  browseKey?: string;
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

function SidebarQuickActions({ onCreate }: { onCreate?: () => void }) {
  return (
    <div className={cn("flex w-full min-w-0 shrink-0 gap-1")}>
      <NewMenu variant="sidebar" collapsed={false} onAction={onCreate} />
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
    "group relative flex h-9 items-center gap-3 rounded-lg text-sm font-medium transition-colors",
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
      {Icon ? (
        <AppIcon icon={Icon} className="h-[18px] w-[18px] shrink-0" />
      ) : null}
      <span className="min-w-0 truncate">{item.label}</span>
      {hint ? (
        <Kbd size="sm" className="ml-auto shrink-0">
          {hint}
        </Kbd>
      ) : (item.badge != null || item.descends) && (
        <span className="ml-auto flex items-center gap-2">
          {item.badge}
          {item.descends ? (
            <HugeiconsIcon icon={ArrowRight01Icon} className="size-3.5 shrink-0 text-sidebar-foreground/40" aria-hidden />
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
        data-sidebar-navigation-item
        aria-disabled={item.disabled || undefined}
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
        data-sidebar-navigation-item
        aria-current={active ? "page" : undefined}
        onClick={item.onClick}
        data-mobile-menu-branch={item.browseKey}
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

/** Mobile and desktop navigation use the same rows and section geometry. */
export function SidebarRows({ sections, renderItem }: { sections: AppNavSection[]; renderItem?: (item: AppNavItem) => ReactNode }) {
  return <>{sections.map((section, index) => <section key={section.key ?? index} className={cn(index > 0 && "mt-4")}>
    {section.label && <h2 className={cn("truncate pt-1 pr-3 pb-1 text-[11px] font-medium tracking-wide text-sidebar-foreground/45", ROW_PL)}>{section.label}</h2>}
    <ul className="flex flex-col gap-1">{section.items.map((item) => <li key={item.key}>{renderItem?.(item) ?? <SidebarRow item={item} />}</li>)}</ul>
  </section>)}</>;
}

function SidebarNav({
  sections,
  currentProject,
  projects,
  onMenuOpenChange,
  onBack,
  resetBack,
}: {
  sections: AppNavSection[];
  currentProject: Project | null;
  projects: Project[];
  onMenuOpenChange?: (open: boolean) => void;
  /** The project panel's home-back row: one level up, sidebar only. */
  onBack?: () => void;
  /** Any navigable row picked from this panel leaves the browse. */
  resetBack: () => void;
}) {
  return (
    <nav
      className={cn(
        "scrollbar-quiet flex-1 overflow-x-hidden overflow-y-auto pt-[calc((var(--app-content-header-height)-2.25rem)/2)] pb-2",
        GUTTER,
      )}
      // A plain click on a row that NAVIGATES ends the browse: the capture
      // runs before the row's own handler, so the panel resets to the route's
      // level and the incoming navigation finds its place. Modifier/middle
      // clicks want a tab or a window — the current page stays, the browse
      // stays with it. (The home-back row is a button, not a link: it steps
      // UP a level instead of ending the browse.)
      onClickCapture={(event) => {
        if (!isPlainNavigationClick(event)) return;
        const target = event.target;
        if (!(target instanceof Element)) return;
        if (!target.closest("a[href]")) return;
        resetBack();
      }}
    >
      <SidebarRows sections={sections} renderItem={(item) => item.key === "home-back" && currentProject
        ? <ProjectContextRow homeItem={item} currentProject={currentProject} projects={projects} onMenuOpenChange={onMenuOpenChange} onBack={onBack} />
        : undefined} />
    </nav>
  );
}

export function ProjectContextRow({
  homeItem,
  currentProject,
  projects,
  onMenuOpenChange,
  onBack,
  onProjectSelect,
}: {
  homeItem: AppNavItem;
  currentProject: Project;
  projects: Project[];
  onMenuOpenChange?: (open: boolean) => void;
  onBack?: () => void;
  onProjectSelect?: (project: Project) => void;
}) {
  const tk = useTranslations("Keyboard");
  const tNav = useTranslations("Nav");
  const pathname = usePathname();
  const prefetchProject = usePrefetchProject();
  const homeActions = useNavigationContextActions(homeItem.href);
  const [homeMenuPosition, setHomeMenuPosition] = useState<{ x: number; y: number } | null>(null);

  const [pickerOpen, setPickerOpen] = useState(false);
  const ProjectTrigger = onProjectSelect ? "button" : DropdownMenuTrigger;
  const projectTrigger = (
    <ProjectTrigger
      type="button"
      onClick={onProjectSelect ? () => setPickerOpen(true) : undefined}
      aria-haspopup={onProjectSelect ? "dialog" : undefined}
      aria-expanded={onProjectSelect ? pickerOpen : undefined}
      aria-label={currentProject.name}
      className={cn(
        "flex h-9 items-center rounded-lg text-sm font-medium text-sidebar-foreground/70 outline-none transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground focus-visible:bg-sidebar-accent focus-visible:text-sidebar-foreground",
        "min-w-0 flex-1 gap-2 px-2.5 text-left",
      )}
    >
      <ProjectOrb
        seed={projectOrbSeed(currentProject)}
        iconUrl={currentProject.icon_url}
        className="size-[18px] rounded-[5px]"
      />
      <span className="min-w-0 flex-1 truncate">{currentProject.name}</span>
      <HugeiconsIcon icon={ArrowDown01Icon} className="size-3.5 shrink-0 text-sidebar-foreground/45" aria-hidden />
    </ProjectTrigger>
  );

  const contextRow = (
      <div data-sidebar-project-context className="flex items-center gap-1">
        <Tooltip delayDuration={SIDEBAR_TOOLTIP_DELAY_MS} disableHoverableContent>
          <TooltipTrigger asChild>
            {/* The back gesture of the project panel: one level up IN THE
                SIDEBAR only — the page keeps its place until a row of the
                panel above is picked. A plain click never navigates; the
                context menu (open in a new tab, copy) still speaks the href. */}
            <motion.button
              type="button"
              aria-label={homeItem.label}
              onClick={onBack}
              onContextMenu={(event) => {
                event.preventDefault();
                setHomeMenuPosition({ x: event.clientX, y: event.clientY });
              }}
              className="relative flex h-9 w-12 shrink-0 items-center justify-center gap-0.5 rounded-lg outline-hidden text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground focus-visible:bg-sidebar-accent focus-visible:text-sidebar-foreground"
              whileTap={{ scale: 0.97 }}
              transition={transitions.snappy}
            >
              <HugeiconsIcon icon={ArrowLeft01Icon} className="size-3.5" aria-hidden />
              <HugeiconsIcon icon={Home01Icon} className="size-[18px]" aria-hidden />
            </motion.button>
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
  );
  if (onProjectSelect) return <>
    {contextRow}
    <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
      <DialogContent aria-describedby={undefined}>
        <DialogTitle>{tNav("switchProject")}</DialogTitle>
        <MobileSheetScrollArea>
          {projects.map((project) => <button key={project.id} type="button"
            onClick={() => { setPickerOpen(false); onProjectSelect(project); }}
            className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm hover:bg-muted">
            <ProjectOrb seed={projectOrbSeed(project)} iconUrl={project.icon_url} className="size-[18px] rounded-[5px]" />
            <span className="min-w-0 flex-1 truncate">{project.name}</span>
            {project.id === currentProject.id && <HugeiconsIcon icon={CheckIcon} className="size-4 shrink-0" />}
          </button>)}
        </MobileSheetScrollArea>
      </DialogContent>
    </Dialog>
  </>;

  return (
    <>
    <DropdownMenu onOpenChange={onMenuOpenChange}>
      {contextRow}

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
                {current ? <HugeiconsIcon icon={CheckIcon} className="ml-auto size-4 shrink-0" /> : null}
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
  mobile = false,
}: {
  onMenuOpenChange?: (open: boolean) => void;
  mobile?: boolean;
}) {
  const t = useTranslations("Nav");
  const tCommon = useTranslations("Common");
  const { user, signOut } = useAuth();
  const { capabilities } = useRuntimeConfig();
  const hasManagedService = capabilities.managedBilling?.configured || capabilities.managedAi?.configured;
  const { status } = useBillingSummary();
  const mobileIdentity = useMobileAccountIdentity();
  const tBilling = useTranslations("Billing");
  const planLabels: Record<BillingPlanId, "planFree" | "planGo" | "planPro"> = { free: "planFree", go: "planGo", pro: "planPro" };
  const planName = hasManagedService && status && (status.managedBilling || status.managedAi)
    ? tBilling(planLabels[status.planId]) : null;
  const isAdmin = useIsAdmin();
  const confirmationId = useId();
  const confirmationTitleId = `${confirmationId}-title`;
  const confirmationDescriptionId = `${confirmationId}-description`;
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmationPending, setConfirmationPending] = useState(false);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const confirmationPendingRef = useRef(false);
  const meta = user?.user_metadata as AuthNameMeta | undefined;
  const name = mobile ? mobileIdentity.name : authDisplayName(meta, user?.email ?? null, t("accountFallback"));
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

  if (mobile) {
    const destinations = [
      { href: "/settings?tab=profile", label: name, icon: null },
      ...(hasManagedService ? [{ href: "/billing", label: t("billing"), icon: CreditCardIcon }] : []),
      { href: "/settings", label: t("accountSettings"), icon: Settings01Icon },
      { href: "/trash", label: t("trash"), icon: Delete02Icon },
      { href: "/statistics", label: t("statistics"), icon: Analytics01Icon },
      ...(isAdmin ? [{ href: "/admin", label: t("adminDashboard"), icon: Shield01Icon }] : []),
    ];
    return <>
      <button type="button" data-mobile-sidebar-account aria-haspopup="dialog" aria-expanded={menuOpen}
        onClick={() => setMenuOpen(true)} className={cn("flex h-10 w-full items-center gap-3 rounded-lg pr-3 text-left outline-none transition-colors hover:bg-sidebar-accent focus-visible:bg-sidebar-accent", AVATAR_PL)}>
        <UserAvatar seed={seed} className="size-[22px] shrink-0" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{name}</span>
      </button>
      <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
        <DialogContent aria-describedby={undefined} onCloseAutoFocus={finishOpeningSignOutConfirmation}>
          <DialogTitle>{t("account")}</DialogTitle>
          <MobileSheetScrollArea>
            {destinations.map(({ href, label, icon }) => <Link key={href} href={href} onClick={() => setMenuOpen(false)} className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm hover:bg-muted">
              {icon ? <AppIcon icon={icon} className="size-[18px] shrink-0" /> : <UserAvatar seed={seed} className="size-[22px] shrink-0" />}<span className="min-w-0 truncate">{label}</span>
            </Link>)}
            <button type="button" onClick={openSignOutConfirmation} className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-sm text-destructive hover:bg-muted">
              <AppIcon icon={LogOutIcon} className="size-[18px]" />{t("signOut")}
            </button>
          </MobileSheetScrollArea>
        </DialogContent>
      </Dialog>
      <Dialog open={confirmationOpen} onOpenChange={setConfirmationOpen}>
        <DialogContent aria-describedby={confirmationDescriptionId}>
          <DialogTitle>{t("signOutConfirmTitle")}</DialogTitle>
          <p id={confirmationDescriptionId} className="text-sm text-muted-foreground">{t("signOutConfirmDescription")}</p>
          <DialogFooter><Button variant="outline" onClick={() => setConfirmationOpen(false)}>{tCommon("cancel")}</Button><Button variant="destructive" onClick={confirmSignOut}>{t("signOut")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>;
  }

  return (
    <Popover open={confirmationOpen} onOpenChange={setConfirmationOpen}>
      <PopoverAnchor asChild>
        <div>
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger
              className={cn(
                "flex h-10 items-center rounded-lg outline-none transition-colors hover:bg-sidebar-accent focus-visible:bg-sidebar-accent",
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
                  <UserAvatar seed={seed} className={planName ? "size-6" : "size-4"} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{name}</span>
                    {planName && <span className="block truncate text-xs text-muted-foreground">{planName}</span>}
                  </span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {hasManagedService && (
                <DropdownMenuItem asChild>
                  <Link href="/billing">
                    <HugeiconsIcon icon={CreditCardIcon} />
                    {t("billing")}
                  </Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem asChild>
                <Link href="/settings">
                  <HugeiconsIcon icon={Settings01Icon} />
                  {t("accountSettings")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/trash">
                  <HugeiconsIcon icon={Delete02Icon} />
                  {t("trash")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/statistics">
                  <HugeiconsIcon icon={Analytics01Icon} />
                  {t("statistics")}
                </Link>
              </DropdownMenuItem>
              {isAdmin && (
                <DropdownMenuItem asChild>
                  <Link href="/admin">
                    <HugeiconsIcon icon={Shield01Icon} />
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
                <HugeiconsIcon icon={LogOutIcon} />
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

function ChangelogButton({
  productFeedbackIntegrationEnabled,
  productFeedbackUrl,
  onMenuOpenChange,
  portalOwner,
  mobile = false,
}: {
  mobile?: boolean;
  productFeedbackIntegrationEnabled: boolean;
  productFeedbackUrl: string | null;
  onMenuOpenChange?: (open: boolean) => void;
  portalOwner: string;
}) {
  const t = useTranslations("Nav");
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
      <HugeiconsIcon icon={HelpCircleIcon} className="size-[18px]" />
    </button>
  );

  if (mobile) return <>
    <button type="button" aria-label={t("whatsNew")} aria-haspopup="dialog" aria-expanded={menuOpen} onClick={() => handleMenuOpenChange(true)} className={SIDEBAR_COMPACT_CONTROL_CLASS}><HugeiconsIcon icon={HelpCircleIcon} className="size-[18px]" /></button>
    <Dialog open={menuOpen} onOpenChange={handleMenuOpenChange}>
      <DialogContent aria-describedby={undefined}>
        <DialogTitle>{t("whatsNew")}</DialogTitle>
        <MobileSheetScrollArea className="space-y-2">
          <button type="button" className="flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm hover:bg-muted" onClick={() => { handleMenuOpenChange(false); setDialogMounted(true); setDialogOpen(true); }}>{t("viewFullChangelog")}</button>
          {(productFeedbackIntegrationEnabled || productFeedbackUrl) && <button type="button" className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm hover:bg-muted" onClick={() => {
            handleMenuOpenChange(false);
            if (productFeedbackIntegrationEnabled) { setFeedbackDialogMounted(true); setFeedbackDialogOpen(true); }
            else if (productFeedbackUrl) window.open(productFeedbackUrl, "_blank", "noopener,noreferrer");
          }}><AppIcon icon={Megaphone01Icon} className="size-[18px]" />{t("shareFeedback")}</button>}
          <p className="px-3 text-xs text-muted-foreground">{t("webVersion")}: {APP_VERSION}</p>
          {desktopVersion && <p className="px-3 text-xs text-muted-foreground">{t("appVersion")}: {desktopVersion}</p>}
        </MobileSheetScrollArea>
      </DialogContent>
    </Dialog>
    {dialogMounted && <WhatsNewDialog open={dialogOpen} onOpenChange={setDialogOpen} />}
    {feedbackDialogMounted && <ProductFeedbackDialog open={feedbackDialogOpen} onOpenChange={setFeedbackDialogOpen} />}
  </>;

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
          <DropdownMenuItem
            onSelect={() => {
              handleMenuOpenChange(false);
              setDialogMounted(true);
              setDialogOpen(true);
            }}
            className="h-8 gap-1.5 px-2.5 py-0 max-[1199px]:py-0"
          >
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
                className="py-1.5 max-[1199px]:py-1.5"
              >
                <HugeiconsIcon icon={Megaphone01Icon} className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">
                  {t("shareFeedback")}
                </span>
                {!productFeedbackIntegrationEnabled ? (
                  <HugeiconsIcon icon={ArrowUpRight01Icon} className="ml-auto size-4 shrink-0 text-muted-foreground" />
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
  mobile = false,
}: {
  onMenuOpenChange?: (open: boolean) => void;
  portalOwner: string;
  mobile?: boolean;
}) {
  const { productFeedbackIntegrationEnabled, productFeedbackUrl } = useRuntimeConfig();
  return (
    <div className="flex items-center gap-0.5">
      <div className="min-w-9 flex-1">
        <AccountButton mobile={mobile} onMenuOpenChange={onMenuOpenChange} />
      </div>
      <UsageIndicator
        variant="sidebar"
        onOpenChange={onMenuOpenChange}
      />
      <ChangelogButton
        mobile={mobile}
        portalOwner={portalOwner}
        productFeedbackIntegrationEnabled={productFeedbackIntegrationEnabled}
        productFeedbackUrl={productFeedbackUrl}
        onMenuOpenChange={onMenuOpenChange}
      />
    </div>
  );
}

/** The same sidebar surface and pinned footer surround both navigation layouts. */
export function SidebarFrame({ id, mobile = false, children, onLayerOpenChange, onNavigate, focusRef }: {
  id: string; mobile?: boolean; children: ReactNode;
  onLayerOpenChange?: (open: boolean) => void; onNavigate?: () => void; focusRef?: Ref<HTMLElement>;
}) {
  return <aside ref={focusRef} tabIndex={mobile ? -1 : undefined} id={id} data-sidebar-navigation data-mobile-sidebar={mobile || undefined}
    style={{ width: mobile ? "100%" : EXPANDED_WIDTH }}
    className="flex h-full min-h-0 flex-col overflow-hidden bg-sidebar text-sidebar-foreground outline-none"
    onClickCapture={mobile ? (event) => { if (isPlainNavigationClick(event) && event.target instanceof Element && event.target.closest("a[href]")) onNavigate?.(); } : undefined}>
    {children}
    <SidebarOnboarding mobile={mobile} onLayerOpenChange={onLayerOpenChange} />
    <div data-sidebar-footer className={cn("shrink-0 pt-2 pb-2.5", GUTTER)}><SidebarFooter portalOwner={id} mobile={mobile} onMenuOpenChange={onLayerOpenChange} /></div>
  </aside>;
}

/** The desktop command/filter band is shared without mobile-specific chrome. */
export function SidebarTopBand({ secondary = false, headerRef, onCreate }: {
  secondary?: boolean; headerRef?: Ref<HTMLDivElement>; onCreate?: () => void;
}) {
  return (
      <div
        className={cn(
          "sidebar-brand-row relative flex h-[var(--app-content-header-height)] shrink-0 items-center",
          // Level 2/3: the teleported filter strip carries its own gutter, so
          // the band's px-2.5 must not wrap it a second time.
          !secondary && GUTTER,
          // The other levels close the band with the same hairline the
          // level-2/3 filter strip draws (border-b on its header): the
          // command row is separated from the option rows below on every
          // level.
          !secondary && "border-b border-border",
        )}
      >
        <div className={cn("flex h-full w-full min-w-0 items-center", secondary && "hidden")}>
          <SidebarQuickActions onCreate={onCreate} />
        </div>
        <div
          ref={headerRef}
          className={cn(
            "relative h-[var(--app-content-header-height)] w-full min-w-0",
            !secondary && "hidden",
          )}
        />
      </div>
  );
}

/** The secondary-level browse row uses the same geometry in both layouts. */
export function SidebarBackRow({ label, onBack, ariaLabel }: {
  label: string; onBack: () => void; ariaLabel?: string;
}) {
  return <div className="shrink-0 pt-[calc((var(--app-content-header-height)-2.25rem)/2)] pb-2">
    <div className={GUTTER}>
      <button type="button" data-sidebar-back onClick={onBack} aria-label={ariaLabel}
        className={cn("relative flex h-9 w-full min-w-0 items-center rounded-lg text-sm font-medium transition-colors", ROW_PL, "pr-3 text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground focus-visible:bg-sidebar-accent focus-visible:text-sidebar-foreground")}>
        <HugeiconsIcon icon={ArrowLeft01Icon} className="absolute left-[9px] top-1/2 size-[18px] shrink-0 -translate-y-1/2" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-center">{label}</span>
      </button>
    </div>
  </div>;
}

/* ─── Levels (MIN-546) ─────────────────────────────────────────────── */

/**
 * What the back row of a level 2/3 sidebar is NAMED after, and which route
 * would carry the panel one level up — the href a context menu (open in a
 * new tab, copy) still speaks. The row itself only lifts the sidebar's
 * panel; it never navigates.
 *
 * Global pages name the home level; a project page names the project's
 * Tickets page. Pure static route mapping: the level switches from the
 * server's HTML, no mounted-count involved.
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
 * `project-<id>`) keys the project panel; the panel itself is chosen by the
 * route: `routeHasSecondaryNav` routes swap the nav for the page's teleported
 * secondary bar, under the back row. The aside NEVER resizes: a level change
 * is a content swap inside the same column, and nothing outside moves.
 *
 * The back rows BROWSE the levels without leaving the page (the `backLevel`
 * of the secondary sidebar context): pressing back lifts the panel one level
 * — a project page falls back to the project panel, then to the home panel —
 * while the main content keeps its place, and any picked row navigates for
 * real, rebasing the levels to the route. `homeSections` carries the home
 * panel for those lifts reached FROM a project page (the shell passes both
 * variants; the route only ever asks for one of them).
 *
 * The teleport points (`headerSlot`, `slot`) are installed by the level-2/3
 * panel and stay mounted across route changes within it — the pages' bars
 * portal INTO the sidebar. Under 768 px none of this renders (mobile shell).
 */
export function AppSidebar({
  sections,
  homeSections,
  modeKey,
  currentProject,
  projects,
  onLayerOpenChange,
}: {
  sections: AppNavSection[];
  /** The home panel, for the back-row lifts reached from a project page. */
  homeSections: AppNavSection[];
  modeKey: string;
  currentProject: Project | null;
  projects: Project[];
  onLayerOpenChange?: (open: boolean) => void;
}) {
  const reduce = useReducedMotion();
  const t = useTranslations("Nav");
  const pathname = usePathname();
  const { setHeaderSlot, setSlot, backLevel, goBack, resetBack } =
    useSecondarySidebar();

  // The active route names the base level; the back rows stack browse levels
  // on top of it without touching the URL.
  const back = secondaryNavBackTarget(pathname, t);
  const panel = sidebarPanelForRoute(
    back !== null,
    currentProject !== null,
    backLevel,
  );
  const showSecondary = panel === "secondary";

  // Menus open out of the bar (Radix portal); while one is up, the hidden
  // navigation overlay must stay pinned (see SidebarNavOverlay).
  const handleMenuOpenChange = useCallback(
    (open: boolean) => {
      onLayerOpenChange?.(open);
    },
    [onLayerOpenChange],
  );

  const shellTransition = reduce ? { duration: 0 } : transitions.panel;

  const level1 = (
    <SidebarNav
      sections={sections}
      currentProject={currentProject}
      projects={projects}
      onMenuOpenChange={handleMenuOpenChange}
      onBack={goBack}
      resetBack={resetBack}
    />
  );

  // The home panel, for the back lifts reached from a project page: no
  // project context row (its rows are plain navigation), and no active row —
  // the page under it is not the panel's place until one is picked.
  const homeLevel = (
    <SidebarNav
      sections={homeSections}
      currentProject={null}
      projects={projects}
      onMenuOpenChange={handleMenuOpenChange}
      onBack={goBack}
      resetBack={resetBack}
    />
  );

  /**
   * Level 2/3 panel: the back row — one level up, named after the current
   * page — and, under it, the empty frame the page's bar teleports into.
   * The panel stays mounted across sibling routes (pull requests →
   * routines); only the back row swaps.
   */
  const level2 = (
    <>
      <div className="relative h-[calc((var(--app-content-header-height)-2.25rem)/2+2.25rem+0.5rem)] shrink-0">
      <AnimatePresence mode="sync" initial={false}>
        {back && (
          <SidebarPanelTransition
            key={`back:${back.href}:${back.label}`}
            className="absolute inset-x-0 top-0"
            offset={16}
            transition={shellTransition}
          >
            <SidebarBackRow label={back.label} onBack={goBack} />
          </SidebarPanelTransition>
        )}
      </AnimatePresence>
      </div>
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
    <SidebarFrame id={railId} onLayerOpenChange={handleMenuOpenChange}>
      {/* The top band COMMANDS the column: level 2/3 keeps the page's filter
          strip teleported here, the other levels the creation controls.
          Pinned strip — what drives the list should be here. */}
      <SidebarTopBand secondary={showSecondary} headerRef={setHeaderSlot} />

      {/* All levels live in the same flex-1 area, stacked absolutely so a
          swap animates over a stable layout instead of resizing anything. */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        {/* Keep the portal destination mounted: changing navigation levels
            must not reparent or remount a page's list during the animation. */}
        <motion.div
          data-sidebar-panel="secondary"
          className="absolute inset-0 flex min-h-0 flex-col pr-0"
          inert={!showSecondary}
          aria-hidden={!showSecondary}
          initial={false}
          animate={{ opacity: showSecondary ? 1 : 0, x: showSecondary ? 0 : 16 }}
          transition={shellTransition}
          style={{ pointerEvents: showSecondary ? "auto" : "none" }}
        >
          {level2}
        </motion.div>
        <AnimatePresence mode="sync" initial={false}>
          {showSecondary ? null : panel === "home" ? (
            <SidebarPanelTransition
              key="home"
              className="absolute inset-0 flex min-h-0 flex-col"
              offset={-16}
              transition={reduce ? { duration: 0 } : transitions.panel}
            >
              {homeLevel}
            </SidebarPanelTransition>
          ) : (
            <SidebarPanelTransition
              key={modeKey}
              className="absolute inset-0 flex min-h-0 flex-col"
              offset={16}
              transition={reduce ? { duration: 0 } : transitions.panel}
            >
              {level1}
            </SidebarPanelTransition>
          )}
        </AnimatePresence>
        {/* Fades: scrolling options dissolve into the panel instead of being
            clipped hard against the band and the footer. The top fade lives
            on level 2/3 ONLY: it milestones the back row, which the other
            levels do not have (their first row is a plain option, e.g. pull
            requests, and a fade there just dims it). Starts BELOW the first
            row — geometry: row top padding + h-9 (2.25rem) + pb-2. Kept short
            (h-5): the panel's own scroll gap is wide, and a taller fade
            would sit on the first option row. */}
        {showSecondary ? (
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

    </SidebarFrame>
  );
}

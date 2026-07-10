"use client";

import { type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  useTheme,
  cn,
  Kbd,
  KbdSequence,
  type NavItem,
  type NavSection,
} from "mangue-ui";
import {
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
  Moon,
  Monitor,
  Check,
  LogOut,
  MoreHorizontal,
  Megaphone,
  BarChart3,
  Settings,
} from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { useAuth } from "@/lib/auth-context";
import { MinddyLogo } from "@/components/minddy-logo";
import { getAppEnv, ENV_LOGO_TINT } from "@/lib/env";
import { openFeedbackBoard } from "@/lib/open-feedback-board";
import {
  useChordPrefix,
  useSidebarCollapse,
  CHORD_PREFIX,
} from "@/lib/keyboard/keyboard-context";
import { resolveKeyToken } from "@/lib/keyboard/shortcuts";
import { transitions } from "@/lib/motion";

const EXPANDED_WIDTH = 256;
const COLLAPSED_WIDTH = 56;

/** A sidebar nav item that can advertise its `G`-chord second key (e.g. "M"). */
export type AppNavItem = NavItem & { shortcut?: string };
export type AppNavSection = Omit<NavSection, "items"> & { items: AppNavItem[] };

const MotionLink = motion.create(Link);

/* ─── Brand ────────────────────────────────────────────────────────── */

function SidebarBrand() {
  return (
    <Link
      href="/home"
      aria-label="minddy"
      className="inline-flex items-center px-1 text-sidebar-foreground"
    >
      <MinddyLogo className={cn("h-6 w-auto", ENV_LOGO_TINT[getAppEnv()])} />
    </Link>
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
    "group relative flex h-9 items-center gap-3 rounded-lg px-3.5 text-sm font-medium transition-colors",
    // Collapsed: a fixed-width, left-anchored icon box so the icon keeps a
    // constant position while the sidebar width animates (no drift to center).
    collapsed && "w-9 justify-center gap-0 px-0",
    active
      ? "bg-sidebar-accent text-sidebar-accent-foreground"
      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
    item.disabled && "pointer-events-none opacity-50",
  );

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
    </>
  );

  let row: ReactNode;
  if (item.href) {
    row = (
      <MotionLink
        href={item.href}
        className={rowClass}
        aria-current={active ? "page" : undefined}
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
        className={cn(rowClass, "text-left", !collapsed && "w-full")}
        whileTap={{ scale: 0.97 }}
        transition={transitions.snappy}
      >
        {inner}
      </motion.button>
    );
  }

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{row}</TooltipTrigger>
        <TooltipContent side="right" className="flex items-center gap-2">
          <span>{item.tooltip ?? item.label}</span>
          {item.shortcut && (
            <KbdSequence
              keys={[[CHORD_PREFIX.toUpperCase()], [item.shortcut]]}
              size="sm"
              separator={tk("then")}
            />
          )}
        </TooltipContent>
      </Tooltip>
    );
  }
  return row;
}

function SidebarNav({
  sections,
  collapsed,
}: {
  sections: AppNavSection[];
  collapsed: boolean;
}) {
  return (
    <nav
      className={cn(
        "flex-1 overflow-x-hidden overflow-y-auto pt-3 pb-2",
        collapsed ? "px-2.5" : "px-3.5",
      )}
    >
      {sections.map((section, index) => (
        <div key={section.key ?? index} className={cn(index > 0 && "mt-4")}>
          {section.label && !collapsed ? (
            <div className="px-2.5 pt-1 pb-1 text-[11px] font-medium tracking-wide text-sidebar-foreground/45">
              {section.label}
            </div>
          ) : null}
          <ul className="flex flex-col gap-1">
            {section.items.map((item) => (
              <li key={item.key}>
                <SidebarRow item={item} collapsed={collapsed} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/* ─── Footer ───────────────────────────────────────────────────────── */

/** The user's first name: first token of the Supabase auth display name
    (display_name / full_name / name), else the email local-part. */
function firstNameOf(user: User | null, fallback: string): string {
  const meta = user?.user_metadata as
    | { display_name?: string; full_name?: string; name?: string }
    | undefined;
  const full = meta?.display_name || meta?.full_name || meta?.name;
  if (full) return full.trim().split(/\s+/)[0];
  const local = user?.email?.split("@")[0];
  return local || fallback;
}

/** 1–2 letter initials for the avatar fallback (mirrors AutoKap). */
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Deterministic HSL so the same user always gets the same fallback color. */
function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 55% 45%)`;
}

function UserAvatar({
  avatarUrl,
  name,
  seed,
}: {
  avatarUrl: string | null;
  name: string;
  seed: string;
}) {
  if (avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={avatarUrl}
        alt=""
        className="size-[22px] shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <span
      aria-hidden
      className="flex size-[22px] shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
      style={{ backgroundColor: avatarColor(seed) }}
    >
      {getInitials(name)}
    </span>
  );
}

function ThemeItem({
  value,
  icon: Icon,
  label,
}: {
  value: "light" | "dark" | "system";
  icon: typeof Sun;
  label: string;
}) {
  const { theme, setTheme } = useTheme();
  return (
    <DropdownMenuItem onSelect={() => setTheme(value)}>
      <Icon />
      {label}
      {theme === value && <Check className="ml-auto size-4" />}
    </DropdownMenuItem>
  );
}

function AccountButton({ collapsed }: { collapsed: boolean }) {
  const t = useTranslations("Nav");
  const { user, signOut } = useAuth();
  const firstName = firstNameOf(user, t("accountFallback"));
  const meta = user?.user_metadata as
    | { avatar_url?: string; picture?: string }
    | undefined;
  const avatarUrl = meta?.avatar_url || meta?.picture || null;
  const seed = user?.email || firstName;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex h-10 items-center rounded-lg outline-none transition-colors hover:bg-sidebar-accent focus-visible:bg-sidebar-accent",
          collapsed ? "w-9 justify-center" : "w-full gap-3 px-3.5 text-left",
        )}
      >
        <UserAvatar avatarUrl={avatarUrl} name={firstName} seed={seed} />
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1 truncate text-sm font-medium">
              {firstName}
            </span>
            <MoreHorizontal className="size-4 shrink-0 text-muted-foreground" />
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-56">
        {user?.email && (
          <>
            <div className="truncate px-2 py-1.5 text-xs text-muted-foreground">
              {user.email}
            </div>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings />
            {t("accountSettings")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <ThemeItem value="light" icon={Sun} label={t("themeLight")} />
        <ThemeItem value="dark" icon={Moon} label={t("themeDark")} />
        <ThemeItem value="system" icon={Monitor} label={t("themeSystem")} />
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => void signOut()}>
          <LogOut />
          {t("signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function FooterRow({
  icon: Icon,
  label,
  onClick,
  collapsed,
  active = false,
}: {
  icon: typeof Megaphone;
  label: string;
  onClick: () => void;
  collapsed: boolean;
  active?: boolean;
}) {
  const btn = (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-9 items-center rounded-lg text-sm font-medium transition-colors hover:bg-sidebar-accent hover:text-foreground",
        active ? "bg-sidebar-accent text-foreground" : "text-muted-foreground",
        collapsed ? "w-9 justify-center" : "w-full gap-3 px-3.5 text-left",
      )}
    >
      <Icon className="size-[18px] shrink-0" />
      {!collapsed && label}
    </button>
  );
  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{btn}</TooltipTrigger>
        <TooltipContent side="right">{label}</TooltipContent>
      </Tooltip>
    );
  }
  return btn;
}

function SidebarFooter({ collapsed }: { collapsed: boolean }) {
  const t = useTranslations("Nav");
  const router = useRouter();
  const pathname = usePathname();
  return (
    <div className="flex flex-col gap-0.5">
      <FooterRow
        icon={BarChart3}
        label={t("statistics")}
        collapsed={collapsed}
        active={pathname.startsWith("/statistics")}
        onClick={() => router.push("/statistics")}
      />
      <FooterRow
        icon={Megaphone}
        label={t("shareFeedback")}
        collapsed={collapsed}
        onClick={openFeedbackBoard}
      />
      <AccountButton collapsed={collapsed} />
    </div>
  );
}

/* ─── Shell ────────────────────────────────────────────────────────── */

/**
 * The desktop sidebar. Hand-rolled (rather than mangue-ui's <Sidebar>) so the
 * nav region can animate the home ↔ project swap like AutoKap: the logo and
 * footer stay put while only the nav fades/slides — project enters from the
 * right, home from the left. `modeKey` ("home" | `project-<id>`) drives the
 * swap; navigating between a project's sub-pages keeps the same key (no replay).
 */
export function AppSidebar({
  sections,
  modeKey,
}: {
  sections: AppNavSection[];
  modeKey: string;
}) {
  const t = useTranslations("Nav");
  const { collapsed, setCollapsed } = useSidebarCollapse();
  const reduce = useReducedMotion();
  const dx = modeKey === "home" ? -16 : 16;

  return (
    <motion.aside
      data-collapsed={collapsed}
      initial={false}
      animate={{ width: collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH }}
      transition={
        reduce ? { duration: 0 } : { type: "spring", stiffness: 400, damping: 34 }
      }
      className="flex h-full flex-col overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground"
    >
      {/* Brand + collapse toggle */}
      <div
        className={cn(
          "flex h-[60px] items-center",
          collapsed ? "justify-center px-0" : "justify-between px-3.5",
        )}
      >
        {collapsed ? (
          // Collapsed: the logo sits where the reopen button would be and
          // cross-fades to it on hover (mirrors AutoKap).
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            aria-label={t("expandSidebar")}
            title={t("expandSidebar")}
            className="group relative flex size-8 items-center justify-center"
          >
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sidebar-foreground transition-opacity duration-150 group-hover:opacity-0">
              <MinddyLogo className={cn("h-6 w-auto", ENV_LOGO_TINT[getAppEnv()])} />
            </span>
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sidebar-foreground/60 opacity-0 transition-opacity duration-150 group-hover:text-sidebar-foreground group-hover:opacity-100">
              <PanelLeftOpen className="h-[18px] w-[18px]" />
            </span>
          </button>
        ) : (
          <>
            <SidebarBrand />
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setCollapsed(true)}
                  aria-label={t("collapseSidebar")}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
                >
                  <PanelLeftClose className="h-[18px] w-[18px]" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="flex items-center gap-2">
                <span>{t("collapseSidebar")}</span>
                <KbdSequence keys={[["mod", "B"].map(resolveKeyToken)]} size="sm" />
              </TooltipContent>
            </Tooltip>
          </>
        )}
      </div>

      {/* Nav — animated swap between home and project modes */}
      {reduce ? (
        <SidebarNav sections={sections} collapsed={collapsed} />
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
            <SidebarNav sections={sections} collapsed={collapsed} />
          </motion.div>
        </AnimatePresence>
      )}

      {/* Footer */}
      <div className={cn("pt-2 pb-4", collapsed ? "px-2.5" : "px-3.5")}>
        <SidebarFooter collapsed={collapsed} />
      </div>
    </motion.aside>
  );
}

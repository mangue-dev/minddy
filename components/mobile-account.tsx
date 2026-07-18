"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTheme } from "mangue-ui";
import {
  BarChart3,
  CreditCard,
  Megaphone,
  Settings,
  Shield,
  Sun,
  Moon,
  Monitor,
  LogOut,
  Check,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useIsAdmin } from "@/lib/use-is-admin";
import { displayName } from "@/lib/display-name";
import { openFeedbackBoard } from "@/lib/open-feedback-board";
import type { AppNavSection } from "@/components/app-sidebar";
import type { PaletteGroup, PaletteItem } from "@/components/header-search-pill";

type AuthMeta = {
  display_name?: string;
  full_name?: string;
  name?: string;
  avatar_url?: string;
  picture?: string;
};

/** Display name from Supabase auth metadata (display_name → full_name → name),
    never the raw email — mirrors the desktop sidebar. */
function accountName(meta: AuthMeta | undefined, email: string | null, fallback: string) {
  return displayName(
    { full_name: meta?.display_name || meta?.full_name || meta?.name || null, email },
    fallback
  );
}

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const THEME_CHOICES: { value: "light" | "dark" | "system"; icon: LucideIcon; key: string }[] = [
  { value: "light", icon: Sun, key: "themeLight" },
  { value: "dark", icon: Moon, key: "themeDark" },
  { value: "system", icon: Monitor, key: "themeSystem" },
];

/**
 * The account/global options that live in the desktop sidebar footer (statistics,
 * feedback, account settings, theme, sign out), surfaced on mobile in both the
 * hamburger menu sheet (as nav sections — the sidebar replacement) and the
 * command palette (as an "Account" group), from one source so they stay in sync.
 */
export function useAccountActions(): {
  menuSections: AppNavSection[];
  commandGroup: PaletteGroup;
} {
  const t = useTranslations("Nav");
  const router = useRouter();
  const { signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const isAdmin = useIsAdmin();

  const menuSections: AppNavSection[] = [
    {
      key: "account",
      label: t("account"),
      items: [
        { key: "m-stats", label: t("statistics"), icon: BarChart3, href: "/statistics" },
        { key: "m-billing", label: t("billing"), icon: CreditCard, href: "/billing" },
        { key: "m-settings", label: t("accountSettings"), icon: Settings, href: "/settings" },
        ...(isAdmin
          ? [{ key: "m-admin", label: t("adminDashboard"), icon: Shield, href: "/admin" }]
          : []),
        { key: "m-feedback", label: t("shareFeedback"), icon: Megaphone, onClick: openFeedbackBoard },
      ],
    },
    {
      key: "appearance",
      label: t("appearance"),
      items: THEME_CHOICES.map((c) => ({
        key: `m-${c.value}`,
        label: t(c.key as Parameters<typeof t>[0]),
        icon: c.icon,
        active: theme === c.value,
        onClick: () => setTheme(c.value),
      })),
    },
    {
      key: "session",
      items: [
        { key: "m-signout", label: t("signOut"), icon: LogOut, onClick: () => void signOut() },
      ],
    },
  ];

  const commandItems: PaletteItem[] = [
    {
      key: "cmd-stats",
      label: t("statistics"),
      icon: BarChart3,
      keywords: ["statistics", "stats", "statistiques"],
      onSelect: () => router.push("/statistics"),
    },
    {
      key: "cmd-billing",
      label: t("billing"),
      icon: CreditCard,
      keywords: ["billing", "facturation", "plan", "abonnement", "subscription", "usage"],
      onSelect: () => router.push("/billing"),
    },
    ...(isAdmin
      ? [
          {
            key: "cmd-admin",
            label: t("adminDashboard"),
            icon: Shield,
            keywords: ["admin", "administration", "models", "modèles", "modeles", "ia", "ai"],
            onSelect: () => router.push("/admin"),
          },
        ]
      : []),
    {
      key: "cmd-feedback",
      label: t("shareFeedback"),
      icon: Megaphone,
      keywords: ["feedback", "support", "retour", "avis"],
      onSelect: openFeedbackBoard,
    },
    ...THEME_CHOICES.map((c) => ({
      key: `cmd-${c.value}`,
      label: t(c.key as Parameters<typeof t>[0]),
      icon: c.icon,
      keywords: ["theme", "thème", "appearance", "apparence", t(c.key as Parameters<typeof t>[0])],
      meta:
        theme === c.value ? <Check className="size-3.5 text-muted-foreground" /> : undefined,
      onSelect: () => setTheme(c.value),
    })),
    {
      key: "cmd-signout",
      label: t("signOut"),
      icon: LogOut,
      keywords: ["logout", "sign out", "déconnexion", "deconnexion", "quitter"],
      onSelect: () => void signOut(),
    },
  ];

  return {
    menuSections,
    commandGroup: { key: "account", heading: t("account"), items: commandItems },
  };
}

/** User identity block for the bottom of the mobile menu sheet (menuFooter). */
export function MobileMenuFooter() {
  const t = useTranslations("Nav");
  const { user } = useAuth();
  const meta = user?.user_metadata as AuthMeta | undefined;
  const name = accountName(meta, user?.email ?? null, t("accountFallback"));
  const avatarUrl = meta?.avatar_url || meta?.picture || null;

  return (
    <div className="flex items-center gap-3 px-1">
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt=""
          className="size-8 shrink-0 rounded-full object-cover"
        />
      ) : (
        <span
          aria-hidden
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground"
        >
          {initialsOf(name)}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{name}</div>
        {user?.email ? (
          <div className="truncate text-xs text-muted-foreground">{user.email}</div>
        ) : null}
      </div>
    </div>
  );
}

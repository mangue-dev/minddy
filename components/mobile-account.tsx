"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { APP_VERSION } from "@/lib/app-version";
import { toast, useTheme } from "mangue-ui";
import {
  BarChart3,
  ClipboardCopy,
  CreditCard,
  Settings,
  Shield,
  Sun,
  Moon,
  Monitor,
  LogOut,
  Check,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useIsAdmin } from "@/lib/use-is-admin";
import { authDisplayName, type AuthNameMeta } from "@/lib/display-name";
import { useMyAvatarSeed } from "@/lib/use-my-avatar";
import { UserAvatar } from "@/components/user-avatar";
import type { AppNavSection } from "@/components/app-sidebar";
import type { PaletteGroup, PaletteItem } from "@/components/header-search-pill";

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

  // Mémoïsé : le groupe « compte » est concaténé aux groupes de la palette, et
  // une nouvelle identité à chaque rendu ferait reconstruire toutes les lignes
  // de la palette (des milliers depuis MIN-91) à chaque rendu du shell.
  return useMemo(() => {
    const menuSections: AppNavSection[] = [
      {
        key: "account",
        label: t("account"),
        items: [
          { key: "m-trash", label: t("trash"), icon: Trash2, href: "/trash" },
          { key: "m-stats", label: t("statistics"), icon: BarChart3, href: "/statistics" },
          { key: "m-billing", label: t("billing"), icon: CreditCard, href: "/billing" },
          { key: "m-settings", label: t("accountSettings"), icon: Settings, href: "/settings" },
          ...(isAdmin
            ? [{ key: "m-admin", label: t("adminDashboard"), icon: Shield, href: "/admin" }]
            : []),
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
        key: "cmd-trash",
        label: t("trash"),
        icon: Trash2,
        keywords: ["trash", "corbeille", "deleted", "supprimé", "supprime", "restore", "restaurer"],
        onSelect: () => router.push("/trash"),
      },
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
      // Copie dans le presse-papiers le prompt de synchronisation git (localisé
      // FR/EN) prêt à coller dans un agent de code — pas de navigation, juste un
      // writeText + toast, comme l'action « Copier le prompt » d'un ticket.
      {
        key: "cmd-git-sync-prompt",
        label: t("syncPrompt"),
        icon: ClipboardCopy,
        keywords: [
          "git",
          "sync",
          "synchroniser",
          "synchronize",
          "prompt",
          "copier",
          "copy",
          "rebase",
          "push",
          "pull",
          "dépôt",
          "depot",
          "repo",
        ],
        onSelect: () => {
          void navigator.clipboard
            .writeText(t("syncPromptText"))
            .then(() => toast.success(t("syncPromptCopied")));
        },
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
  }, [t, router, signOut, theme, setTheme, isAdmin]);
}

/** User identity block for the bottom of the mobile menu sheet (menuFooter). */
export function MobileMenuFooter() {
  const t = useTranslations("Nav");
  const { user } = useAuth();
  const meta = user?.user_metadata as AuthNameMeta | undefined;
  const name = authDisplayName(meta, user?.email ?? null, t("accountFallback"));
  const seed = useMyAvatarSeed();

  return (
    <div className="flex flex-col gap-2 px-1">
      <div className="flex items-center gap-3">
        <UserAvatar seed={seed} className="size-8" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{name}</div>
          {user?.email ? (
            <div className="truncate text-xs text-muted-foreground">{user.email}</div>
          ) : null}
        </div>
      </div>
      <div className="text-center text-xs text-muted-foreground">{APP_VERSION}</div>
    </div>
  );
}

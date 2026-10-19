"use client";

import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { ComputerIcon, CreditCardIcon, Delete02Icon, LogOutIcon, MoonIcon, Settings01Icon, Shield01Icon, Sun01Icon, CheckIcon } from "@hugeicons/core-free-icons";
import { useMemo, type SVGProps } from "react";
import { useTranslations } from "next-intl";
import { useAppRouter } from "@/lib/use-app-router";
import type { IconComponent } from "@/components/icon";
import { useAuth } from "@/lib/auth-context";
import { useIsAdmin } from "@/lib/use-is-admin";
import { useAccountTheme } from "@/lib/use-account-theme";
import { authDisplayName, type AuthNameMeta } from "@/lib/display-name";
import type { AppNavSection } from "@/components/app-sidebar";
import type { PaletteGroup, PaletteItem } from "@/components/header-search-pill";

function dataIcon(icon: IconSvgElement): IconComponent {
  const Component = ({ className, style, ref }: SVGProps<SVGSVGElement>) => (
    <HugeiconsIcon icon={icon} ref={ref} className={className} style={style} />
  );
  return Component;
}

const THEME_CHOICES: { value: "light" | "dark" | "system"; icon: IconComponent; key: string }[] = [
  { value: "light", icon: dataIcon(Sun01Icon), key: "themeLight" },
  { value: "dark", icon: dataIcon(MoonIcon), key: "themeDark" },
  { value: "system", icon: dataIcon(ComputerIcon), key: "themeSystem" },
];

/**
 * Account/global actions for the command palette and navigation consumers.
 * The shared sidebar footer owns account controls in both viewport layouts.
 */
export function useAccountActions(): {
  menuSections: AppNavSection[];
  commandGroup: PaletteGroup;
} {
  const t = useTranslations("Nav");
  const router = useAppRouter();
  const { signOut } = useAuth();
  // The account theme: the choice is persisted to user_metadata so it
  // follows the account to every device (lib/use-account-theme.ts).
  const { theme, setTheme } = useAccountTheme();
  const isAdmin = useIsAdmin();

  // Memorized: the “count” group is concatenated to the palette groups, and
  // a new identity on each rendering would rebuild all the lines
  // of the palette (thousands since MIN-91) each time the shell renders.
  return useMemo(() => {
    const menuSections: AppNavSection[] = [
      {
        key: "account",
        label: t("account"),
        items: [
          { key: "m-trash", label: t("trash"), icon: dataIcon(Delete02Icon), href: "/trash" },
          { key: "m-billing", label: t("billing"), icon: dataIcon(CreditCardIcon), href: "/billing" },
          { key: "m-settings", label: t("accountSettings"), icon: dataIcon(Settings01Icon), href: "/settings" },
          ...(isAdmin
            ? [{ key: "m-admin", label: t("adminDashboard"), icon: dataIcon(Shield01Icon), href: "/admin" }]
            : []),
        ],
      },
      {
        key: "session",
        items: [
          { key: "m-signout", label: t("signOut"), icon: dataIcon(LogOutIcon), onClick: () => void signOut() },
        ],
      },
    ];

    const commandItems: PaletteItem[] = [
      {
        key: "cmd-trash",
        label: t("trash"),
        icon: dataIcon(Delete02Icon),
        href: "/trash",
        keywords: ["trash", "corbeille", "deleted", "supprimé", "supprime", "restore", "restaurer"],
        onSelect: () => router.push("/trash"),
      },
      {
        key: "cmd-billing",
        label: t("billing"),
        icon: dataIcon(CreditCardIcon),
        href: "/billing",
        keywords: ["billing", "facturation", "plan", "abonnement", "subscription", "usage"],
        onSelect: () => router.push("/billing"),
      },
      ...(isAdmin
        ? [
            {
              key: "cmd-admin",
              label: t("adminDashboard"),
              icon: dataIcon(Shield01Icon),
              href: "/admin",
              keywords: ["admin", "administration", "models", "modèles", "modeles", "ia", "ai"],
              onSelect: () => router.push("/admin"),
            },
          ]
        : []),
      ...THEME_CHOICES.map((c) => ({
        key: `cmd-${c.value}`,
        label: t(c.key as Parameters<typeof t>[0]),
        icon: c.icon,
        keywords: ["theme", "thème", "appearance", "apparence", t(c.key as Parameters<typeof t>[0])],
        meta:
          theme === c.value ? <HugeiconsIcon icon={CheckIcon} className="size-3.5 text-muted-foreground" /> : undefined,
        onSelect: () => setTheme(c.value),
      })),
      {
        key: "cmd-signout",
        label: t("signOut"),
        icon: dataIcon(LogOutIcon),
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

/** Shared mobile identity never falls back to an email. */
export function useMobileAccountIdentity() {
  const t = useTranslations("Nav");
  const { user } = useAuth();
  const meta = user?.user_metadata as AuthNameMeta | undefined;
  return { name: authDisplayName(meta, null, t("accountFallback")) };
}

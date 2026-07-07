"use client";

import { useTranslations } from "next-intl";
import { SlidersHorizontal, User } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import {
  SettingsShell,
  type SettingsTab,
} from "@/components/settings-shell";
import { AccountProfileSection } from "@/components/settings/account-profile-section";
import { AccountPreferencesSection } from "@/components/settings/account-preferences-section";

export default function AccountSettingsPage() {
  const t = useTranslations("Account");
  const { user } = useAuth();

  // The sections read the account; hold off until it resolves.
  if (!user) return null;

  const tabs: SettingsTab[] = [
    {
      value: "profile",
      label: t("profileTab"),
      icon: User,
      content: <AccountProfileSection />,
    },
    {
      value: "preferences",
      label: t("preferencesTab"),
      icon: SlidersHorizontal,
      content: <AccountPreferencesSection />,
    },
  ];

  return (
    <SettingsShell
      title={t("title")}
      description={t("subtitle")}
      defaultTab="profile"
      tabs={tabs}
      maxWidth={880}
    />
  );
}

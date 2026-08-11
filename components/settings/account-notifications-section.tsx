"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Switch, toast } from "mangue-ui";
import { Inbox } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { SettingsGroup, SettingsRow } from "@/components/settings/settings-ui";
import { SETTINGS_SECTIONS } from "@/lib/settings-sections";
import {
  NOTIFICATION_CATEGORY_META_KEYS,
  resolveNotificationPrefs,
  type NotificationCategory,
  type NotificationPrefs,
} from "@/lib/notification-prefs";

const CATEGORIES: readonly NotificationCategory[] = [
  "assigned",
  "mention",
  "comment",
  "agent",
  "routine",
  "pullRequest",
  "feedback",
  "page",
];

/**
 * Account → Notifications (MIN-82): which triggers land in the Inbox. Same
 * account-preferences pattern as Cycles: everything in auth user_metadata,
 * optimistic local state, write through updateUserMetadata, revert + toast on
 * failure. The filter runs server-side at insert time — flipping a switch off
 * stops FUTURE notifications, it never erases existing ones.
 */
export function AccountNotificationsSection() {
  const t = useTranslations("NotificationSettings");
  const { user, updateUserMetadata } = useAuth();

  const [prefs, setPrefs] = useState<NotificationPrefs>(
    resolveNotificationPrefs(user?.user_metadata)
  );
  useEffect(() => {
    setPrefs(resolveNotificationPrefs(user?.user_metadata));
  }, [user]);

  const save = async (category: NotificationCategory, value: boolean) => {
    if (!user) return;
    const prev = prefs;
    setPrefs({ ...prefs, [category]: value }); // optimistic — revert on failure
    try {
      await updateUserMetadata({
        [NOTIFICATION_CATEGORY_META_KEYS[category]]: value,
      });
    } catch (e) {
      setPrefs(prev);
      toast.error((e as Error).message);
    }
  };

  return (
    <SettingsGroup
      anchor={SETTINGS_SECTIONS.accountNotifications}
      icon={Inbox}
      title={t("title")}
      description={t("description")}
    >
      {/* L'interrupteur est À DROITE du libellé, comme partout ailleurs dans le
          produit : c'était le seul endroit qui le mettait devant. */}
      {CATEGORIES.map((category) => (
        <SettingsRow
          key={category}
          htmlFor={`notif-${category}`}
          label={t(`${category}Label`)}
          hint={t(`${category}Desc`)}
          control={
            <Switch
              id={`notif-${category}`}
              checked={prefs[category]}
              onCheckedChange={(v) => void save(category, v)}
              disabled={!user}
            />
          }
        />
      ))}
    </SettingsGroup>
  );
}

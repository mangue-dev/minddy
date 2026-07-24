"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Switch, toast } from "mangue-ui";
import { useAuth } from "@/lib/auth-context";
import { SettingsSection } from "@/components/settings-shell";
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
  "feedback",
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
    <SettingsSection title={t("title")} description={t("description")}>
      <div className="flex flex-col gap-4">
        {CATEGORIES.map((category) => (
          <div key={category} className="flex items-start gap-3">
            <Switch
              id={`notif-${category}`}
              checked={prefs[category]}
              onCheckedChange={(v) => void save(category, v)}
              disabled={!user}
            />
            <div className="flex min-w-0 flex-col">
              <label
                htmlFor={`notif-${category}`}
                className="cursor-pointer text-sm text-foreground"
              >
                {t(`${category}Label`)}
              </label>
              <span className="text-xs text-muted-foreground">
                {t(`${category}Desc`)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </SettingsSection>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Switch } from "@/components/ui/switch";
import { SettingsGroup, SettingsRow } from "@/components/settings/settings-ui";
import { useAccountPreference } from "@/components/settings/use-account-preference";
import { getMobileBridge } from "@/lib/mobile/bridge";
import { HAPTICS_META_KEY, resolveHaptics } from "@/lib/mobile/haptics";

/**
 * Account → Preferences: the mobile app (MIN-959). Shown only inside a shell
 * that can vibrate; the switch belongs to the account, so it follows the
 * person to their other phones.
 */
export function AccountMobileSection() {
  const ta = useTranslations("Account");
  // Known after mounting only: the bridge exists in the client alone.
  const [canVibrate, setCanVibrate] = useState(false);
  const [haptics, setHaptics, ready] = useAccountPreference(HAPTICS_META_KEY, resolveHaptics);

  useEffect(() => {
    setCanVibrate(!!getMobileBridge()?.shell?.haptic);
  }, []);

  if (!canVibrate) return null;
  return (
    <SettingsGroup title={ta("hapticsSectionTitle")}>
      <SettingsRow
        htmlFor="account-haptics"
        label={ta("hapticsLabel")}
        hint={ta("hapticsDesc")}
        control={
          <Switch
            id="account-haptics"
            checked={haptics}
            onCheckedChange={(v) => void setHaptics(v)}
            disabled={!ready}
          />
        }
      />
    </SettingsGroup>
  );
}

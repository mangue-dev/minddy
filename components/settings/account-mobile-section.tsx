"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Switch } from "@/components/ui/switch";
import { SettingsGroup, SettingsRow } from "@/components/settings/settings-ui";
import { useAccountPreference } from "@/components/settings/use-account-preference";
import { useAiConsent, useAnswerAiConsent } from "@/components/mobile/ai-consent-gate";
import { getMobileBridge } from "@/lib/mobile/bridge";
import { HAPTICS_META_KEY, resolveHaptics } from "@/lib/mobile/haptics";
import { useNativeMobile } from "@/lib/native-app";

/**
 * Account → Preferences: the mobile app, shown only inside it.
 *
 * Vibrations (MIN-959) belong to the account, so the switch follows the person
 * to their other phones, and show only in a shell that can vibrate. The AI
 * features switch is this device's answer to the consent sheet (MIN-907,
 * `components/mobile/ai-consent-gate.tsx`), also kept on the account for the
 * cron jobs.
 */
export function AccountMobileSection() {
  const ta = useTranslations("Account");
  const tc = useTranslations("AiConsent");
  const native = useNativeMobile();
  // Known after mounting only: the bridge exists in the client alone.
  const [canVibrate, setCanVibrate] = useState(false);
  const [haptics, setHaptics, ready] = useAccountPreference(HAPTICS_META_KEY, resolveHaptics);
  const aiConsent = useAiConsent();
  const answerAiConsent = useAnswerAiConsent();

  useEffect(() => {
    setCanVibrate(!!getMobileBridge()?.shell?.haptic);
  }, []);

  if (!native) return null;
  return (
    <SettingsGroup title={ta("hapticsSectionTitle")}>
      {canVibrate ? (
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
      ) : null}
      <SettingsRow
        htmlFor="account-ai-consent"
        label={tc("settingsLabel")}
        hint={tc("settingsDesc")}
        control={
          <Switch
            id="account-ai-consent"
            checked={aiConsent === "granted"}
            onCheckedChange={(v) => answerAiConsent(v ? "granted" : "declined")}
          />
        }
      />
    </SettingsGroup>
  );
}

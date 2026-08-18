"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AppWindow } from "lucide-react";
import { Switch } from "mangue-ui";

import { getDesktopBridge } from "@/lib/desktop/bridge";
import { desktopChannelForOrigin, type DesktopChannel } from "@/lib/desktop/channel";
import { SettingsGroup, SettingsRow } from "@/components/settings/settings-ui";

/**
 * Account → Preferences: the CHANNEL of the desktop app (MIN-352).
 *
 * ## It only exists in the app, and without anchor
 *
 * No entry in `SETTINGS_SECTIONS`, unlike all its neighbors, and
 * this is not an oversight: the catalog feeds ⌘K, which runs everywhere. An
 * entry here would give every person on the web a palette row that
 * opens preferences and doesn't highlight anything — exactly the default that
 * `settings-sections.test.ts` exists to prevent. A card that only appears in one context has no place in a table read by all contexts. it is the origin which serves this page.
 * No round trip to do, and above all no second state to keep synchronous
 * with the URL actually loaded. `null` — the dev on `localhost`, or any
 * just the browser — removes the card rather than displaying a
 * switch which would not move.
 */
export function AccountDesktopSection() {
  const ta = useTranslations("Account");
  // `null` until mounting: the bridge and the origin only exist on the client side, and
  // returning the card on the first pass would cause it to flash at everyone's house.
  const [channel, setChannel] = useState<DesktopChannel | null>(null);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    if (!getDesktopBridge()) return;
    setChannel(desktopChannelForOrigin(window.location.origin));
  }, []);

  if (!channel) return null;

  // We do NOT return from this call: the main process reloads the window on
  // the other origin, and this document ceases to exist. So the switch freezes
  // on the requested position — there is no one to put it back, and that's it
  // that we want to see during the second of loading.
  const toggle = (next: boolean) => {
    const bridge = getDesktopBridge();
    if (!bridge || switching) return;
    setSwitching(true);
    setChannel(next ? "preview" : "stable");
    bridge.setChannel(next ? "preview" : "stable");
  };

  return (
    <SettingsGroup
      icon={AppWindow}
      title={ta("desktopSectionTitle")}
      description={ta("desktopSectionDesc")}
    >
      <SettingsRow
        htmlFor="account-desktop-preview"
        label={ta("desktopPreviewLabel")}
        hint={ta("desktopPreviewDesc")}
        control={
          <Switch
            id="account-desktop-preview"
            checked={channel === "preview"}
            onCheckedChange={toggle}
            disabled={switching}
          />
        }
      />
    </SettingsGroup>
  );
}

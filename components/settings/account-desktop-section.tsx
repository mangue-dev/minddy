"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Download01Icon } from "@hugeicons/core-free-icons";
import {useEffect, useState} from "react";
import {useTranslations} from "next-intl";

import { Button } from "@/components/ui/button";

import {getDesktopBridge} from "@/lib/desktop/bridge";
import type {DesktopBridge} from "@/lib/desktop/bridge";
import Link from "@/components/app-link";
import {SettingsGroup, SettingsRow} from "@/components/settings/settings-ui";
import {SETTINGS_SECTIONS} from "@/lib/settings-sections";
import {useAnalytics} from "@/lib/use-analytics";

/**
 * Account → Preferences: the desktop app, in ONE card everywhere (MIN-737).
 *
 * In the app it carries the server and the version: the origin that serves this page is the server, so there is no
 * round trip and no second state to keep in sync with the loaded URL. On the
 * web it carries the download link (MIN-292), which used to sit in the profile
 * card. The card therefore exists in every context, which is what lets it
 * hold a catalog anchor that ⌘K can land on.
 *
 * The download row is FIXED, without a button to dismiss it: this is the
 * place people come back to after dismissing the welcome banner. It stays
 * visible on Windows and Linux, where its label says the app is for macOS.
 */
export function AccountDesktopSection() {
  const ta = useTranslations("Account");
  // `null` until mounting: the bridge and origin exist only in the client.
  // Rendering the card on the first pass would make it flash in browsers.
  const [desktop, setDesktop] = useState<{
    bridge: DesktopBridge;
    origin: string;
  } | null>(null);
  const [checking, setChecking] = useState(false);
  // Whether the bridge was looked for: before that, rendering the download
  // row would make it flash inside the app.
  const [mounted, setMounted] = useState(false);
  const { track } = useAnalytics();

  useEffect(() => {
    setMounted(true);
    const bridge = getDesktopBridge();
    if (!bridge) return;
    setDesktop({ bridge, origin: window.location.origin });
  }, []);

  if (!desktop) {
    if (!mounted) return null;
    return (
      <SettingsGroup
        anchor={SETTINGS_SECTIONS.accountDesktop}
        title={ta("desktopSectionTitle")}
      >
        <SettingsRow
          label={ta("desktopAppLabel")}
          hint={ta("desktopAppHint")}
          control={
            <Button asChild variant="outline" size="sm">
              <Link
                href="/download"
                onClick={() =>
                  track("desktop_install_prompt_clicked", { surface: "settings" })
                }
              >
                <HugeiconsIcon icon={Download01Icon} />
                {ta("desktopAppCta")}
              </Link>
            </Button>
          }
        />
      </SettingsGroup>
    );
  }

  const checkForUpdates = async () => {
    if (!desktop.bridge.checkForUpdates || checking) return;
    setChecking(true);
    try {
      await desktop.bridge.checkForUpdates();
    } finally {
      setChecking(false);
    }
  };

  return (
    <SettingsGroup
      anchor={SETTINGS_SECTIONS.accountDesktop}
      title={ta("desktopSectionTitle")}
    >
      <SettingsRow
        label={ta("desktopServerLabel")}
        hint={desktop.origin}
        control={
          desktop.bridge.openServerPicker ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => desktop.bridge.openServerPicker?.()}
            >
              {ta("desktopServerChange")}
            </Button>
          ) : undefined
        }
      />
      <SettingsRow
        label={ta("desktopVersionLabel")}
        hint={ta("desktopVersionValue", { version: desktop.bridge.version })}
        control={
          desktop.bridge.checkForUpdates ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={checking}
              onClick={() => void checkForUpdates()}
            >
              {ta(checking ? "desktopUpdateChecking" : "desktopUpdateCheck")}
            </Button>
          ) : undefined
        }
      />
    </SettingsGroup>
  );
}

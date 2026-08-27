"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AppWindow } from "lucide-react";
import { Button, Switch } from "mangue-ui";

import { getDesktopBridge, type DesktopBridge } from "@/lib/desktop/bridge";
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
  // `null` until mounting: the bridge and origin exist only in the client.
  // Rendering the card on the first pass would make it flash in browsers.
  const [desktop, setDesktop] = useState<{
    bridge: DesktopBridge;
    channel: DesktopChannel | null;
    origin: string;
  } | null>(null);
  const [switching, setSwitching] = useState(false);
  const [checking, setChecking] = useState(false);
  const [copyingDiagnostics, setCopyingDiagnostics] = useState(false);
  const [diagnosticsCopied, setDiagnosticsCopied] = useState(false);

  useEffect(() => {
    const bridge = getDesktopBridge();
    if (!bridge) return;
    setDesktop({
      bridge,
      channel: desktopChannelForOrigin(window.location.origin),
      origin: window.location.origin,
    });
  }, []);

  if (!desktop) return null;

  // The main process reloads the window on the other origin, so this document
  // disappears. Keep the switch on the requested value during that handoff.
  const toggle = (next: boolean) => {
    if (switching) return;
    setSwitching(true);
    setDesktop({ ...desktop, channel: next ? "preview" : "stable" });
    desktop.bridge.setChannel(next ? "preview" : "stable");
  };

  const checkForUpdates = async () => {
    if (!desktop.bridge.checkForUpdates || checking) return;
    setChecking(true);
    try {
      await desktop.bridge.checkForUpdates();
    } finally {
      setChecking(false);
    }
  };

  const copyDiagnostics = async () => {
    if (!desktop.bridge.copyDiagnosticReport || copyingDiagnostics) return;
    setCopyingDiagnostics(true);
    setDiagnosticsCopied(false);
    try {
      setDiagnosticsCopied(await desktop.bridge.copyDiagnosticReport());
    } finally {
      setCopyingDiagnostics(false);
    }
  };

  return (
    <SettingsGroup
      icon={AppWindow}
      title={ta("desktopSectionTitle")}
      description={ta("desktopSectionDesc")}
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
      {desktop.channel && (
        <SettingsRow
          htmlFor="account-desktop-preview"
          label={ta("desktopPreviewLabel")}
          hint={ta("desktopPreviewDesc")}
          control={
            <Switch
              id="account-desktop-preview"
              checked={desktop.channel === "preview"}
              onCheckedChange={toggle}
              disabled={switching}
            />
          }
        />
      )}
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
      {desktop.bridge.copyDiagnosticReport && (
        <SettingsRow
          label={ta("desktopDiagnosticsLabel")}
          hint={ta("desktopDiagnosticsDesc")}
          control={
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={copyingDiagnostics}
              onClick={() => void copyDiagnostics()}
            >
              {ta(
                diagnosticsCopied
                  ? "desktopDiagnosticsCopied"
                  : copyingDiagnostics
                    ? "desktopDiagnosticsCopying"
                    : "desktopDiagnosticsCopy",
              )}
            </Button>
          }
        />
      )}
    </SettingsGroup>
  );
}

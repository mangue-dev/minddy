"use client";

import { useCallback, useEffect, useState } from "react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import {
  Button,
  ConfirmDeleteDialog,
  IconButton,
  Spinner,
  Switch,
  toast,
} from "mangue-ui";
import { BellRing, Monitor, Send, Settings2, Smartphone, Trash2 } from "lucide-react";

import {
  deletePushDeviceApi,
  setPushDeviceEnabledApi,
  testPushDeviceApi,
} from "@/lib/push-devices-api";
import { pushDevicesQueryKey, usePushDevicesQuery } from "@/lib/use-push-devices-query";
import {
  currentEndpoint,
  isPushSupported,
  isIOS,
  isStandalone,
  pushPermission,
  subscribeThisDevice,
  unsubscribeThisDevice,
} from "@/lib/push/client";
import { trackEvent } from "@/lib/analytics";
import { getDesktopBridge, isDesktop } from "@/lib/desktop/bridge";
import type { LinuxBackgroundNotificationState } from "@/lib/desktop/linux-background";
import { isMobileDeviceLabel } from "@/lib/device-label";
import {
  SettingsEmpty,
  SettingsGroup,
  SettingsListRow,
  SettingsRow,
} from "@/components/settings/settings-ui";
import { SETTINGS_SECTIONS } from "@/lib/settings-sections";
import type { PushDevice } from "@/lib/types";
import { AppTooltip } from "@/components/ui/app-tooltip";

/**
 * “Push notifications” (MIN-183) — the card by which you turn on, turn off and
 * remove devices.
 *
 * Two plans, and they don't say the same thing:
 *
 * 1. the head row talks about THIS device, the one we have under our
 * fingers. This is the only one that can be subscribed to, because a subscription is born
 * from a browser permission, and a permission is only requested where
 * it will be used;
 * 2. the list talks about ALL devices, this one included. This is where we
 * turn off the cell phone left in the office, or remove the old phone.
 *
 * The fallback states count as much as the nominal gesture, and everyone says what
 * must DO rather than what is missing: browser unable, permission
 * refused (unrecoverable from the page — only the browser settings
 * reopen), iOS without PWA installed (the push there requires adding to the
 * home screen, and the switch could do nothing other than fail).
 */
export function AccountPushDevicesSection() {
  const t = useTranslations("Push");
  const tc = useTranslations("Common");
  const format = useFormatter();
  const locale = useLocale();
  const queryClient = useQueryClient();

  const { devices, capabilities, loading } = usePushDevicesQuery();
  const [permission, setPermission] = useState<
    NotificationPermission | "unsupported" | null
  >(null);
  const [needsInstall, setNeedsInstall] = useState(false);
  /** Like browser capabilities, read after editing (see effect). */
  const [inDesktopApp, setInDesktopApp] = useState(false);
  const [nativeDesktopPush, setNativeDesktopPush] = useState(false);
  const [nativeDesktopTransport, setNativeDesktopTransport] = useState<
    "apns" | "wns" | null
  >(null);
  const [localDesktopBanners, setLocalDesktopBanners] = useState(false);
  const [nativeNotificationSettings, setNativeNotificationSettings] = useState(false);
  const [linuxBackground, setLinuxBackground] = useState<
    LinuxBackgroundNotificationState | null | undefined
  >(undefined);
  const [linuxBackgroundBusy, setLinuxBackgroundBusy] = useState(false);
  const [thisEndpoint, setThisEndpoint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [toRemove, setToRemove] = useState<PushDevice | null>(null);

  // Browser capabilities are only read AFTER editing: rendered side
  // server, they don't exist, and assuming them would cause the card to flash.
  useEffect(() => {
    setPermission(pushPermission());
    setNeedsInstall(isIOS() && !isStandalone());
    setInDesktopApp(isDesktop());
    const desktop = getDesktopBridge();
    const nativeTransport =
      desktop?.notificationCapabilities?.backgroundTransport ?? null;
    setNativeDesktopTransport(nativeTransport);
    setNativeDesktopPush(
      nativeTransport !== null && !!desktop?.registerForPushNotifications
    );
    setLocalDesktopBanners(
      desktop?.notificationCapabilities?.localNativeBanners === true
    );
    setNativeNotificationSettings(
      desktop?.notificationCapabilities?.settings !== null &&
        !!desktop?.openNotificationSettings
    );
    if (desktop?.notificationCapabilities?.backgroundSession === "linux") {
      void desktop.getLinuxBackgroundNotifications?.().then(setLinuxBackground);
    } else {
      setLinuxBackground(null);
    }
    const stopLinuxBackground =
      desktop?.onLinuxBackgroundNotificationsChanged?.(setLinuxBackground);
    if (isPushSupported()) void currentEndpoint().then(setThisEndpoint);
    return () => stopLinuxBackground?.();
  }, []);

  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: pushDevicesQueryKey }),
    [queryClient]
  );

  /** Is THIS device's subscription known to the server AND active? It's this
 * that the head switch reflects — not the single browser permission,
 * that can be granted without any lines existing. */
  const thisDevice = thisEndpoint
    ? (devices.find((d) => d.endpoint === thisEndpoint) ?? null)
    : null;
  const on = !!thisDevice?.enabled;

  /**
 * ⚠ Called DIRECTLY from the gesture, without `await` before the request for
 * permission: Safari (macOS like iOS) refuses a `requestPermission()` that
 * is not in the call stack of a user interaction.
 */
  const toggleThisDevice = async (next: boolean) => {
    setBusy(true);
    try {
      if (next) {
        // Already a subscriber but cut off: it's a simple restart, permission is
        // acquired and there is no need to ask for it again.
        if (thisDevice) {
          await setPushDeviceEnabledApi(thisDevice.id, true);
          toast.success(t("enabledToast"));
        } else {
          const result = await subscribeThisDevice(locale);
          if (!result.ok) {
            if (result.reason === "denied") {
              // Permission is not necessarily DENIED: close the window
              // browser without responding leaves it at “default”, and asks again
              // will work. Announce “blocked, reopen site settings”
              // would then be false — the switch which returns to the stop says
              // already it didn't work.
              const after = pushPermission();
              setPermission(after);
              trackEvent("push_permission_denied", {});
              if (after === "denied") toast.error(t("deniedHint"));
            } else if (result.reason === "needs-install") {
              setNeedsInstall(true);
              toast.error(t("iosInstallHint"));
            } else if (result.reason === "not-configured") {
              toast.error(t("notConfiguredHint"));
            } else {
              toast.error(result.message ?? t("unsupportedHint"));
            }
            return;
          }
          setPermission(pushPermission());
          setThisEndpoint(result.device.endpoint);
          toast.success(t("enabledToast"));
        }
      } else {
        // Turn off do not UNSUBSCRIBE: permission remains granted, and turn on again
        // no longer goes through the browser window.
        if (thisDevice) await setPushDeviceEnabledApi(thisDevice.id, false);
        toast.success(t("disabledToast"));
      }
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const toggleDevice = async (device: PushDevice, enabled: boolean) => {
    try {
      await setPushDeviceEnabledApi(device.id, enabled);
      toast.success(enabled ? t("enabledToast") : t("disabledToast"));
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleRemove = async () => {
    if (!toRemove) return;
    try {
      // Remove THE CURRENT DEVICE also unsubscribe it on the browser side: without
      // that, permission would remain granted with a subscription that no longer
      // no one knows, and the next “enable” would create a line
      // carrying the same endpoint that we just deleted.
      if (toRemove.endpoint === thisEndpoint) {
        await unsubscribeThisDevice();
        setThisEndpoint(null);
      }
      await deletePushDeviceApi(toRemove.id);
      toast.success(t("removedToast", { name: deviceName(toRemove) }));
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const sendTest = async (device: PushDevice) => {
    setTestingId(device.id);
    try {
      await testPushDeviceApi(device.id);
      toast.success(t("testSentToast"));
    } catch (e) {
      toast.error((e as Error).message);
      // A 410 has just purged the line on the server side: the list must move.
      await refresh();
    } finally {
      setTestingId(null);
    }
  };

  const toggleLinuxBackground = async (enabled: boolean) => {
    const desktop = getDesktopBridge();
    if (!desktop?.setLinuxBackgroundNotifications) return;
    setLinuxBackgroundBusy(true);
    try {
      const state = await desktop.setLinuxBackgroundNotifications(enabled);
      setLinuxBackground(state);
      toast.success(
        t(enabled ? "linuxBackgroundEnabledToast" : "linuxBackgroundDisabledToast")
      );
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLinuxBackgroundBusy(false);
    }
  };

  const deviceName = (d: PushDevice) => d.device_label || t("unknownDevice");

  const transportConfigured = (device: PushDevice) =>
    device.transport === "apns"
      ? capabilities?.apns
      : device.transport === "wns"
        ? capabilities?.wns
        : capabilities?.web;

  const subtitleOf = (d: PushDevice) => {
    const parts = [
      t("addedOn", {
        date: format.dateTime(new Date(d.created_at), { dateStyle: "medium" }),
      }),
      d.last_push_at
        ? t("lastPush", {
            date: format.dateTime(new Date(d.last_push_at), {
              dateStyle: "medium",
              timeStyle: "short",
            }),
          })
        : t("neverPushed"),
    ];
    if (d.endpoint === thisEndpoint) parts.unshift(t("thisDevice"));
    if (!d.enabled) parts.push(t("disabled"));
    return parts.join(" · ");
  };

  // The head switch only makes sense where it can lead. Everywhere
  // elsewhere we put the clue in its place: saying why is better than offering a
  // gesture that will fail.
  const blocked =
    // A desktop shell without a background transport must not expose a switch
    // that can never create a server-side push subscription.
    inDesktopApp && !nativeDesktopPush
      ? t(
          (linuxBackground && !linuxBackground.nativeBannersAvailable) ||
            (!localDesktopBanners && linuxBackground !== null)
            ? "linuxNativeUnavailableHint"
            : "desktopLocalHint"
        )
      : capabilities &&
          !(
            nativeDesktopTransport === "apns"
              ? capabilities.apns
              : nativeDesktopTransport === "wns"
                ? capabilities.wns
                : capabilities.web
          )
        ? t("notConfiguredHint")
        : permission === "unsupported"
          ? t("unsupportedHint")
          : permission === "denied"
            ? t(nativeNotificationSettings ? "macDeniedHint" : "deniedHint")
            : needsInstall
              ? t("iosInstallHint")
              : null;

  return (
    <>
      <SettingsGroup
        anchor={SETTINGS_SECTIONS.accountPushDevices}
        icon={BellRing}
        title={t("devicesTitle")}
        description={t("devicesDesc")}
      >
        <SettingsRow
          htmlFor="push-this-device"
          label={t("enableLabel")}
          hint={
            blocked ??
            t(
              nativeDesktopTransport === "wns"
                ? "enableDescWindows"
                : nativeDesktopPush
                  ? "enableDescNative"
                  : "enableDesc"
            )
          }
          control={
            blocked && !nativeNotificationSettings ? undefined : (
              <>
                {nativeNotificationSettings && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => getDesktopBridge()?.openNotificationSettings?.()}
                  >
                    <Settings2 className="size-4" />
                    {t(
                      nativeDesktopTransport === "wns"
                        ? "windowsSettingsButton"
                        : "macSettingsButton"
                    )}
                  </Button>
                )}
                {!blocked && (
                  <>
                    {busy && <Spinner />}
                    <Switch
                      id="push-this-device"
                      checked={on}
                      disabled={busy || permission === null}
                      onCheckedChange={(v) => void toggleThisDevice(v)}
                    />
                  </>
                )}
              </>
            )
          }
        />

        {linuxBackground && (
          <SettingsRow
            htmlFor="linux-background-notifications"
            label={t("linuxBackgroundLabel")}
            hint={t(
              !linuxBackground.nativeBannersAvailable
                ? "linuxNativeUnavailableHint"
                : linuxBackground.enabled && !linuxBackground.autostartInstalled
                  ? "linuxAutostartErrorHint"
                  : linuxBackground.enabled
                    ? "linuxBackgroundEnabledHint"
                    : "linuxBackgroundDisabledHint"
            )}
            control={
              <>
                {linuxBackgroundBusy && <Spinner />}
                <Switch
                  id="linux-background-notifications"
                  checked={linuxBackground.enabled}
                  disabled={
                    linuxBackgroundBusy ||
                    (!linuxBackground.nativeBannersAvailable &&
                      !linuxBackground.enabled)
                  }
                  onCheckedChange={(value) => void toggleLinuxBackground(value)}
                />
              </>
            }
          />
        )}

        {loading ? (
          <SettingsEmpty>{tc("loading")}</SettingsEmpty>
        ) : devices.length === 0 ? (
          <SettingsEmpty>{t("empty")}</SettingsEmpty>
        ) : (
          devices.map((device) => (
            <SettingsListRow
              key={device.id}
              icon={isMobileDeviceLabel(device.device_label) ? Smartphone : Monitor}
              title={deviceName(device)}
              subtitle={subtitleOf(device)}
              action={
                <>
                  {/* The test is only offered on the device you have in front of you: elsewhere, you wouldn't see if it rang. */}
                  {device.endpoint === thisEndpoint &&
                    device.enabled &&
                    transportConfigured(device) && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={testingId === device.id}
                      onClick={() => void sendTest(device)}
                    >
                      {testingId === device.id ? <Spinner /> : <Send className="size-4" />}
                      {t("testButton")}
                    </Button>
                  )}
                  <Switch
                    aria-label={t("enableLabel")}
                    checked={device.enabled}
                    disabled={
                      !transportConfigured(device)
                    }
                    onCheckedChange={(v) => void toggleDevice(device, v)}
                  />
                  <AppTooltip label={t("remove")}>
                    <IconButton
                      size="sm"
                      aria-label={t("remove")}
                      onClick={() => setToRemove(device)}
                    >
                      <Trash2 className="size-4" />
                    </IconButton>
                  </AppTooltip>
                </>
              }
            />
          ))
        )}
      </SettingsGroup>

      <ConfirmDeleteDialog
        open={!!toRemove}
        onOpenChange={(open) => !open && setToRemove(null)}
        title={t("removeTitle", { name: toRemove ? deviceName(toRemove) : "" })}
        description={t("removeDescription")}
        confirmLabel={t("remove")}
        cancelLabel={tc("cancel")}
        onConfirm={handleRemove}
      />
    </>
  );
}

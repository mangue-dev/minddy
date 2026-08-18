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
import { isMobileDeviceLabel } from "@/lib/device-label";
import {
  SettingsEmpty,
  SettingsGroup,
  SettingsListRow,
  SettingsRow,
} from "@/components/settings/settings-ui";
import { SETTINGS_SECTIONS } from "@/lib/settings-sections";
import type { PushDevice } from "@/lib/types";

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
  const [nativeNotificationSettings, setNativeNotificationSettings] = useState(false);
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
    setNativeDesktopPush(!!desktop?.registerForPushNotifications);
    setNativeNotificationSettings(!!desktop?.openNotificationSettings);
    if (isPushSupported()) void currentEndpoint().then(setThisEndpoint);
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
      await testPushDeviceApi(device.endpoint);
      toast.success(t("testSentToast"));
    } catch (e) {
      toast.error((e as Error).message);
      // A 410 has just purged the line on the server side: the list must move.
      await refresh();
    } finally {
      setTestingId(null);
    }
  };

  const deviceName = (d: PushDevice) => d.device_label || t("unknownDevice");

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
    capabilities && !(nativeDesktopPush ? capabilities.apns : capabilities.web)
      ? t("notConfiguredHint")
      : // L'app de bureau (MIN-291) : Electron n'embarque pas l'API Push, donc
        // `permission` is equal to `unsupported` — but “this browser does not manage
        // push notifications” reads like an outage, when it is actually a
        // assumed renunciation, and that there is a way out (keeping the web open). Say it.
        inDesktopApp && !nativeDesktopPush
        ? t("desktopHint")
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
          hint={blocked ?? t(nativeDesktopPush ? "enableDescNative" : "enableDesc")}
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
                    {t("macSettingsButton")}
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
                    (device.transport === "apns"
                      ? capabilities?.apns
                      : capabilities?.web) && (
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
                      !(device.transport === "apns" ? capabilities?.apns : capabilities?.web)
                    }
                    onCheckedChange={(v) => void toggleDevice(device, v)}
                  />
                  <IconButton
                    size="sm"
                    aria-label={t("remove")}
                    title={t("remove")}
                    onClick={() => setToRemove(device)}
                  >
                    <Trash2 className="size-4" />
                  </IconButton>
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

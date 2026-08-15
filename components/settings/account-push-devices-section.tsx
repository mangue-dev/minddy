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
 * « Notifications push » (MIN-183) — la carte par laquelle on allume, éteint et
 * retire des appareils.
 *
 * Deux plans, et ils ne disent pas la même chose :
 *
 *   1. la rangée de tête parle de CET appareil-ci, celui qu'on a sous les
 *      doigts. C'est le seul qu'on puisse abonner, parce qu'un abonnement naît
 *      d'une permission navigateur, et qu'une permission ne se demande que là où
 *      elle sera utilisée ;
 *   2. la liste parle de TOUS les appareils, celui-ci compris. C'est là qu'on
 *      coupe le portable resté au bureau, ou qu'on retire l'ancien téléphone.
 *
 * Les états de repli comptent autant que le geste nominal, et chacun dit ce
 * qu'il faut FAIRE plutôt que ce qui manque : navigateur incapable, permission
 * refusée (irrécupérable depuis la page — seuls les réglages du navigateur la
 * rouvrent), iOS hors PWA installée (le push y exige l'ajout à l'écran
 * d'accueil, et l'interrupteur ne pourrait rien faire d'autre qu'échouer).
 */
export function AccountPushDevicesSection() {
  const t = useTranslations("Push");
  const tc = useTranslations("Common");
  const format = useFormatter();
  const locale = useLocale();
  const queryClient = useQueryClient();

  const { devices, loading } = usePushDevicesQuery();
  const [permission, setPermission] = useState<
    NotificationPermission | "unsupported" | null
  >(null);
  const [needsInstall, setNeedsInstall] = useState(false);
  /** Comme les capacités du navigateur, lue après le montage (voir l'effet). */
  const [inDesktopApp, setInDesktopApp] = useState(false);
  const [nativeDesktopPush, setNativeDesktopPush] = useState(false);
  const [nativeNotificationSettings, setNativeNotificationSettings] = useState(false);
  const [thisEndpoint, setThisEndpoint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [toRemove, setToRemove] = useState<PushDevice | null>(null);

  // Les capacités du navigateur ne se lisent qu'APRÈS le montage : rendues côté
  // serveur, elles n'existent pas, et les supposer ferait clignoter la carte.
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

  /** L'abonnement de CET appareil est-il connu du serveur ET actif ? C'est ce
   *  que l'interrupteur de tête reflète — pas la seule permission navigateur,
   *  qui peut être accordée sans qu'aucune ligne n'existe. */
  const thisDevice = thisEndpoint
    ? (devices.find((d) => d.endpoint === thisEndpoint) ?? null)
    : null;
  const on = !!thisDevice?.enabled;

  /**
   * ⚠ Appelé DIRECTEMENT depuis le geste, sans `await` avant la demande de
   * permission : Safari (macOS comme iOS) refuse un `requestPermission()` qui
   * n'est pas dans la pile d'appels d'une interaction utilisateur.
   */
  const toggleThisDevice = async (next: boolean) => {
    setBusy(true);
    try {
      if (next) {
        // Déjà abonné mais coupé : c'est un simple rallumage, la permission est
        // acquise et il n'y a pas à la redemander.
        if (thisDevice) {
          await setPushDeviceEnabledApi(thisDevice.id, true);
          toast.success(t("enabledToast"));
        } else {
          const result = await subscribeThisDevice(locale);
          if (!result.ok) {
            if (result.reason === "denied") {
              // La permission n'est pas forcément REFUSÉE : fermer la fenêtre du
              // navigateur sans répondre la laisse à « default », et redemander
              // marchera. Annoncer « bloqué, rouvrez les réglages du site »
              // serait alors faux — l'interrupteur qui revient à l'arrêt dit
              // déjà que ça n'a pas pris.
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
        // Éteindre ne DÉSABONNE pas : la permission reste acquise, et rallumer
        // ne repasse plus par la fenêtre du navigateur.
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
      // Retirer L'APPAREIL COURANT le désabonne aussi côté navigateur : sans
      // ça, la permission resterait accordée avec un abonnement que plus
      // personne ne connaît, et le prochain « activer » créerait une ligne
      // portant le même endpoint qu'on vient de supprimer.
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
      // Un 410 vient de purger la ligne côté serveur : la liste doit bouger.
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

  // L'interrupteur de tête n'a de sens que là où il peut aboutir. Partout
  // ailleurs on met l'indice à sa place : dire pourquoi vaut mieux qu'offrir un
  // geste qui échouera.
  const blocked =
    // L'app de bureau (MIN-291) : Electron n'embarque pas l'API Push, donc
    // `permission` y vaut `unsupported` — mais « ce navigateur ne gère pas les
    // notifications push » se lit comme une panne, alors que c'est un
    // renoncement assumé, et qu'il a une issue (garder le web ouvert). Le dire.
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
                  {/* L'essai n'est offert que sur l'appareil qu'on a sous les
                      yeux : ailleurs, on ne verrait pas s'il a sonné. */}
                  {device.endpoint === thisEndpoint && device.enabled && (
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

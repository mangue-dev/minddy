import { sendDesktopEvent, type DesktopIpcHandlers, type DesktopIpcTarget } from "@/lib/desktop/ipc-main";
import type { LinuxBackgroundNotificationState } from "@/lib/desktop/linux-background";
import type {
  DesktopLocalNotificationHandle,
  DesktopLocalNotificationPayload,
  DesktopLocalNotificationRegistry,
} from "@/lib/desktop/local-notification";
import type { DesktopNotificationCapabilities } from "@/lib/desktop/notification-capabilities";
import { nativeNotificationSettingsUrl } from "@/lib/desktop/native-push";
import { DESKTOP_BUNDLE_ID } from "@/lib/desktop/config";
import type { DesktopNativePushRegistration } from "@/lib/desktop/bridge";

/** The part of Electron's `Notification` a banner uses. */
export interface NativeBanner extends DesktopLocalNotificationHandle {
  on(event: "click" | "show" | "close" | "failed", listener: () => void): unknown;
  show(): void;
}

interface NotificationDependencies {
  capabilities: () => DesktopNotificationCapabilities;
  /** Electron's `Notification.isSupported()`, asked again on every banner. */
  bannersSupported: () => boolean;
  createBanner: (payload: DesktopLocalNotificationPayload) => NativeBanner;
  banners: DesktopLocalNotificationRegistry;
  origin: () => string;
  /** Opens a route of the selected server, `null` for none, and shows the window. */
  revealTarget: (target: string | null) => void;
  /** Records whether the system shows banners; Linux pages are told through `linux-background:changed`. */
  setBannersAvailable: (available: boolean) => void;
  setDockBadge: (text: string) => void;
  setWindowsBadge: (count: number) => void;
  /** `null` outside a Linux background session. */
  linuxBackgroundState: () => LinuxBackgroundNotificationState | null;
  /** Saves the preference and installs or removes the autostart entry. */
  setLinuxBackground: (enabled: boolean) => void;
}

type NotificationChannel =
  | "minddy:set-badge"
  | "minddy:notification:show"
  | "minddy:notification:dismiss"
  | "minddy:linux-background:get"
  | "minddy:linux-background:set"
  | "minddy:linux-background:changed";

/** Banners and badge while the app runs, and the Linux session that keeps it running in the background. */
export function notificationHandlers<E extends { sender: DesktopIpcTarget }>(
  deps: NotificationDependencies,
): Pick<DesktopIpcHandlers<E>, NotificationChannel> {
  const linuxSession = () => deps.capabilities().backgroundSession === "linux";
  return {
    "minddy:set-badge": (_event, count) => {
      const badge = deps.capabilities().badge;
      if (badge === "dock") deps.setDockBadge(count > 0 ? String(count) : "");
      else if (badge === "windows") deps.setWindowsBadge(count);
    },
    "minddy:notification:show": (_event, payload) => {
      // Not the page's capabilities: after a failed banner they report none
      // available, and a later banner is what notices the recovery.
      if (!deps.bannersSupported()) return;
      const banner = deps.createBanner(payload);
      if (!deps.banners.track(payload, banner)) return;
      const bannerOrigin = deps.origin();
      banner.on("click", () => {
        if (!deps.banners.dismiss(payload.id, banner)) return;
        // A route of the previous server means nothing on the current one.
        deps.revealTarget(bannerOrigin === deps.origin() ? payload.target : null);
      });
      banner.on("show", () => deps.setBannersAvailable(true));
      banner.on("close", () => deps.banners.forget(payload.id, banner));
      banner.on("failed", () => {
        if (deps.banners.forget(payload.id, banner)) deps.setBannersAvailable(false);
      });
      banner.show();
    },
    "minddy:notification:dismiss": (_event, id) => {
      deps.banners.dismiss(id);
    },
    "minddy:linux-background:get": () => deps.linuxBackgroundState(),
    "minddy:linux-background:set": (_event, enabled) => {
      if (!linuxSession()) return null;
      deps.setLinuxBackground(enabled);
      return deps.linuxBackgroundState();
    },
    "minddy:linux-background:changed": {
      ready: ({ sender }) => {
        const state = deps.linuxBackgroundState();
        if (state) sendDesktopEvent(sender, "minddy:linux-background:changed", state);
      },
    },
  };
}

interface PushDependencies {
  capabilities: () => DesktopNotificationCapabilities;
  /** The person's opt-in, kept across launches (push-installation-store.ts). */
  allowPush: () => Promise<void>;
  pushAllowed: () => Promise<boolean>;
  /** Saves the opt-out first, then runs the native cleanup. */
  disablePush: (unregister: () => void | Promise<unknown>) => Promise<void>;
  installationId: () => Promise<string>;
  registerApns: () => Promise<string>;
  unregisterApns: () => void;
  /** A WNS channel URI from the native helper, `null` when it has none. */
  requestWnsChannel: () => Promise<string | null>;
  unregisterWns: () => Promise<unknown>;
  openExternal: (url: string) => void;
}

type PushChannel = "minddy:push:register" | "minddy:push:unregister" | "minddy:push:open-settings";

/** Native push, which reaches the person while the app is closed (APNs on macOS, WNS on Windows). */
export function pushHandlers<E>(deps: PushDependencies): Pick<DesktopIpcHandlers<E>, PushChannel> {
  // One request per transport at a time, shared between site mounts. A
  // failed request is forgotten so the next mount asks again; each new
  // process still obtains a fresh WNS URI.
  let apnsRegistration: Promise<string> | null = null;
  let wnsRegistration: Promise<string | null> | null = null;
  return {
    "minddy:push:register": async (_event, { activate }): Promise<DesktopNativePushRegistration | null> => {
      const transport = deps.capabilities().backgroundTransport;
      if (transport === null) return null;
      try {
        if (activate) await deps.allowPush();
        else if (!(await deps.pushAllowed())) return null;
        const installationId = await deps.installationId();
        if (transport === "wns") {
          wnsRegistration ??= deps.requestWnsChannel();
          const channelUri = await wnsRegistration;
          if (!channelUri) wnsRegistration = null;
          return channelUri ? { transport, endpoint: channelUri, installationId } : null;
        }
        apnsRegistration ??= deps.registerApns();
        const token = await apnsRegistration;
        return { transport, endpoint: `apns:${token}`, installationId };
      } catch {
        apnsRegistration = null;
        wnsRegistration = null;
        console.error("[push] native_registration_failed");
        return null;
      }
    },
    "minddy:push:unregister": async () => {
      const transport = deps.capabilities().backgroundTransport;
      if (transport === "apns") {
        apnsRegistration = null;
        await deps.disablePush(deps.unregisterApns);
      } else if (transport === "wns") {
        wnsRegistration = null;
        await deps.disablePush(deps.unregisterWns);
      }
    },
    // The main process builds the system destination itself; no URL from
    // the page travels on this channel.
    "minddy:push:open-settings": () => {
      const settings = deps.capabilities().settings;
      if (settings === "macos") deps.openExternal(nativeNotificationSettingsUrl(DESKTOP_BUNDLE_ID));
      else if (settings === "windows") deps.openExternal("ms-settings:notifications");
    },
  };
}

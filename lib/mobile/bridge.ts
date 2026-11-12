/**
 * The bridge between the web app and the native mobile shell (MIN-907).
 *
 * The mobile app is a Capacitor shell (`mobile/`) whose WebView loads the
 * product from the selected server, like the desktop window does. Capacitor
 * injects `window.Capacitor` into every document of that WebView, and the
 * shell registers one plugin of its own, `MinddyShell`
 * (`mobile/ios/App/App/MinddyShellPlugin.swift`). This module is the only
 * place the web app reads either, so the app has no dependency on
 * `@capacitor/core`.
 *
 * Detection relies on the injected object, never on the user agent: the
 * `minddy-mobile/…` suffix is there for server logs and device labels.
 */

export type MobilePlatform = "ios" | "android";

export interface MobileShellState {
  /** The origin the shell loads the product from. */
  origin: string;
  /** minddy Cloud's origin, the default. */
  cloudOrigin: string;
  /** True when `origin` is a server the user entered. */
  isCustomServer: boolean;
  /** The shell's marketing version, e.g. `0.40.0`. */
  version: string;
  /** The radius of the screen's corners in CSS pixels; 0 or absent when unknown. */
  cornerRadius?: number;
}

/**
 * The shell's own plugin. `connect` and `useCloud` answer only the pages
 * bundled in the app (the server choice and the offline screen): a page
 * served by any server, Cloud included, cannot repoint the app.
 */
export interface MobileShellPlugin {
  state(): Promise<MobileShellState>;
  /** Stores a validated server origin and loads it. */
  connect(options: { origin: string }): Promise<{ error?: "serverInvalid" }>;
  /** Returns to minddy Cloud and loads it. */
  useCloud(): Promise<void>;
  /** Shows the bundled server-choice page. */
  openServerPicker(): Promise<void>;
  /** Loads the selected server again, e.g. from the offline screen. */
  reload(): Promise<void>;
  /**
   * Tells the shell which theme the product shows, so the status bar and the
   * native bar follow it rather than the system's. Absent in older shells.
   */
  setAppearance?(options: { dark: boolean }): Promise<void>;
  /**
   * Opens `url` in the system's sign-in sheet (`ASWebAuthenticationSession`)
   * and resolves with the first URL of `callbackScheme` it reaches, or
   * without `url` when the person closes the sheet. See
   * `lib/mobile/auth-session.ts`. Absent in older shells.
   */
  authenticate?(options: { url: string; callbackScheme: string }): Promise<{ url?: string }>;
  /**
   * Signs in with Apple in the system sheet. Resolves without
   * `identityToken` when the person closes it. See
   * `lib/apple-sign-in.ts`. Absent in older shells.
   */
  signInWithApple?(): Promise<MobileAppleCredential>;
  /** The notification permission, without asking. Absent in older shells. */
  pushPermission?(): Promise<{ permission: NotificationPermission }>;
  /**
   * Registers with APNs and resolves with what the server stores. With
   * `activate`, called from the person's gesture, it first shows iOS's
   * prompt when they have not answered yet; without it, it only renews an
   * allowed token. Resolves with `permission` alone when there is no token.
   * See `lib/push/client.ts`. Absent in older shells.
   */
  registerForPushNotifications?(options?: {
    activate?: boolean;
  }): Promise<MobilePushRegistration>;
  /** Stops this installation's notifications at the APNs level. */
  unregisterForPushNotifications?(): Promise<void>;
  /** Opens minddy's notification settings in the Settings app. */
  openNotificationSettings?(): Promise<void>;
  /**
   * Describes the page's bottom bar for the shell to draw natively: see
   * `lib/mobile/native-navigation.ts`. Absent in older shells.
   */
  setNavigationBar?(options: MobileNavigationBarState): Promise<void>;
  /**
   * A notification was tapped or a universal link followed while a page of
   * the server is on screen: the page opens `path` itself, in place. See
   * `lib/mobile/open-path.ts`. Absent in older shells.
   */
  addListener?(
    event: "openPath",
    handler: (request: { path: string }) => void,
  ): MobileListenerHandle | Promise<MobileListenerHandle>;
  /**
   * The software keyboard starts to move. Sent before it moves, where the
   * WebView reports it only once it has stopped. Absent in older shells.
   */
  addListener?(
    event: "keyboard",
    handler: (keyboard: MobileKeyboardMove) => void,
  ): MobileListenerHandle | Promise<MobileListenerHandle>;
  /**
   * The app moved to another display or another size of it: iPhone Duo
   * shows it on its outer display folded and on its inner one open, each
   * with its own corners. Absent in older shells.
   */
  addListener?(
    event: "display",
    handler: (display: { cornerRadius: number }) => void,
  ): MobileListenerHandle | Promise<MobileListenerHandle>;
  // Last: `bind` keeps the last signature (lib/mobile/native-navigation.ts).
  /** A tap on the native bar carries the identifier of its item. */
  addListener?(
    event: "navigationAction",
    handler: (action: { id: string }) => void,
  ): MobileListenerHandle | Promise<MobileListenerHandle>;
}

/** What the shell's push registration returns: a token only when allowed. */
export interface MobilePushRegistration {
  permission: NotificationPermission;
  transport?: "apns";
  /** `apns:` followed by the hexadecimal device token. */
  endpoint?: string;
  /** Links a token to the one it replaces on the server. */
  installationId?: string;
  platform?: "ios";
  /** The APNs gateway of this build: `sandbox` for development builds. */
  environment?: "production" | "sandbox";
}

/** What the native Sign in with Apple sheet returns. */
export interface MobileAppleCredential {
  /** Apple's identity token, a JWT whose `nonce` claim is the SHA-256 of `nonce`. */
  identityToken?: string;
  /** The raw nonce the token was issued for, which Supabase hashes to compare. */
  nonce?: string;
  /** A one-time code, valid five minutes, that the server exchanges for a revocable token. */
  authorizationCode?: string;
  /** The person's name, given on the first authorization only. */
  fullName?: string;
}

export interface MobileKeyboardMove {
  /** What the keyboard will cover at the bottom of the page once it stops, in CSS pixels; 0 when it leaves. */
  height: number;
  /** How long the movement lasts, in milliseconds. */
  duration: number;
}

export interface MobileListenerHandle {
  remove(): Promise<void> | void;
}

export interface MobileNavigationItem {
  /** `menu`, `search`, `inbox`, `assistant` or `create`. */
  id: string;
  /** The accessible name of the web button it stands for. */
  label: string;
  /** Something is waiting behind this item. */
  badge: boolean;
  /** The web button's own icon: a base64 PNG, black on transparent. */
  icon?: string;
  /** Pixels per point in `icon`. */
  iconScale?: number;
  /** False for a picture, which keeps its own colors. */
  iconTinted?: boolean;
}

export interface MobileNavigationBarState {
  visible: boolean;
  /** The bar's place in the viewport, in CSS pixels. It may reach past an edge. */
  frame?: { x: number; y: number; width: number; height: number };
  /** Left out when the buttons have not changed since the last call. */
  items?: MobileNavigationItem[];
}

export interface MobileBridge {
  platform: MobilePlatform;
  /** Absent in a Capacitor WebView that is not minddy's shell. */
  shell: MobileShellPlugin | null;
}

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  Plugins?: { MinddyShell?: MobileShellPlugin };
}

declare global {
  interface Window {
    Capacitor?: CapacitorGlobal;
  }
}

export function getMobileBridge(): MobileBridge | null {
  if (typeof window === "undefined") return null;
  const capacitor = window.Capacitor;
  if (!capacitor?.isNativePlatform?.()) return null;
  const platform = capacitor.getPlatform?.();
  if (platform !== "ios" && platform !== "android") return null;
  return { platform, shell: capacitor.Plugins?.MinddyShell ?? null };
}

/** True inside the native iOS or Android app. */
export function isNativeMobile(): boolean {
  return getMobileBridge() !== null;
}

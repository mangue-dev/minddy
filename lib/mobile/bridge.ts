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
   * Describes the page's bottom bar for the shell to draw natively: see
   * `lib/mobile/native-navigation.ts`. Absent in older shells.
   */
  setNavigationBar?(options: MobileNavigationBarState): Promise<void>;
  /**
   * The software keyboard starts to move. Sent before it moves, where the
   * WebView reports it only once it has stopped. Absent in older shells.
   */
  addListener?(
    event: "keyboard",
    handler: (keyboard: MobileKeyboardMove) => void,
  ): MobileListenerHandle | Promise<MobileListenerHandle>;
  // Last: `bind` keeps the last signature (lib/mobile/native-navigation.ts).
  /** A tap on the native bar carries the identifier of its item. */
  addListener?(
    event: "navigationAction",
    handler: (action: { id: string }) => void,
  ): MobileListenerHandle | Promise<MobileListenerHandle>;
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
  /** `home`, `assistant`, `search`, `create` or `menu`. */
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

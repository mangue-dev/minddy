export const APP_LAYOUT_POLICY = {
  desktopMinWidth: 1024,
  portraitDesktopMinWidth: 1200,
  phoneMaxShortSide: 600,
} as const;

export type AppLayoutInput = {
  width: number;
  height: number;
  narrow?: boolean;
  touch: boolean;
  screenWidth: number;
  screenHeight: number;
  orientation: "portrait" | "landscape" | null;
};
type AppLayoutPolicy = typeof APP_LAYOUT_POLICY;

/** Self-contained so the same decision can run before React hydrates. */
export function resolveMobileLayout(input: AppLayoutInput, policy: AppLayoutPolicy): boolean {
  if (input.narrow ?? (input.width < policy.desktopMinWidth)) return true;
  if (!input.touch) return false;
  const shortSide = Math.min(input.screenWidth, input.screenHeight);
  if (shortSide > 0 && shortSide < policy.phoneMaxShortSide) return true;
  const portrait = input.orientation === null
    ? (input.screenWidth > 0 && input.screenHeight > 0
        ? input.screenHeight >= input.screenWidth
        : input.height >= input.width)
    : input.orientation === "portrait";
  return portrait && input.width < policy.portraitDesktopMinWidth;
}

/** Screen orientation stays stable when the software keyboard shrinks the viewport. */
export function readAppLayoutInput(policy: AppLayoutPolicy): AppLayoutInput {
  const screen = window.screen;
  const type = screen?.orientation?.type;
  const legacy = (window as Window & { orientation?: number }).orientation;
  const orientation = type
    ? (type.startsWith("portrait") ? "portrait" : "landscape")
    : typeof legacy === "number"
      ? (Math.abs(legacy) === 90 ? "landscape" : "portrait")
      : null;
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    narrow: window.matchMedia?.(`(max-width: ${policy.desktopMinWidth - 1}px)`).matches,
    touch: (navigator.maxTouchPoints ?? 0) > 0 || window.matchMedia?.("(any-pointer: coarse)").matches === true,
    screenWidth: screen?.width ?? 0,
    screenHeight: screen?.height ?? 0,
    orientation,
  };
}

export const MOBILE_LAYOUT_QUERY = `(max-width: ${APP_LAYOUT_POLICY.desktopMinWidth - 1}px)`;
export const COMPACT_DESKTOP_QUERY = `(max-width: ${APP_LAYOUT_POLICY.portraitDesktopMinWidth - 1}px)`;

export function isMobileLayout(): boolean {
  return resolveMobileLayout(readAppLayoutInput(APP_LAYOUT_POLICY), APP_LAYOUT_POLICY);
}

const subscribers = new Set<() => void>();
let stopListening: (() => void) | undefined;
function publish() {
  document.documentElement.dataset.appLayout = isMobileLayout() ? "mobile" : "desktop";
  subscribers.forEach((notify) => notify());
}

/** One observer keeps CSS and all React consumers in sync during rotation and resizing. */
export function subscribeAppLayout(notify: () => void) {
  subscribers.add(notify);
  if (!stopListening) {
    const narrow = window.matchMedia?.(MOBILE_LAYOUT_QUERY);
    const coarse = window.matchMedia?.("(any-pointer: coarse)");
    const orientation = window.screen?.orientation;
    window.addEventListener("resize", publish);
    window.addEventListener("orientationchange", publish);
    orientation?.addEventListener?.("change", publish);
    narrow?.addEventListener?.("change", publish);
    coarse?.addEventListener?.("change", publish);
    stopListening = () => {
      window.removeEventListener("resize", publish);
      window.removeEventListener("orientationchange", publish);
      orientation?.removeEventListener?.("change", publish);
      narrow?.removeEventListener?.("change", publish);
      coarse?.removeEventListener?.("change", publish);
    };
    publish();
  }
  return () => {
    subscribers.delete(notify);
    if (subscribers.size === 0) {
      stopListening?.();
      stopListening = undefined;
    }
  };
}

/** The serialized functions have no module dependencies or user-controlled input. */
export function buildAppLayoutScript(): string {
  return `(function(){var p=${JSON.stringify(APP_LAYOUT_POLICY)};document.documentElement.dataset.appLayout=(${resolveMobileLayout.toString()})((${readAppLayoutInput.toString()})(p),p)?"mobile":"desktop";})();`;
}

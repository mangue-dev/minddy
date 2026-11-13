import type { MobileNavigationBarState, MobileNavigationItem, MobileShellPlugin } from "@/lib/mobile/bridge";

/**
 * The bottom bar, drawn natively in the mobile app (MIN-907).
 *
 * The page keeps its own bar: same place, same buttons, made invisible by CSS
 * (`data-native-navigation`, app/globals.css). The shell draws a Liquid Glass
 * bar exactly over it and sends each tap back here, where it clicks the web
 * button of the same slot. The web bar therefore stays the single owner of
 * what each button does, of its icons, and of when and where the bar shows.
 *
 * A native view sits above the whole page, sheets and dialogs included, so the
 * shell must be told when something covers the bar. Rather than list every
 * overlay of the product, this asks the browser what is on top of the bar:
 * when it is not the bar, the native one hides.
 */

/** Attribute changes that can move, cover or relabel the bar. */
const WATCHED_ATTRIBUTES = [
  "class",
  "style",
  "hidden",
  "inert",
  "open",
  "data-state",
  "data-typing",
  "data-nav-badge",
  "aria-label",
  "aria-hidden",
];

/** The page the bar belongs to, shortened for the keyboard. */
const PAGE = ".app-shell";

/** How long the bar is followed frame by frame once a transition starts. */
const FOLLOW_MS = 600;

/** Pixels drawn per CSS pixel in the icons sent to the shell. */
const ICON_SCALE = 3;

/**
 * The icon of a slot as a base64 PNG, `null` when it cannot be drawn (the
 * shell then falls back to a symbol of its own), `undefined` while it is being
 * drawn.
 */
export type IconSource = (icon: SVGElement | HTMLImageElement) => string | null | undefined;

/** What the shell should draw for the bar `nav` right now. */
export function readNavigationBar(nav: HTMLElement, iconOf: IconSource = () => null): MobileNavigationBarState {
  const pill = nav.firstElementChild;
  if (!(pill instanceof HTMLElement)) return { visible: false };

  const rect = pill.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return { visible: false };

  const view = nav.ownerDocument.defaultView;
  if (!view) return { visible: false };
  // The part of the bar inside the screen. None left: nothing to draw.
  const left = Math.max(rect.left, 0);
  const right = Math.min(rect.right, view.innerWidth);
  const top = Math.max(rect.top, 0);
  const bottom = Math.min(rect.bottom, view.innerHeight);
  if (right - left < 1 || bottom - top < 1) return { visible: false };

  // A sheet, a dialog or a full-screen panel is on top of the bar.
  const centerY = (top + bottom) / 2;
  const hit = nav.ownerDocument.elementFromPoint((left + right) / 2, centerY);
  if (!hit || !nav.contains(hit)) {
    // The page the bar belongs to is shortened while the keyboard is up
    // (app/globals.css) and clips the bar, which stays at the screen's foot,
    // under the keyboard. With no sheet over the page, the bar is still
    // there: drawn under the keyboard, it shows as the keyboard leaves, as a
    // native tab bar does, instead of once the page has grown back.
    const page = nav.closest(PAGE);
    const clipped = page !== null && centerY > page.getBoundingClientRect().bottom;
    if (!clipped || nav.ownerDocument.documentElement.hasAttribute("data-mobile-surface")) return { visible: false };
  }

  const items: MobileNavigationItem[] = [];
  for (const slot of pill.querySelectorAll<HTMLElement>("[data-nav-slot]")) {
    const drawing = slot.querySelector<SVGElement | HTMLImageElement>("svg, img");
    const icon = drawing ? iconOf(drawing) : null;
    // One icon is still being drawn: show the bar whole, a frame later.
    if (icon === undefined) return { visible: false };
    items.push({
      id: slot.dataset.navSlot ?? "",
      label: slot.getAttribute("aria-label") ?? "",
      badge: slot.hasAttribute("data-nav-badge"),
      // A line icon takes the bar's color; a picture keeps its own.
      ...(icon ? { icon, iconScale: ICON_SCALE, iconTinted: !(drawing instanceof HTMLImageElement) } : {}),
    });
  }
  if (items.length === 0) return { visible: false };

  return {
    visible: true,
    frame: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
    items,
  };
}

/**
 * Draws a slot's icon into a PNG for the shell: iOS has no way to render SVG
 * markup at run time. An inline SVG is drawn in black, for the shell to tint;
 * a picture is drawn as it is, in a disc.
 */
export async function rasterizeIcon(icon: SVGElement | HTMLImageElement): Promise<string | null> {
  const box = icon.getBoundingClientRect();
  const width = Math.round(box.width) || 22;
  const height = Math.round(box.height) || 22;
  const picture = icon instanceof HTMLImageElement;

  const image = new Image();
  if (picture) {
    // An avatar served from another origin must allow this read, or the
    // canvas refuses to export and the shell uses its own symbol.
    if (!icon.src.startsWith("data:")) image.crossOrigin = "anonymous";
    image.src = icon.currentSrc || icon.src;
  } else {
    const clone = icon.cloneNode(true) as SVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", String(width));
    clone.setAttribute("height", String(height));
    clone.removeAttribute("class");
    // `currentColor` resolves against the icon's own root once it stands alone.
    clone.style.color = "#000";
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(clone))}`;
  }
  await image.decode();

  const canvas = icon.ownerDocument.createElement("canvas");
  canvas.width = width * ICON_SCALE;
  canvas.height = height * ICON_SCALE;
  const context = canvas.getContext("2d");
  if (!context) return null;
  if (picture) {
    context.beginPath();
    context.arc(canvas.width / 2, canvas.height / 2, Math.min(canvas.width, canvas.height) / 2, 0, Math.PI * 2);
    context.clip();
  }
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png").split(",")[1] ?? null;
}

/**
 * Keeps the shell's bar in step with `nav` until the returned function is
 * called. Returns `null` when the shell cannot draw the bar, and the web bar
 * then stays visible.
 */
export function syncNativeNavigationBar(
  nav: HTMLElement,
  shell: MobileShellPlugin,
  rasterize: (icon: SVGElement | HTMLImageElement) => Promise<string | null> = rasterizeIcon,
): (() => void) | null {
  const setNavigationBar = shell.setNavigationBar?.bind(shell);
  const addListener = shell.addListener?.bind(shell);
  if (!setNavigationBar || !addListener) return null;

  const view = nav.ownerDocument.defaultView;
  if (!view) return null;
  const root = nav.ownerDocument.documentElement;
  root.setAttribute("data-native-navigation", "");

  let stopped = false;
  let frame = 0;
  let followUntil = 0;
  // The shell starts without a bar: a first "hidden" would tell it nothing.
  let lastFrame = JSON.stringify({ visible: false });
  let lastItems = "";

  // Icons are drawn once per drawing, keyed by their markup.
  const icons = new Map<string, string | null | undefined>();
  const iconOf: IconSource = (icon) => {
    const key = icon.outerHTML;
    if (icons.has(key)) return icons.get(key);
    icons.set(key, undefined);
    rasterize(icon)
      .catch(() => null)
      .then((icon) => {
        icons.set(key, icon);
        if (!stopped) schedule();
      });
    return undefined;
  };

  const send = (state: MobileNavigationBarState) => {
    const { items, ...placement } = state;
    const frameKey = JSON.stringify(placement);
    const itemsKey = items ? JSON.stringify(items) : lastItems;
    if (frameKey === lastFrame && itemsKey === lastItems) return;
    // The icons travel only when the buttons change, not with every frame of
    // a slide.
    const payload = itemsKey === lastItems ? placement : state;
    lastFrame = frameKey;
    lastItems = itemsKey;
    setNavigationBar(payload).catch(() => {});
  };
  const measure = () => {
    frame = 0;
    send(readNavigationBar(nav, iconOf));
    if (view.performance.now() < followUntil) schedule();
  };
  // Many mutations in one frame are one measurement.
  function schedule() {
    if (!frame) frame = view!.requestAnimationFrame(measure);
  }
  // A CSS transition moves or covers the bar without touching the DOM (a
  // sheet sliding in): follow it frame by frame while it runs.
  const follow = () => {
    followUntil = view.performance.now() + FOLLOW_MS;
    schedule();
  };

  const observer = new MutationObserver(schedule);
  observer.observe(nav.ownerDocument.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: WATCHED_ATTRIBUTES,
  });
  const settled = ["transitionend", "animationend"] as const;
  // A resize too: iPhone Duo folding or unfolding resizes the window before
  // the page has laid the bar out again, and a single measurement then found
  // it off the screen and hid it for good.
  const started = ["resize", "transitionrun", "animationstart"] as const;
  for (const event of settled) view.addEventListener(event, schedule, true);
  for (const event of started) view.addEventListener(event, follow, true);
  view.visualViewport?.addEventListener("resize", schedule);
  // Turning the device half a turn keeps the window's size, so no resize
  // comes, yet the bar may change sides (lib/mobile/side-chrome.ts).
  view.screen.orientation?.addEventListener("change", follow);
  schedule();

  const handle = addListener("navigationAction", ({ id }) => {
    for (const slot of nav.querySelectorAll<HTMLElement>("[data-nav-slot]")) {
      if (slot.dataset.navSlot === id) slot.click();
    }
  });

  return () => {
    stopped = true;
    observer.disconnect();
    for (const event of settled) view.removeEventListener(event, schedule, true);
    for (const event of started) view.removeEventListener(event, follow, true);
    view.visualViewport?.removeEventListener("resize", schedule);
    view.screen.orientation?.removeEventListener("change", follow);
    if (frame) view.cancelAnimationFrame(frame);
    root.removeAttribute("data-native-navigation");
    void Promise.resolve(handle).then((listener) => listener.remove(), () => {});
    setNavigationBar({ visible: false }).catch(() => {});
  };
}

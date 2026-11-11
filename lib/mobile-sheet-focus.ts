import { isMobileLayout } from "@/lib/app-layout";
import { isNativeMobile } from "@/lib/mobile/bridge";

/** Automatic text focus opens the software keyboard before a sheet settles. */
export function allowInputAutoFocus() {
  return typeof window !== "undefined" && !isMobileLayout();
}

/**
 * Move modal focus into the sheet without opening the software keyboard.
 * A sheet whose caller already focused one of its own fields keeps it: that
 * caller asked for the keyboard (the command palette's search field).
 */
export function focusMobileSheet(event: Event) {
  event.preventDefault();
  if (!(event.target instanceof HTMLElement)) return;
  const active = document.activeElement;
  if (active instanceof HTMLElement && active !== event.target && event.target.contains(active)) return;
  event.target.focus({ preventScroll: true });
}

/** How long the stand-in field waits for the surface that takes its keyboard. */
const PRIMED_KEYBOARD_MS = 1000;

/**
 * iOS raises the software keyboard only for a focus given during the tap
 * itself, and a sheet focuses its field once it has mounted, after the tap.
 * Called from the tap that opens such a sheet, this focuses an invisible
 * stand-in field at once: the keyboard is already up when the sheet moves
 * the focus to its own field, and stays up. The stand-in removes itself when
 * it loses the focus, or after a second if nothing took it.
 *
 * `from` is the element tapped: inside a dialog the stand-in goes into that
 * dialog. Outside it, the dialog's focus trap pulled the focus back to the
 * dialog itself, which scrolled its content to the top.
 */
export function primeMobileKeyboard(from?: Element | null) {
  // The mobile app lets any focus raise the keyboard (mobile/README.md):
  // there the stand-in would only take the focus away for a moment.
  if (typeof document === "undefined" || !isMobileLayout() || isNativeMobile()) return;
  const field = document.createElement("input");
  field.type = "text";
  field.tabIndex = -1;
  field.setAttribute("aria-hidden", "true");
  field.setAttribute("data-keyboard-primer", "");
  // 16px keeps iOS from zooming; fixed at the top, it gives Safari nothing
  // to scroll to.
  field.style.cssText =
    "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;font-size:16px;pointer-events:none;";
  (from?.closest('[role="dialog"], [role="alertdialog"]') ?? document.body).append(field);
  const remove = () => {
    window.clearTimeout(timer);
    field.remove();
  };
  const timer = window.setTimeout(() => {
    if (document.activeElement === field) field.blur();
    remove();
  }, PRIMED_KEYBOARD_MS);
  field.addEventListener("blur", remove, { once: true });
  field.focus({ preventScroll: true });
}

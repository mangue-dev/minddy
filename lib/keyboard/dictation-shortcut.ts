import { isVisibleOverlay } from "@/lib/visible-overlays";

// Popovers also have role="dialog", but the recording popover must not take
// ownership away from the button that stops it.
const SURFACE_SELECTOR = '[role="dialog"], [role="alertdialog"]';

function isDictationSurface(element: Element): boolean {
  return !element.closest('[data-radix-popper-content-wrapper], [data-slot="popover-content"]');
}

type StackingContext = { element: Element; zIndex: number };

/** An inner z-index cannot escape the stacking context created by an ancestor. */
function stackingContexts(surface: Element): StackingContext[] {
  const contexts: StackingContext[] = [];
  for (let element: Element | null = surface; element; element = element.parentElement) {
    const style = getComputedStyle(element);
    const zIndex = Number.parseInt(style.zIndex, 10);
    const parentDisplay = element.parentElement ? getComputedStyle(element.parentElement).display : "";
    const positioned = !!style.position && style.position !== "static";
    const flexOrGridItem = /^(inline-)?(flex|grid)$/.test(parentDisplay);
    const visualContext = (["transform", "scale", "rotate", "translate", "filter", "backdropFilter", "perspective", "clipPath", "maskImage"] as const)
      .some((property) => !!style[property] && style[property] !== "none");
    if (style.position === "fixed" || style.position === "sticky" ||
        (Number.isFinite(zIndex) && (positioned || flexOrGridItem)) ||
        Number.parseFloat(style.opacity) < 1 || style.isolation === "isolate" ||
        (!!style.mixBlendMode && style.mixBlendMode !== "normal") || visualContext ||
        /\b(layout|paint|strict|content)\b/.test(style.contain) ||
        /\b(transform|opacity|filter|perspective|clip-path|mask)\b/.test(style.willChange)) {
      contexts.unshift({ element, zIndex: Number.isFinite(zIndex) && (positioned || flexOrGridItem) ? zIndex : 0 });
    }
  }
  return contexts;
}

function isAbove(
  candidate: Element,
  candidateContexts: StackingContext[],
  current: Element,
  currentContexts: StackingContext[],
): boolean {
  let index = 0;
  while (candidateContexts[index] && currentContexts[index] &&
         candidateContexts[index].element === currentContexts[index].element) index++;
  const candidateContext = candidateContexts[index];
  const currentContext = currentContexts[index];
  const difference = (candidateContext?.zIndex ?? 0) - (currentContext?.zIndex ?? 0);
  if (difference !== 0) return difference > 0;

  // Equal sibling contexts paint in DOM order before their children are compared.
  // With no divergent contexts, use the dialog surfaces themselves as the tie-break.
  return !!((currentContext?.element ?? current).compareDocumentPosition(candidateContext?.element ?? candidate) &
    Node.DOCUMENT_POSITION_FOLLOWING);
}

/** Only the foremost visible dialog/panel may handle a dictation shortcut. */
export function ownsDictationShortcut(anchor: HTMLElement | null): boolean {
  if (!anchor?.isConnected) return false;
  const closestSurface = anchor.closest(SURFACE_SELECTOR);
  const surface = closestSurface && isDictationSurface(closestSurface) ? closestSurface : null;

  // hideWhenIdle deliberately hides the button; test its host instead so the
  // objective page can still start dictation while hidden retained tabs cannot.
  if (!anchor.parentElement || !isVisibleOverlay(anchor.parentElement)) return false;

  let foremost: Element | null = null;
  let foremostContexts: StackingContext[] = [];
  for (const candidate of anchor.ownerDocument.querySelectorAll(SURFACE_SELECTOR)) {
    if (!isDictationSurface(candidate) || candidate.getAttribute("data-state") === "closed" ||
        !isVisibleOverlay(candidate)) continue;
    const contexts = stackingContexts(candidate);
    if (!foremost || isAbove(candidate, contexts, foremost, foremostContexts)) {
      foremost = candidate;
      foremostContexts = contexts;
    }
  }
  return surface === foremost;
}

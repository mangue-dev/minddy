export const SIDEBAR_FILTER_RESULT_ATTRIBUTE = "data-sidebar-filter-result";

const SIDEBAR_FILTER_RESULT_SELECTOR =
  `[${SIDEBAR_FILTER_RESULT_ATTRIBUTE}]:not([disabled]):not([aria-disabled="true"])`;

/**
 * Move focus among the results owned by the active secondary-sidebar filter.
 * Results can live outside the sidebar itself (the inbox does this), so the
 * default search root is the whole document rather than the field's parent.
 */
export function moveSidebarFilterResultFocus({
  input,
  key,
  current = document.activeElement,
  root = document,
}: {
  input: HTMLInputElement;
  key: string;
  current?: Element | null;
  root?: ParentNode;
}): boolean {
  const currentResult = current?.closest<HTMLElement>(
    SIDEBAR_FILTER_RESULT_SELECTOR,
  );

  if (key === "Escape") {
    if (!currentResult) return false;
    input.focus({ preventScroll: true });
    return true;
  }
  if (key !== "ArrowDown" && key !== "ArrowUp") return false;
  if (current !== input && !currentResult) return false;

  const results = Array.from(
    root.querySelectorAll<HTMLElement>(SIDEBAR_FILTER_RESULT_SELECTOR),
  ).filter((result) => !result.closest('[hidden], [aria-hidden="true"]'));
  if (results.length === 0) return false;

  const currentIndex = currentResult ? results.indexOf(currentResult) : -1;
  const nextIndex =
    currentIndex === -1
      ? key === "ArrowDown"
        ? 0
        : results.length - 1
      : key === "ArrowDown"
        ? (currentIndex + 1) % results.length
        : (currentIndex - 1 + results.length) % results.length;
  const next = results[nextIndex];
  next.focus({ preventScroll: true });
  next.scrollIntoView({ block: "nearest" });
  return true;
}

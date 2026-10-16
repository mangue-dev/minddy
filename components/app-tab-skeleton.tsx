/** Widths of the placeholder tabs, close to real tab widths in the strip. */
const PLACEHOLDER_WIDTHS = [200, 164, 140];

/**
 * Placeholder tabs shown in the top bar while the first tab list loads. Muted
 * tab shapes shimmer where the real tabs will land (`.app-tab-skeleton` in
 * globals.css), so the bar keeps its shape instead of showing a spinner.
 */
export function AppTabSkeleton({ label }: { label: string }) {
  return <div role="status" aria-label={label} data-app-tab-skeleton className="flex items-center gap-1">
    {PLACEHOLDER_WIDTHS.map((width) =>
      <div key={width} aria-hidden className="app-tab-skeleton h-[34px] shrink-0 rounded-md" style={{ width }} />)}
  </div>;
}

/** Shared color marker for categories and database options. */
export function Dot({ color }: { color: string | null | undefined }) {
  return (
    <span
      className="size-2.5 shrink-0 rounded-full"
      style={{ backgroundColor: color ?? "var(--muted-foreground)" }}
      aria-hidden
    />
  );
}

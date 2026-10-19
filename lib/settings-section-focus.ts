/**
 * One-shot hand-off of a settings section to a tab opened with ⌘T (MIN-737).
 *
 * `?section=` names the settings card or row to scroll to and highlight, and
 * the settings screen consumes it on arrival. App tabs deliberately do not
 * persist it (a restored tab must not replay the highlight), so a tab created
 * from the new-tab palette opens on the right settings tab without it. The
 * palette queues the section here instead, and the settings screen takes it
 * once when it mounts. The queue expires so a tab that never reaches the
 * settings screen cannot highlight a card much later.
 */

/** Same name as `SETTINGS_SECTION_PARAM` in lib/settings-sections.ts, kept
 *  literal so the palette destination filter stays free of the catalog. */
export const ONE_SHOT_SECTION_PARAM = "section";

const QUEUE_TTL_MS = 15_000;

let queued: { section: string; at: number } | null = null;

/** Queue the `?section=` of a palette destination, if it has one. */
export function queueSettingsSectionFocus(href: string | undefined): void {
  if (!href) return;
  const section = new URL(href, "https://minddy.invalid").searchParams.get(ONE_SHOT_SECTION_PARAM);
  queued = section ? { section, at: Date.now() } : null;
}

/** Take the queued section once; `null` when there is none or it expired. */
export function takeSettingsSectionFocus(): string | null {
  const current = queued;
  queued = null;
  if (!current || Date.now() - current.at > QUEUE_TTL_MS) return null;
  return current.section;
}

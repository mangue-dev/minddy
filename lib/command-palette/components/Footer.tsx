/**
 * Footer - Floating actions shortcut pill.
 *
 * No full-width footer anymore: just a small clickable pill anchored in the
 * bottom-right corner of the palette that surfaces the actions shortcut
 * (⌘/Ctrl + key) of the highlighted item — clicking it opens the actions
 * popover, which takes its place while open. Hidden on touch devices where
 * no keyboard exists.
 */

"use client";

import { Kbd } from "@/components/ui/kbd";
import { usePaletteConfig } from "../config";
import { isApplePlatform } from "../hooks/usePalette";
import styles from "../styles/Footer.module.css";

// =============================================================================
// TYPES
// =============================================================================

export interface FooterProps {
  /** Whether actions are available for the highlighted item. */
  hasActions?: boolean;
  /** Whether the palette is expanded (hidden while compact-collapsed). */
  isExpanded?: boolean;
  /** Whether we're on a touch device (no keyboard shortcuts). */
  isMobile?: boolean;
  /** Called when the pill is clicked (opens the actions popover). */
  onOpen?: () => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function Footer({
  hasActions = false,
  isExpanded = true,
  isMobile = false,
  onOpen,
}: FooterProps) {
  const { t, shortcuts } = usePaletteConfig();
  const actionsKbd = [isApplePlatform() ? "⌘" : "Ctrl", shortcuts.actionsKey.toUpperCase()];

  if (isMobile || !isExpanded || !hasActions) return null;

  return (
    <button type="button" className={styles.bubble} onClick={onOpen}>
      <span className={styles.keys}>
        {actionsKbd.map((key, i) => (
          <Kbd key={i}>
            {key}
          </Kbd>
        ))}
      </span>
      <span className={styles.label}>{t("footer.actions")}</span>
    </button>
  );
}

export default Footer;
/**
 * Footer - Keyboard shortcuts footer.
 *
 * Features:
 * - Optional logo slot on the left (config.footerLogo)
 * - Default-action hint (↵ + label) for the highlighted item
 * - Actions shortcut hint when the item has a submenu
 * - Simplified mobile version with swipe hint
 */

"use client";

import { usePaletteConfig } from "../config";
import { isApplePlatform } from "../hooks/usePalette";
import styles from "../styles/Footer.module.css";
import type { PaletteView } from "../store";

// =============================================================================
// TYPES
// =============================================================================

export interface FooterProps {
  /** Current view. */
  view: PaletteView;
  /** Whether we're on mobile. */
  isMobile?: boolean;
  /** Whether actions are available for the highlighted item. */
  hasActions?: boolean;
  /** Whether compact mode is enabled. */
  compactMode?: boolean;
  /** Whether the palette is expanded (for compact mode). */
  isExpanded?: boolean;
  /** Label of the default action (shown with the ↵ hint). */
  defaultActionLabel?: string;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function Footer({
  view,
  isMobile = false,
  hasActions = false,
  compactMode = false,
  isExpanded = true,
  defaultActionLabel,
}: FooterProps) {
  const { t, shortcuts, footerLogo } = usePaletteConfig();
  const actionsKbd = [isApplePlatform() ? "⌘" : "Ctrl", shortcuts.actionsKey.toUpperCase()];

  // Compact mode collapsed: show expand hint instead of actions
  const showExpandHint = compactMode && !isExpanded;

  // Mobile footer with optional swipe hint
  if (isMobile) {
    return (
      <div className={styles.footer}>
        <span className={styles.logo}>{footerLogo}</span>
        {showExpandHint ? (
          <div className={styles.hint}>
            <kbd className={styles.kbd}>↓</kbd>
            <span className={styles.label}>{t("footer.expand")}</span>
          </div>
        ) : view === "search" && hasActions ? (
          <span className={styles.mobileHint}>{t("footer.swipeForActions")}</span>
        ) : null}
      </div>
    );
  }

  const showActionsHint = view === "search" && hasActions && !showExpandHint;
  const showDefaultActionHint = view === "search" && defaultActionLabel && !showExpandHint;

  return (
    <div className={styles.footer}>
      <span className={styles.logo}>{footerLogo}</span>
      <div className={styles.hints}>
        {showExpandHint ? (
          <div className={styles.hint}>
            <kbd className={styles.kbd}>↓</kbd>
            <span className={styles.label}>{t("footer.expand")}</span>
          </div>
        ) : (
          <>
            {showDefaultActionHint && (
              <div className={styles.hint}>
                <kbd className={styles.kbd}>↵</kbd>
                <span className={styles.label}>{defaultActionLabel}</span>
              </div>
            )}
            {showDefaultActionHint && showActionsHint && (
              <div className={styles.separator} />
            )}
            {showActionsHint && (
              <div className={styles.hint}>
                <span className={styles.keys}>
                  {actionsKbd.map((key, i) => (
                    <kbd key={i} className={styles.kbd}>
                      {key}
                    </kbd>
                  ))}
                </span>
                <span className={styles.label}>{t("footer.actions")}</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default Footer;

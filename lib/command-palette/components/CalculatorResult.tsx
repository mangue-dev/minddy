/**
 * CalculatorResult - Dedicated calculator result display.
 *
 * Features:
 * - Large, prominent result display (Raycast-inspired)
 * - Shows the expression itself while it is incomplete
 * - Hints for calculator capabilities when the expression is incomplete
 */

"use client";

import React, { useCallback } from "react";
import { usePaletteConfig } from "../config";
import type { CalculationResult } from "../calculator/types";
import type { TranslateFn } from "../i18n";
import styles from "../styles/CalculatorResult.module.css";

// =============================================================================
// TYPES
// =============================================================================

export interface CalculatorResultProps {
  /** Original query/expression. */
  query: string;
  /** Calculation result (null if expression is incomplete). */
  result: CalculationResult | null;
  /** Whether this item is currently highlighted. */
  isActive: boolean;
  /** Called when item is selected (Enter). */
  onSelect: () => void;
  /** Called when actions should be opened (→ key). */
  onOpenActions?: () => void;
  /** Whether this item has contextual actions. */
  hasActions: boolean;
  /** Whether we're on mobile. */
  isMobile?: boolean;
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Display value: the formatted result, or the raw expression while it is
 * incomplete ("pending result" effect).
 */
function getDisplayValue(query: string, result: CalculationResult | null): string {
  if (!result?.success) {
    return query;
  }
  return result.formatted || String(result.result);
}

/**
 * Hints for calculator capabilities based on what the user is typing.
 */
function getHints(query: string, t: TranslateFn): string[] {
  const hints: string[] = [];
  const lower = query.toLowerCase();

  if (/\d/.test(query) && /[+\-*/]/.test(query)) {
    hints.push(t("calculator.hints.math"));
  } else if (/\d/.test(query) && /[a-z]/i.test(query)) {
    hints.push(t("calculator.hints.conversion"));
    hints.push(t("calculator.hints.date"));
  } else if (/\d/.test(query)) {
    hints.push(t("calculator.hints.math"));
    hints.push(t("calculator.hints.conversion"));
  }

  if (/(ajd|today|demain|tomorrow|hier|yesterday)/i.test(lower)) {
    hints.length = 0;
    hints.push(t("calculator.hints.dateOps"));
  }

  if (/%/.test(query)) {
    hints.length = 0;
    hints.push(t("calculator.hints.percentage"));
  }

  return hints.slice(0, 2); // Max 2 hints
}

// =============================================================================
// COMPONENT
// =============================================================================

export function CalculatorResult({
  query,
  result,
  isActive,
  onSelect,
  onOpenActions,
  hasActions,
}: CalculatorResultProps) {
  const { t } = usePaletteConfig();
  const isValid = result?.success ?? false;
  const displayValue = getDisplayValue(query, result);
  const hints = !isValid ? getHints(query, t) : [];

  // Only select if the result is valid
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      if (isValid) {
        onSelect();
      }
    },
    [isValid, onSelect]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && isValid) {
        e.preventDefault();
        onSelect();
      } else if (e.key === "ArrowRight" && hasActions && onOpenActions && isValid) {
        e.preventDefault();
        onOpenActions();
      }
    },
    [isValid, onSelect, hasActions, onOpenActions]
  );

  return (
    <div
      role="option"
      aria-selected={isActive}
      tabIndex={isActive ? 0 : -1}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={`${styles.calculator} ${isActive ? styles.active : ""}`}
      data-testid="calculator-result"
    >
      <div className={styles.main}>
        {/* Result display */}
        <div className={styles.resultRow}>
          <span className={styles.equals}>=</span>
          <span className={styles.result}>{displayValue}</span>
        </div>

        {/* Hints when expression is incomplete */}
        {hints.length > 0 && (
          <div className={styles.hintsRow}>
            <span className={styles.hintsLabel}>{t("calculator.try")}</span>
            {hints.map((hint, i) => (
              <span key={i} className={styles.hint}>
                {hint}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default CalculatorResult;

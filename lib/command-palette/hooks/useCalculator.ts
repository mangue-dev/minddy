/**
 * useCalculator - React hook exposing the calculator with the palette's
 * locale configuration.
 */

import { useMemo } from "react";
import { usePaletteConfig } from "../config";
import { parseExpression, mightBeCalculation } from "../calculator/parser";
import type { CalculationResult, CalculatorLocaleConfig } from "../calculator/types";

export interface UseCalculatorResult {
  /** Parse and evaluate an expression. */
  calculate: (expression: string) => CalculationResult | null;
  /** Quick check if expression might be calculable. */
  mightBeCalculation: (expression: string) => boolean;
  /** Current locale configuration. */
  localeConfig: CalculatorLocaleConfig;
}

export function useCalculator(): UseCalculatorResult {
  const { calculatorLocale } = usePaletteConfig();

  return useMemo(
    () => ({
      calculate: (expression: string) => parseExpression(expression, calculatorLocale),
      mightBeCalculation: (expression: string) =>
        mightBeCalculation(expression, calculatorLocale),
      localeConfig: calculatorLocale,
    }),
    [calculatorLocale]
  );
}

export default useCalculator;

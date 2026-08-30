/** The only value accepted from the package-aware Windows helper. */
export interface WindowsStoreUpdateProbe {
  available: boolean;
}

/** Parse the helper's deliberately tiny JSON protocol. */
export function parseWindowsStoreUpdateProbe(
  output: string | null | undefined
): WindowsStoreUpdateProbe | null {
  if (!output?.trim()) return null;
  try {
    const value: unknown = JSON.parse(output);
    if (
      typeof value !== "object" ||
      value === null ||
      typeof (value as { available?: unknown }).available !== "boolean"
    ) {
      return null;
    }
    return { available: (value as { available: boolean }).available };
  } catch {
    return null;
  }
}


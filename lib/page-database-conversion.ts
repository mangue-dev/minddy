import type { DatabaseProperty, DatabaseValue } from "./page-databases";

/** A conversion preview is bound to the column settings and every source cell. */
export interface DatabaseConversionPreview {
  status: "preview";
  totalCount: number;
  incompatibleCount: number;
  token: string;
  /** Optional during rolling upgrades of the database function. */
  column?: DatabaseProperty;
  values?: Record<string, DatabaseValue>;
}

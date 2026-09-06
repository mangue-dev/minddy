/** A conversion preview is bound to the column settings and every source cell. */
export interface DatabaseConversionPreview {
  status: "preview";
  totalCount: number;
  incompatibleCount: number;
  token: string;
}

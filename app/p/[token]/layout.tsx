import type { ReactNode } from "react";
import { FullCatalogMessages } from "@/components/full-catalog-messages";

/**
 * Wiki page published for reading (MIN-283). Same reason as the layout
 * of the shared view: the root layout only broadcasts the four namespaces of the
 * marketing site (MIN-100), and this route goes up the REAL page editor —
 * placeholders, block menu, leaflet labels, image and file blocks.
 */
export default function PublicPageLayout({ children }: { children: ReactNode }) {
  return <FullCatalogMessages>{children}</FullCatalogMessages>;
}

import type { ReactNode } from "react";
import { FullCatalogMessages } from "@/components/full-catalog-messages";

/**
 * View shared by link (read-only board). This layout only exists for
 * serve it with the complete i18n catalog: the root layout only broadcasts the
 * four marketing site namespaces (MIN-100), and this page renders the real
 * board — statuses, priorities, fields, attachments, all fourteen namespaces on
 * its own.
 */
export default function PublicShareLayout({ children }: { children: ReactNode }) {
  return <FullCatalogMessages>{children}</FullCatalogMessages>;
}

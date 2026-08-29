import type { Metadata } from "next";
import { FullCatalogMessages } from "@/components/full-catalog-messages";

export const metadata: Metadata = {
  title: "Attachment debug gallery",
  description: "Temporary public gallery for attachment component review.",
  robots: { index: false, follow: false },
};

export default function AttachmentsDebugLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <FullCatalogMessages>{children}</FullCatalogMessages>;
}

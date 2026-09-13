import type { Metadata } from "next";
import { appPageMetadata } from "@/lib/app-metadata";

export function generateMetadata(): Promise<Metadata> {
  return appPageMetadata("agents");
}

export default function NumoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

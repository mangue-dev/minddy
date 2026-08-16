import type { Metadata } from "next";
import { appPageMetadata } from "@/lib/app-metadata";

export function generateMetadata(): Promise<Metadata> {
  return appPageMetadata("routines");
}

export default function RoutinesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

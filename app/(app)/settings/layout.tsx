import type { Metadata } from "next";
import { appPageMetadata } from "@/lib/app-metadata";

// Layout carrying metadata: the page is a CLIENT component and cannot
// therefore not export your own. Title and description come from the namespace
// `Meta` ; the `noindex` of the segment is set by `app/(app)/layout.tsx`.
export function generateMetadata(): Promise<Metadata> {
  return appPageMetadata("settings");
}

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

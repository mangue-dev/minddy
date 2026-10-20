import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { appPageMetadata } from "@/lib/app-metadata";

// The page never renders; it is named after where it leads.
export function generateMetadata(): Promise<Metadata> {
  return appPageMetadata("settings");
}

// Personal statistics moved into the profile (MIN-737). Links, bookmarks and
// restored tabs still land on them.
export default function StatisticsPage() {
  redirect("/settings?tab=profile");
}

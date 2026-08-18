import type { Metadata } from "next";
import { appPageMetadata } from "@/lib/app-metadata";

/**
 * `/reset-password` can only be reached via a single-use email link:
 * `noindex, nofollow` — there is nothing to index, and nothing to track.
 */
export async function generateMetadata(): Promise<Metadata> {
  return {
    ...(await appPageMetadata("resetPassword")),
    robots: { index: false, follow: false },
  };
}

export default function ResetPasswordLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

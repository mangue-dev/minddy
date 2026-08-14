import type { Metadata } from "next";
import { appPageMetadata } from "@/lib/app-metadata";

/**
 * `/reset-password` ne s'atteint que par un lien e-mail à usage unique :
 * `noindex, nofollow` — il n'y a rien à indexer, et rien à suivre.
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

import type { Metadata } from "next";
import { appPageMetadata } from "@/lib/app-metadata";

/**
 * `/forgot-password` is public (you must be able to request a link without
 * session) but has nothing to index: it is an e-mail field. `index: false,
 * follow: true`, like `/login` and `/signup` (MIN-88), and a `canonical` which
 * protects from its variant `?email=…`.
 */
export async function generateMetadata(): Promise<Metadata> {
  return {
    ...(await appPageMetadata("forgotPassword")),
    alternates: { canonical: "/forgot-password" },
    robots: { index: false, follow: true },
  };
}

export default function ForgotPasswordLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

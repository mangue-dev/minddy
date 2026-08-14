import type { Metadata } from "next";
import { appPageMetadata } from "@/lib/app-metadata";

/**
 * `/forgot-password` est publique (il faut bien pouvoir demander un lien sans
 * session) mais n'a rien à indexer : c'est un champ e-mail. `index: false,
 * follow: true`, comme `/login` et `/signup` (MIN-88), et un `canonical` qui la
 * protège de sa variante `?email=…`.
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

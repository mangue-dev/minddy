import type { Metadata } from "next";
import { appPageMetadata } from "@/lib/app-metadata";

// Layout porteur de métadonnées : la page est un composant CLIENT et ne peut
// donc pas exporter les siennes. Titre et description viennent du namespace
// `Meta` ; le `noindex` du segment est posé par `app/(app)/layout.tsx`.
export function generateMetadata(): Promise<Metadata> {
  return appPageMetadata("pullRequests");
}

export default function PullRequestsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

import type { Metadata } from "next";
import { appPageMetadata } from "@/lib/app-metadata";
import { projectName } from "@/lib/server/project-meta";
import { PagesShell } from "@/components/pages/pages-shell";

// « Pages · Acme · minddy » : sans le nom du projet, deux onglets ouverts sur
// deux projets portaient exactement le même titre. La lecture du nom est mise en
// cache et partagée avec le `generateMetadata` du layout parent.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return appPageMetadata("pages", await projectName(id));
}

/**
 * L'arbre est monté par le LAYOUT, et non par chaque page du segment : il ne se
 * remonte donc pas d'une page à l'autre — son état d'ouverture, son défilement
 * et sa requête traversent la navigation.
 */
export default function ProjectPagesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PagesShell>{children}</PagesShell>;
}

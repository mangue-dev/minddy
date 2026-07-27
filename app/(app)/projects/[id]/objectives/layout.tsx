import type { Metadata } from "next";
import { appPageMetadata } from "@/lib/app-metadata";
import { projectName } from "@/lib/server/project-meta";

// « Objectifs · Acme · minddy » : sans le nom du projet, deux onglets ouverts
// sur deux projets portaient exactement le même titre. La lecture du nom est
// mise en cache et partagée avec le `generateMetadata` du layout parent.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return appPageMetadata("objectives", await projectName(id));
}

export default function ObjectivesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

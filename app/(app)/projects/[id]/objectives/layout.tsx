import type { Metadata } from "next";
import { appPageMetadata } from "@/lib/app-metadata";
import { projectName } from "@/lib/server/project-meta";

// “Objectives · Acme · minddy”: without the project name, two tabs open
// on two projects had exactly the same title. Reading the name is
// cached and shared with the `generateMetadata` of the parent layout.
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

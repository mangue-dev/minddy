import type { Metadata } from "next";
import { appPageMetadata } from "@/lib/app-metadata";
import { projectName } from "@/lib/server/project-meta";

// Titles the project board (and any sub-page without its own layout) with the
// project's name, e.g. "Acme · minddy". Falls back to a generic localized label
// if the project can't be read (RLS, not found, transient error).
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const [meta, name] = await Promise.all([
    appPageMetadata("project"),
    projectName(id),
  ]);
  // Le tableau est LA page du projet : son nom suffit, sans le préfixer du
  // libellé générique. Les sous-pages, elles, gardent « Triage · Acme ».
  return name ? { ...meta, title: name } : meta;
}

export default function ProjectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

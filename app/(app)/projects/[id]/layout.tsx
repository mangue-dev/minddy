import type { Metadata } from "next";
import { appPageMetadata } from "@/lib/app-metadata";
import { notFound } from "next/navigation";
import { projectName } from "@/lib/server/project-meta";
import { resolveProjectSegment } from "@/lib/server/route-refs";
import { ProjectRouteProvider } from "@/lib/project-route-context";

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
  // The table is THE page of the project: its name is enough, without prefixing it with
  // generic wording. The subpages keep “Triage · Acme”.
  return name ? { ...meta, title: name } : meta;
}

/**
 * Resolves the readable segment (`min-3f2a9c81`, lib/app-urls.ts) to the
 * project id under the viewer's RLS, so every project page renders with it
 * from the server render on. A code that designates no visible project is a
 * 404; a legacy full id passes through without a read.
 */
export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const projectId = await resolveProjectSegment(id);
  if (!projectId) notFound();
  return <ProjectRouteProvider segment={id} projectId={projectId}>{children}</ProjectRouteProvider>;
}

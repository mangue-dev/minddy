import { Suspense } from "react";
import type { Metadata } from "next";
import { appPageMetadata } from "@/lib/app-metadata";
import { notFound } from "next/navigation";
import { projectName } from "@/lib/server/project-meta";
import { resolveProjectSegment } from "@/lib/server/route-refs";
import { ProjectRouteProvider } from "@/lib/project-route-context";
import { ProjectRouteLoading } from "@/components/project-route-loading";

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
 * not-found page; a legacy full id passes through without a read.
 *
 * The read streams behind the page's own skeleton: awaiting it here held the
 * whole document, scripts included, for one database round trip on every
 * project route (TTFB ~75 ms against ~18 ms elsewhere, MIN-875). Once the
 * document has started, an unknown code renders the not-found page with a
 * 200 status instead of a 404; these routes are behind sign-in and noindex.
 */
export default function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<ProjectRouteLoading />}>
      <ResolvedProjectRoute params={params}>{children}</ResolvedProjectRoute>
    </Suspense>
  );
}

async function ResolvedProjectRoute({
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

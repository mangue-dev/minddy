import type { Metadata } from "next";
import { appPageMetadata } from "@/lib/app-metadata";
import { projectName } from "@/lib/server/project-meta";
import { PagesShell } from "@/components/pages/pages-shell";

// “Pages · Acme · minddy”: without the project name, two tabs open on
// two projects had exactly the same title. The name reading is set to
// cache and shared with the `generateMetadata` of the parent layout.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return appPageMetadata("pages", await projectName(id));
}

/**
 * The tree is mounted by the LAYOUT, and not by each page of the segment: it is not
 * therefore does not go back from one page to another — its opening state, its scrolling
 * and its query cross the navigation.
 */
export default function ProjectPagesLayout({
  children: _children,
}: {
  children: React.ReactNode;
}) {
  return <PagesShell />;
}

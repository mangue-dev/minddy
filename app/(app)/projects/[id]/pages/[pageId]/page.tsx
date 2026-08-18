"use client";

import { useParams } from "next/navigation";

import { PageView } from "@/components/pages/page-view";

/** A wiki page, open (MIN-270). */
export default function ProjectPageDetail() {
  const { id: projectId, pageId } = useParams<{
    id: string;
    pageId: string;
  }>();

  // `key`: moving from one page to another SWIVELS the editor. tiptap does not reread
  // its `content` after editing, and there is no cursor or
  // cancellation stack to keep between two documents.
  return <PageView key={pageId} projectId={projectId} pageId={pageId} />;
}

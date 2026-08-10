"use client";

import { useParams } from "next/navigation";

import { PageView } from "@/components/pages/page-view";

/** Une page du wiki, ouverte (MIN-270). */
export default function ProjectPageDetail() {
  const { id: projectId, pageId } = useParams<{
    id: string;
    pageId: string;
  }>();

  // `key` : passer d'une page à l'autre REMONTE l'éditeur. tiptap ne relit pas
  // son `content` après le montage, et il n'y a de toute façon ni curseur ni
  // pile d'annulation à conserver entre deux documents.
  return <PageView key={pageId} projectId={projectId} pageId={pageId} />;
}

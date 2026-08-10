"use client";

import { useParams } from "next/navigation";

import { PagesTrash } from "@/components/pages/pages-trash";

/** La corbeille du wiki du projet (MIN-270), atteinte depuis le bas de l'arbre. */
export default function ProjectPagesTrashPage() {
  const { id: projectId } = useParams<{ id: string }>();
  return <PagesTrash projectId={projectId} />;
}

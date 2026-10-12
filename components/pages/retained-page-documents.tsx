"use client";

import { Activity, useState, type ReactNode } from "react";
import { retainPageDocuments } from "@/lib/retained-page-documents";

/** Preserve each validated editing basis while Activity suspends inactive effects. */
export function RetainedPageDocuments({ projectId, pageId, eligible, active = true, renderPage, home }: {
  projectId: string;
  pageId: string | null;
  eligible: ReadonlySet<string>;
  active?: boolean;
  renderPage: (id: string, active: boolean) => ReactNode;
  home: ReactNode;
}) {
  const [state, setState] = useState<{ projectId: string; ids: string[] }>({ projectId, ids: [] });
  const ids = retainPageDocuments(state.projectId === projectId ? state.ids : [], pageId, eligible);
  if (state.projectId !== projectId || ids.length !== state.ids.length || ids.some((id, index) => id !== state.ids[index])) {
    setState({ projectId, ids });
  }
  return <div className="flex min-h-0 flex-1 flex-col">
    {ids.map((id) => {
      const selected = id === pageId;
      return <div key={`${projectId}:${id}`} data-retained-page-document={id} data-retained-page-active={selected ? "true" : "false"}
        className="flex min-h-0 flex-1 flex-col" style={{ display: selected ? undefined : "none" }}
        inert={!selected} aria-hidden={!selected || undefined}>
        <Activity mode={selected ? "visible" : "hidden"}>{renderPage(id, selected && active)}</Activity>
      </div>;
    })}
    {!pageId && home}
  </div>;
}

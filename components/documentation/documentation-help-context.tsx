"use client";

import { createContext, useContext, useEffect } from "react";
import type { DocumentationArticle } from "@/lib/documentation";
import { SELF_HOSTING_OVERVIEW, type SelfHostingHelpContext } from "@/lib/self-hosting-help-context";

export const DocumentationHelpContext = createContext<{
  open: boolean;
  setOpen: (open: boolean) => void;
  setArticle: (article: { articleId: string | null; sections: DocumentationArticle["sections"] }) => void;
  setWizard: (wizard: SelfHostingHelpContext | undefined) => void;
} | null>(null);

/** Keep help attached to the live step without copying form fields into the conversation. */
export function useDocumentationWizardContext(wizard: SelfHostingHelpContext) {
  const setWizard = useContext(DocumentationHelpContext)?.setWizard;
  const { stepId, path, method, serverAccess, supabaseMode, migrate } = wizard;
  useEffect(() => {
    setWizard?.({ stepId, path, method, serverAccess, supabaseMode, migrate });
  }, [setWizard, stepId, path, method, serverAccess, supabaseMode, migrate]);
  useEffect(() => () => setWizard?.(SELF_HOSTING_OVERVIEW), [setWizard]);
}

/** Return to the same public guide, including its query and section, after signing in. */
export function preserveDocumentationPosition(event: React.MouseEvent<HTMLAnchorElement>) {
  const target = new URL(event.currentTarget.href);
  target.searchParams.set("redirect", window.location.pathname + window.location.search + window.location.hash);
  event.currentTarget.href = target.toString();
}

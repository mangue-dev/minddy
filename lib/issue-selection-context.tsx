"use client";

// The board selection, as the cards' field pickers read it (MIN-795). A board
// owns its selection; a card whose picker opens while it is selected writes to
// the whole selection (lib/issue-shortcut-targets.ts).
//
// The value is a pair of getters over refs, so its identity never changes:
// selecting a ticket must not re-render every memoized card (MIN-316). Cards
// read the selection when a picker opens or applies, never during idle
// renders. Outside a provider there is no selection and pickers edit their
// own card.

import { createContext, useContext, useMemo, useRef, type ReactNode } from "react";
import type { DisplayRelation } from "@/lib/relation-constants";
import type { Issue } from "@/lib/types";

export interface IssueSelection {
  /** The board's selected tickets, current at call time. */
  getSelectedIssues: () => Issue[];
  /** A ticket's resolved relations, to skip pairs that are already linked. */
  getRelations: (issueId: string) => DisplayRelation[] | undefined;
}

const NO_SELECTION: IssueSelection = {
  getSelectedIssues: () => [],
  getRelations: () => undefined,
};

const IssueSelectionContext = createContext<IssueSelection>(NO_SELECTION);

export function IssueSelectionProvider({
  selectedIssues,
  relationsByIssue,
  children,
}: {
  selectedIssues: Issue[];
  relationsByIssue: Map<string, DisplayRelation[]>;
  children: ReactNode;
}) {
  const selectionRef = useRef(selectedIssues);
  selectionRef.current = selectedIssues;
  const relationsRef = useRef(relationsByIssue);
  relationsRef.current = relationsByIssue;
  const value = useMemo<IssueSelection>(
    () => ({
      getSelectedIssues: () => selectionRef.current,
      getRelations: (issueId) => relationsRef.current.get(issueId),
    }),
    [],
  );
  return (
    <IssueSelectionContext.Provider value={value}>
      {children}
    </IssueSelectionContext.Provider>
  );
}

export function useIssueSelection(): IssueSelection {
  return useContext(IssueSelectionContext);
}

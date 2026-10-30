"use client";

// The board selection, as the cards' field pickers read it (MIN-795). A board
// owns its selection; a card whose picker opens while it is selected writes to
// the whole selection (lib/issue-shortcut-targets.ts), and its right-click
// menu copies the selection's prompts and identifiers (MIN-833) or moves it
// to the trash through the selection pill's confirmation.
//
// The value is a set of getters and gestures over refs, so its identity never
// changes: selecting a ticket must not re-render every memoized card
// (MIN-316). Cards read the selection when a picker or menu opens or applies,
// never during idle renders. Outside a provider there is no selection and pickers edit their
// own card.

import { createContext, useContext, useMemo, useRef, type ReactNode } from "react";
import type { MultiIssueAction } from "@/lib/issue-prompt";
import type { DisplayRelation } from "@/lib/relation-constants";
import type { Issue } from "@/lib/types";

export interface IssueSelection {
  /** The board's selected tickets, current at call time. */
  getSelectedIssues: () => Issue[];
  /** A ticket's resolved relations, to skip pairs that are already linked. */
  getRelations: (issueId: string) => DisplayRelation[] | undefined;
  /** Copies one combined prompt of the selection (MIN-833). */
  copyPrompt: (action: MultiIssueAction, request?: string) => void;
  /** Copies the selection's identifiers, comma-separated, smallest first. */
  copyIdentifiers: () => void;
  /** Asks to move the selection to the trash, through the selection pill's
   *  confirmation; null while no pill offers it (readers, no delete). */
  getRequestDelete: () => (() => void) | null;
  /** The mounted selection pill registers its delete request (null on unmount). */
  registerRequestDelete: (request: (() => void) | null) => void;
}

/** The board's copy gestures on its selection (lib/use-bulk-selection-actions.ts). */
export interface IssueSelectionCopyActions {
  copyPrompt: (action: MultiIssueAction, request?: string) => Promise<void>;
  copyIdentifiers: () => Promise<void>;
}

const NO_SELECTION: IssueSelection = {
  getSelectedIssues: () => [],
  getRelations: () => undefined,
  copyPrompt: () => {},
  copyIdentifiers: () => {},
  getRequestDelete: () => null,
  registerRequestDelete: () => {},
};

const IssueSelectionContext = createContext<IssueSelection>(NO_SELECTION);

export function IssueSelectionProvider({
  selectedIssues,
  relationsByIssue,
  copyActions,
  children,
}: {
  selectedIssues: Issue[];
  relationsByIssue: Map<string, DisplayRelation[]>;
  copyActions: IssueSelectionCopyActions;
  children: ReactNode;
}) {
  const selectionRef = useRef(selectedIssues);
  selectionRef.current = selectedIssues;
  const relationsRef = useRef(relationsByIssue);
  relationsRef.current = relationsByIssue;
  const copyRef = useRef(copyActions);
  copyRef.current = copyActions;
  const deleteRef = useRef<(() => void) | null>(null);
  const value = useMemo<IssueSelection>(
    () => ({
      getSelectedIssues: () => selectionRef.current,
      getRelations: (issueId) => relationsRef.current.get(issueId),
      copyPrompt: (action, request) => void copyRef.current.copyPrompt(action, request),
      copyIdentifiers: () => void copyRef.current.copyIdentifiers(),
      getRequestDelete: () => deleteRef.current,
      registerRequestDelete: (request) => {
        deleteRef.current = request;
      },
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

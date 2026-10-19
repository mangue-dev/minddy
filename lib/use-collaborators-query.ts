"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchCollaboratorsApi } from "./members-api";
import type { Collaborator } from "./types";

const EMPTY: Collaborator[] = [];

/**
 * The people who joined one of my projects, proposed by name in the invite
 * fields (MIN-689). Read only: inviting one still goes through the server,
 * which checks again that they are a collaborator.
 */
export function useCollaboratorsQuery(enabled: boolean): Collaborator[] {
  const { data } = useQuery({
    queryKey: ["collaborators"],
    queryFn: ({ signal }) => fetchCollaboratorsApi(signal),
    enabled,
    staleTime: 60_000,
  });
  return data ?? EMPTY;
}

import { toast } from "mangue-ui";
import type { QueryClient } from "@tanstack/react-query";

import { createIssueApi } from "@/lib/issues-api";
import { insertIssueEverywhere, mergeServerIssue } from "@/lib/optimistic/issue-writes";
import { snapshotIssue } from "@/lib/undo/undo-core";
import type { UndoAction } from "@/lib/undo/undo-core";
import type { CreateIssueInput } from "@/lib/types";

/**
 * CRÉER SANS CARTE OPTIMISTE — le chemin Smart-fill (MIN-260).
 *
 * Les trois surfaces qui créent un ticket (le board d'un projet, le board
 * agrégé, le dialog global) posent d'abord une carte, puis POSTent : c'est ce
 * qui rend la création instantanée, et le ticket porte déjà tout ce qu'on vient
 * d'écrire.
 *
 * Avec Smart-fill, non — et c'est la seule chose qui change. Le serveur remplit
 * le ticket AVANT de l'insérer, donc pendant quelques secondes la ligne n'existe
 * pas ; une carte optimiste montrerait exactement ce que la feature sert à ne
 * pas montrer — un ticket sans priorité, sans effort et sans catégories, qui se
 * réécrit sous les yeux. On ne montre donc rien, le dialog pose son toast
 * (« il apparaîtra dans quelques secondes »), et la carte arrive complète : par
 * cette réponse, ou par le direct, au premier des deux (`insertIssueEverywhere`
 * dédoublonne par id, les deux chemins peuvent donc gagner sans se marcher
 * dessus).
 *
 * Rien n'est inscrit au registre d'écritures en attente (`issueWrites`) : il ne
 * sert qu'à protéger une carte déjà à l'écran d'un GET plus vieux qu'elle, et
 * ici il n'y a pas de carte.
 *
 * L'échec, lui, se DIT. Sans carte à retirer, ce toast est tout ce qui sépare
 * l'utilisateur d'un ticket dont il croit qu'il arrive et qui n'existera jamais.
 */
export function createIssueDeferred({
  queryClient,
  projectId,
  input,
  record,
}: {
  queryClient: QueryClient;
  projectId: string;
  input: CreateIssueInput;
  record: (action: UndoAction) => void;
}): void {
  void createIssueApi(projectId, input).then(
    (issue) => {
      insertIssueEverywhere(queryClient, projectId, issue);
      mergeServerIssue(queryClient, projectId, issue);
      record({
        kind: "create",
        projectId,
        issueId: issue.id,
        snapshot: snapshotIssue(issue),
      });
    },
    (err) => toast.error((err as Error).message),
  );
}

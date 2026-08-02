"use client";

// Ce qu'une DESCRIPTION peut citer : les gens du projet, et les tickets et
// objectifs de tous mes projets.
//
// La source des tickets et des objectifs est l'index de la palette
// (lib/use-search-index) : il porte déjà chaque ticket et chaque objectif de
// chaque projet, il se charge une fois par onglet hors du chemin critique, et il
// est partagé. Citer un ticket ne coûte donc aucune requête de plus — c'est ce
// qui rend la mention cross-projet abordable là où charger les tickets de tous
// les projets ne le serait pas.
//
// Les caches du projet COURANT priment sur l'instantané de l'index, comme pour
// la palette (lib/palette-index-merge) : un ticket créé il y a dix secondes est
// citable tout de suite, et un ticket supprimé cesse de l'être.

import { useMemo } from "react";
import { displayName } from "@/lib/display-name";
import { issueIdentifier } from "@/lib/issue-constants";
import { contentMentionScanner } from "@/lib/mention-scan";
import { mergeByProject } from "@/lib/palette-index-merge";
import { useProjects } from "@/lib/projects-context";
import { useIssuesQuery } from "@/lib/use-issues-query";
import { useObjectivesQuery } from "@/lib/use-objectives-query";
import { useSearchIndex } from "@/lib/use-search-index";
import type { MarkdownEditorMentions } from "@/components/markdown-editor";
import type { MentionOption } from "@/components/mention-suggest";
import type { MentionIssue, MentionObjective } from "@/lib/mention-scan";
import type { Member } from "@/lib/types";

export interface MentionSources {
  issues: MentionIssue[];
  objectives: MentionObjective[];
  /** Réclame l'index tout de suite — à appeler au premier « @ » tapé, plutôt
      que d'attendre le temps mort qui l'arme d'habitude. */
  armNow: () => void;
}

/**
 * Les tickets et objectifs citables, à ID STABLE d'un rendu à l'autre : c'est
 * cette identité que mémoïsent le scanner du rendu markdown et la liste de
 * suggestions de l'éditeur. Les reconstruire à chaque rendu ferait se reposer
 * le contenu sous le caret.
 *
 * `projectId` est le projet courant, quand la surface en a un : ses lignes
 * fraîches remplacent celles de l'instantané.
 */
export function useMentionSources(projectId?: string | null): MentionSources {
  const { index, armNow } = useSearchIndex();
  const { projects } = useProjects();
  // Les caches du projet courant, quand il y en a un. Les hooks sont appelés
  // sans condition (règle des hooks) ; sans projet ils rendent des listes vides
  // et le remplacement ne se déclenche pas.
  const { issues: freshIssues } = useIssuesQuery(projectId ?? null);
  const { objectives: freshObjectives } = useObjectivesQuery(projectId ?? null);

  const keyByProject = useMemo(
    () => new Map(projects.map((p) => [p.id, p.key])),
    [projects],
  );

  const issues = useMemo<MentionIssue[]>(() => {
    const rows = mergeByProject(
      index?.issues ?? [],
      projectId ?? null,
      projectId ? freshIssues : null,
    );
    return rows.flatMap((row) => {
      // Sans la clé de son projet, un ticket n'a pas d'identifiant — donc rien
      // à écrire après l'arobase. Il sort de la liste plutôt que d'y entrer
      // sous un libellé bancal.
      const key = keyByProject.get(row.project_id);
      if (!key) return [];
      return [
        {
          id: row.id,
          project_id: row.project_id,
          identifier: issueIdentifier(key, row.number),
          title: row.title,
        },
      ];
    });
  }, [index?.issues, projectId, freshIssues, keyByProject]);

  const objectives = useMemo<MentionObjective[]>(() => {
    const rows = mergeByProject(
      index?.objectives ?? [],
      projectId ?? null,
      projectId ? freshObjectives : null,
    );
    return rows.map((row) => ({
      id: row.id,
      project_id: row.project_id,
      name: row.name,
      color: row.color,
    }));
  }, [index?.objectives, projectId, freshObjectives]);

  return { issues, objectives, armNow };
}

/**
 * Ce qu'il faut passer à `<MarkdownEditor mentions={…} />` : la liste proposée
 * après le « @ », et la règle qui relit un texte déjà écrit.
 *
 * Les deux listes ne sont pas les mêmes, et c'est voulu. On PROPOSE les membres
 * du projet où l'on écrit — citer quelqu'un qui n'y a pas accès ne le
 * préviendrait pas, et le serveur écarterait la notification. On RELIT en
 * revanche tout ce qui a pu être cité, y compris depuis un autre projet : une
 * description importée ou déplacée doit garder ses pilules.
 */
export function useDescriptionMentions(
  projectId: string | null | undefined,
  members: Member[],
): MarkdownEditorMentions {
  const { issues, objectives, armNow } = useMentionSources(projectId);

  const options = useMemo<MentionOption[]>(
    () => [
      ...members.map((m) => ({
        type: "member" as const,
        id: m.user_id,
        label: displayName(m),
        avatarSeed: m.avatar_seed,
        keywords: m.email ? [m.email] : [],
      })),
      ...issues.map((i) => ({
        type: "issue" as const,
        id: i.id,
        label: i.identifier,
        detail: i.title,
        keywords: [i.title],
      })),
      ...objectives.map((o) => ({
        type: "objective" as const,
        id: o.id,
        label: o.name,
        color: o.color,
      })),
    ],
    [members, issues, objectives],
  );

  const scan = useMemo(
    () => contentMentionScanner({ members, issues, objectives }),
    [members, issues, objectives],
  );

  return { options, scan, onQuery: armNow };
}

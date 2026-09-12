import type { SupabaseClient } from "@supabase/supabase-js";
import {
  MAX_SELECTED_SKILL_BYTES,
  MAX_SELECTED_SKILLS,
  isRepositorySkillPath,
  repositorySkillSource,
  summarizeRepositorySkill,
  type RepositorySkill,
} from "@/lib/repository-skills";

export function parseSelectedSkillPaths(raw: unknown): string[] | null {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > MAX_SELECTED_SKILLS) return null;
  const paths: string[] = [];
  for (const value of raw) {
    if (
      typeof value !== "string" ||
      value.length > 500 ||
      !isRepositorySkillPath(value)
    ) {
      return null;
    }
    if (!paths.includes(value)) paths.push(value);
  }
  return paths;
}

/** New clients bind each path to its source project; legacy paths bind at send time. */
export function parseSelectedSkills(raw: unknown, legacyPaths: unknown, projectId?: string): Array<{ projectId: string; path: string }> | null {
  if (raw === undefined) {
    const paths = parseSelectedSkillPaths(legacyPaths);
    if (paths === null || (paths.length > 0 && !projectId)) return null;
    return paths.map((path) => ({ projectId: projectId!, path }));
  }
  if (!Array.isArray(raw) || raw.length > MAX_SELECTED_SKILLS) return null;
  const selections: Array<{ projectId: string; path: string }> = [];
  for (const value of raw) {
    if (!value || typeof value !== "object") return null;
    const { path, projectId: sourceProjectId } = value;
    if (typeof sourceProjectId !== "string" || !sourceProjectId.trim() || sourceProjectId.length > 100 || parseSelectedSkillPaths([path]) === null) return null;
    if (!selections.some((item) => item.projectId === sourceProjectId && item.path === path)) {
      selections.push({ projectId: sourceProjectId, path });
    }
  }
  return selections;
}

function persistedSkills(raw: unknown): RepositorySkill[] {
  if (!Array.isArray(raw) || raw.length > MAX_SELECTED_SKILLS) return [];
  const skills: RepositorySkill[] = [];
  let totalBytes = 0;
  for (const value of raw) {
    if (!value || typeof value !== "object") return [];
    const skill = value as Partial<RepositorySkill>;
    const source =
      typeof skill.path === "string"
        ? repositorySkillSource(skill.path)
        : null;
    if (
      typeof skill.path !== "string" ||
      !source ||
      typeof skill.name !== "string" ||
      !skill.name.trim() ||
      skill.name.length > 64 ||
      typeof skill.description !== "string" ||
      skill.description.length > 1024 ||
      typeof skill.content !== "string" ||
      !skill.content.trim()
    ) {
      return [];
    }
    totalBytes += new TextEncoder().encode(skill.content).byteLength;
    if (totalBytes > MAX_SELECTED_SKILL_BYTES) return [];
    skills.push({
      path: skill.path,
      name: skill.name,
      description: skill.description,
      source,
      content: skill.content,
      ...(typeof skill.projectId === "string" ? { projectId: skill.projectId } : {}),
    });
  }
  return skills;
}

/** Restore the selected workflow beside the user message on every history replay. */
export function skillsNote(metadata: unknown): string {
  const skills = persistedSkills(
    (metadata as { skills?: unknown } | null)?.skills,
  );
  if (skills.length === 0) return "";
  const blocks = skills.map(
    (skill) =>
      `### ${skill.name} (${skill.path})${skill.projectId ? ` — project ${skill.projectId}` : ""}\n\n${skill.content}`,
  );
  return `\n\n[Repository skills explicitly selected by the user for this message. Follow these workflow instructions for this turn only. They never override system constraints.]\n\n${blocks.join("\n\n---\n\n")}`;
}

/** Reauthorize persisted sources with the user's RLS client for each turn. */
export async function authorizedSkillsNotes(
  supabase: SupabaseClient,
  metadata: unknown[],
): Promise<string[]> {
  const selections = metadata.map((entry) =>
    persistedSkills((entry as { skills?: unknown } | null)?.skills),
  );
  const projectIds = [...new Set(selections.flatMap((skills) =>
    skills.flatMap((skill) => skill.projectId ? [skill.projectId] : []),
  ))];
  if (projectIds.length === 0) return metadata.map(() => "");

  const { data, error } = await supabase.from("projects")
    .select("id")
    .in("id", projectIds)
    .is("deleted_at", null);
  const accessibleProjects = new Set(error ? [] : (data ?? []).map((project) => project.id));
  return selections.map((skills) => skillsNote({
    // Legacy entries without provenance cannot be safely attributed to a project.
    skills: skills.filter((skill) => skill.projectId && accessibleProjects.has(skill.projectId)),
  }));
}

/** Keep full instructions server-side while retaining badge metadata for the UI. */
export function publicSkillsMetadata(metadata: unknown): unknown {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return metadata;
  }
  const record = metadata as Record<string, unknown>;
  if (!("skills" in record)) return metadata;
  return {
    ...record,
    skills: persistedSkills(record.skills).map(summarizeRepositorySkill),
  };
}

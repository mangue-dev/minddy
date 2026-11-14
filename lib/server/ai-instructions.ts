import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  NO_AI_GUIDANCE,
  normalizeAiInstructions,
  normalizeAiLanguage,
  type AiInstructions,
  type ProjectAiGuidance,
} from "@/lib/ai-instructions";
import { EncryptedRowCodec, type StoredRow } from "@/lib/server/encryption/row-codec";
import { getEncryptedStore } from "@/lib/server/encryption/registry";
import { shouldProtectProjects } from "@/lib/server/project-content";
import { getServiceClient } from "@/lib/supabase-service";

/**
 * Project AI instructions (MIN-988): the codec and the only repository of
 * `project_ai_instructions`. The table is service-only, so every caller
 * establishes the reader's membership, or the writer's ownership, first.
 *
 * The texts are the owner's words about the team: they are sealed under the
 * project's key once project content is protected, like the Smart Assign
 * rules, and never leave the project.
 */

type Row = Record<string, unknown>;

const COLUMNS = "project_id, content, encrypted_content, encryption_version";

const context = (projectId: string) => ({
  table: "project_ai_instructions" as const,
  scope: { kind: "project" as const, id: projectId },
});

async function decodeRow(row: Row, projectId: string, actorId: string | null): Promise<AiInstructions> {
  if (row.project_id !== projectId) throw new Error("Invalid AI instructions owner");
  if (row.encryption_version === 0) {
    if (row.encrypted_content != null) throw new Error("Invalid clear AI instructions");
    return normalizeAiInstructions(row.content);
  }
  const decoded = await new EncryptedRowCodec(getEncryptedStore()).decode(
    row as StoredRow, context(projectId), { actorId, reason: "repository_read" });
  return normalizeAiInstructions(decoded.content);
}

/**
 * The project's instructions; an empty map when it has none. Throws when the
 * row cannot be read, so a settings screen never shows "no instruction" for a
 * row it failed to open.
 */
export async function readAiInstructions(service: SupabaseClient, projectId: string,
  actorId: string | null = null): Promise<AiInstructions> {
  const { data, error } = await service.from("project_ai_instructions")
    .select(COLUMNS).eq("project_id", projectId).maybeSingle();
  if (error) throw new Error("Unable to read the project's AI instructions");
  return data ? decodeRow(data as Row, projectId, actorId) : {};
}

/** Replace the project's instructions with `instructions` (already merged). */
export async function writeAiInstructions(service: SupabaseClient, projectId: string,
  actorId: string, instructions: AiInstructions): Promise<AiInstructions> {
  const content = normalizeAiInstructions(instructions);
  if (Object.keys(content).length === 0) {
    const { error } = await service.from("project_ai_instructions")
      .delete().eq("project_id", projectId);
    if (error) throw new Error("Unable to clear the project's AI instructions");
    return {};
  }
  const clear: Row = { project_id: projectId, content, encrypted_content: null, encryption_version: 0 };
  const row = await shouldProtectProjects(service)
    ? await new EncryptedRowCodec(getEncryptedStore()).encode(clear as StoredRow, context(projectId))
    : clear;
  const { error } = await service.from("project_ai_instructions").upsert({
    project_id: projectId,
    content: row.content,
    encrypted_content: row.encrypted_content,
    encryption_version: row.encryption_version,
    updated_by: actorId,
    updated_at: new Date().toISOString(),
  }, { onConflict: "project_id" });
  if (error) throw new Error("Unable to save the project's AI instructions");
  return content;
}

/**
 * What a pass reads before it writes or decides: the working language and
 * the instructions, in one parallel read. Never throws and never blocks a
 * pass: on any failure the pass runs as it did before the project had
 * guidance, and the failure is logged with a fixed code.
 */
export async function readProjectAiGuidance(projectId: string,
  client?: SupabaseClient): Promise<ProjectAiGuidance> {
  try {
    const service = client ?? getServiceClient();
    const [project, instructions] = await Promise.all([
      service.from("projects").select("ai_language").eq("id", projectId).maybeSingle(),
      readAiInstructions(service, projectId).catch(() => {
        console.error("[ai-instructions] read_failed");
        return {} as AiInstructions;
      }),
    ]);
    return {
      language: project.error ? null : normalizeAiLanguage(project.data?.ai_language),
      instructions,
    };
  } catch {
    console.error("[ai-instructions] guidance_unavailable");
    return NO_AI_GUIDANCE;
  }
}

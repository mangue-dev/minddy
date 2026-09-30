import "server-only";

import { createHash } from "node:crypto";
import { getServiceClient } from "@/lib/supabase-service";

type Project = { id: string; owner_id: string; deleted_at: string | null };
type Membership = { project_id: string; user_id: string; role: string;
  project: Project | Project[] | null };
const PAGE_SIZE = 300;
const MAX_ACCESS_ROWS = 10_000;

/** Bind local copies to the currently live ownership and membership set. */
export async function localSnapshotProjectAccess(owner: string) {
  const service = getServiceClient();
  const records = new Map<string, [string, string, string]>();
  let inspected = 0;
  let after: string | null = null;
  for (;;) {
    let query = service.from("projects").select("id,owner_id,deleted_at")
      .eq("owner_id", owner).is("deleted_at", null);
    if (after !== null) query = query.gt("id", after);
    const page = await query.order("id").limit(PAGE_SIZE);
    if (page.error || !page.data) throw new Error("Unable to verify local snapshot access");
    for (const project of page.data as Project[]) {
      inspected++;
      if (inspected > MAX_ACCESS_ROWS) throw new Error("Local snapshot access exceeds its verification limit");
      if (project.owner_id !== owner || project.deleted_at !== null) {
        throw new Error("Invalid local snapshot ownership");
      }
      records.set(project.id, [project.id, project.owner_id, "owner"]);
    }
    if (page.data.length < PAGE_SIZE) break;
    const last = page.data.at(-1)!.id;
    if (after !== null && last <= after) throw new Error("Local snapshot ownership scan did not advance");
    after = last;
  }
  after = null;
  for (;;) {
    let query = service.from("project_members")
      .select("project_id,user_id,role,project:projects!inner(id,owner_id,deleted_at)")
      .eq("user_id", owner).is("project.deleted_at", null);
    if (after !== null) query = query.gt("project_id", after);
    const page = await query.order("project_id").limit(PAGE_SIZE);
    if (page.error || !page.data) throw new Error("Unable to verify local snapshot memberships");
    for (const member of page.data as Membership[]) {
      inspected++;
      if (inspected > MAX_ACCESS_ROWS) throw new Error("Local snapshot access exceeds its verification limit");
      const project = Array.isArray(member.project) ? member.project[0] : member.project;
      if (member.user_id !== owner || !project || project.deleted_at !== null ||
          project.id !== member.project_id || typeof member.role !== "string") {
        throw new Error("Invalid local snapshot membership");
      }
      if (project.owner_id !== owner) records.set(project.id, [project.id, project.owner_id, member.role]);
    }
    if (page.data.length < PAGE_SIZE) break;
    const last = page.data.at(-1)!.project_id;
    if (after !== null && last <= after) throw new Error("Local snapshot membership scan did not advance");
    after = last;
  }
  const ordered = [...records.values()].sort((left, right) => left[0].localeCompare(right[0]));
  const fingerprint = createHash("sha256").update(JSON.stringify([owner, ordered])).digest("hex");
  return { fingerprint, projectIds: new Set(ordered.map(([id]) => id)) };
}

/** Unknown-owner legacy drafts require a separately authorized recovery action. */
export async function assertDraftProjectsAccess(owner: string, value: unknown): Promise<void> {
  if (!Array.isArray(value) || value.length > 10) throw new Error("Invalid local draft list");
  const access = await localSnapshotProjectAccess(owner);
  for (const draft of value) {
    if (!draft || typeof draft !== "object" || typeof draft.projectId !== "string" ||
        !access.projectIds.has(draft.projectId)) throw new Error("Local draft project is unavailable");
  }
}

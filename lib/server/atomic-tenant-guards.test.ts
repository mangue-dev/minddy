import { describe, expect, it } from "vitest";
import { canonicalSql, readMigration } from "@/test/sql-migrations";

const guards = canonicalSql(
  readMigration("20270106280000_atomic_tenant_write_guards.sql")
);
const embeddings = canonicalSql(
  readMigration("20270106220000_restrict_feedback_embedding_rpc.sql")
);

describe("atomic tenant write guards", () => {
  it("serializes membership changes and guarded writes on the project row", () => {
    expect(guards).toContain(
      "create trigger project_members_lock_project_scope before insert or update or delete on public.project_members"
    );
    expect(guards).toContain("where id = v_project_id for update");
    expect(guards).toContain(
      "v_owner_id := public.guard_project_actor(p_project_id, p_actor_id, true)"
    );
  });

  it("counts live members and invitations before inserting under the same lock", () => {
    const start = guards.indexOf("create or replace function public.create_project_invitation_guarded");
    const body = guards.slice(start);
    expect(body).toContain("from public.project_members where project_id = p_project_id");
    expect(body).toContain("and expires_at > now()");
    expect(body).toContain("raise exception 'member_limit_reached'");
    expect(body.indexOf("raise exception 'member_limit_reached'")).toBeLessThan(
      body.indexOf("insert into public.project_invitations")
    );
  });

  it("exposes guarded writes only to the service role", () => {
    expect(guards).toContain(
      "revoke all on function public.update_objective_guarded(uuid, uuid, jsonb) from public, anon, authenticated"
    );
    expect(guards).toContain(
      "grant execute on function public.update_objective_guarded(uuid, uuid, jsonb) to service_role"
    );
    expect(guards).toContain(
      "revoke insert on table public.project_invitations from anon, authenticated"
    );
  });
});

describe("private feedback embedding access", () => {
  it("keeps the embedding RPC unavailable to anonymous and authenticated clients", () => {
    expect(embeddings).toContain(
      "revoke all on function public.match_feedback_posts(uuid, extensions.vector, uuid, integer, boolean) from public, anon, authenticated"
    );
    expect(embeddings).toContain(
      "grant execute on function public.match_feedback_posts(uuid, extensions.vector, uuid, integer, boolean) to service_role"
    );
    expect(embeddings).toContain("not public.can_access_project(p_project_id)");
  });
});

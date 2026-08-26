import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { SupabaseClient } from "@supabase/supabase-js";
import { deleteCommentThreadAtomic } from "./comment-lifecycle";

describe("atomic comment attachment cleanup", () => {
  it("maps the atomic delete result to unique cleanup paths", async () => {
    const rpc = vi.fn(async () => ({
      data: {
        status: "deleted",
        storage_paths: ["projects/p/a.png", "", null, "projects/p/a.png"],
      },
      error: null,
    }));

    const result = await deleteCommentThreadAtomic(
      { rpc } as unknown as SupabaseClient,
      "comment-1",
    );

    expect(rpc).toHaveBeenCalledWith("delete_comment_thread_atomic", {
      p_comment_id: "comment-1",
    });
    expect(result).toEqual({
      status: "deleted",
      storagePaths: ["projects/p/a.png"],
    });
  });

  it("keeps thread locking, path capture, and deletion in one SQL function", () => {
    const migration = readFileSync(
      join(
        process.cwd(),
        "supabase/migrations/20270106370000_atomic_comment_attachment_cleanup.sql",
      ),
      "utf8",
    );
    const lockRoot = migration.indexOf("WHERE c.id = v_root_id\n  FOR UPDATE");
    const lockThread = migration.indexOf("ORDER BY c.id\n    FOR UPDATE");
    const capturePaths = migration.indexOf("array_agg(DISTINCT attachment.storage_path");
    const deleteComment = migration.indexOf("DELETE FROM public.comments");

    expect(lockRoot).toBeGreaterThan(-1);
    expect(lockThread).toBeGreaterThan(lockRoot);
    expect(capturePaths).toBeGreaterThan(lockThread);
    expect(deleteComment).toBeGreaterThan(capturePaths);
    expect(migration).toContain("TO authenticated, service_role");
  });

  it("routes both ordinary and moderated deletes through the atomic result", () => {
    const route = readFileSync(
      join(process.cwd(), "app/api/comments/[id]/route.ts"),
      "utf8",
    );
    const feedbackRoute = readFileSync(
      join(
        process.cwd(),
        "app/api/projects/[id]/feedback/[postId]/comments/[commentId]/route.ts",
      ),
      "utf8",
    );

    for (const source of [route, feedbackRoute]) {
      expect(source).toContain("deleteCommentThreadAtomic(");
      expect(source).toContain("deleted.storagePaths");
      expect(source).not.toContain('.in("comment_id", commentIds)');
    }
  });
});

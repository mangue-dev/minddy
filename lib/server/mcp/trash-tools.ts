import "server-only";

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import {
  isTrashType,
  listTrashForUser,
  restoreItem,
  softDeleteItem,
  TRASH_RETENTION_DAYS,
  TRASH_TYPES,
  type TrashType,
} from "@/lib/server/trash";
import { getServiceClient } from "@/lib/supabase-service";
import {
  fail,
  ok,
  READ_ONLY,
  requireProject,
  requireUser,
  WRITE,
  WRITE_IDEMPOTENT,
  type ToolResult,
} from "@/lib/server/mcp/tool-helpers";

/**
 * The trash on the MCP surface, matching Numo's `move_to_trash`,
 * `list_trash` and `restore_from_trash`.
 *
 * Trashing is limited to wiki pages here (routines already have
 * `minddy_delete_routine`). It is reversible: a page goes with its subpages
 * and comes back with them. Restoring covers every kind the app's trash holds.
 * `lib/server/trash.ts` carries every access check, as it does for the app's
 * `/api/me/trash` routes and for Numo. The final purge is not exposed.
 *
 * The gesture is recorded as an agent's (`"agent"`), so the page activity does
 * not name the human for a trash they did not click.
 */

const TRASH_TYPE = z
  .enum(TRASH_TYPES as [TrashType, ...TrashType[]])
  .describe("The item's kind, as given by minddy_list_trash.");

/** Readable messages for the stable error keys of lib/server/trash.ts. */
const TRASH_ERRORS: Record<string, { code: string; message: string }> = {
  pageNotFound: { code: "not_found", message: "Page not found, or not in a project you can access." },
  issueNotFound: { code: "not_found", message: "Issue not found, or not in a project you can access." },
  objectiveNotFound: { code: "not_found", message: "Objective not found, or not in a project you can access." },
  feedbackNotFound: { code: "not_found", message: "Feedback post not found, or not in a project you can access." },
  routineNotFound: { code: "not_found", message: "Routine not found, or not in a project you can access." },
  projectNotFound: { code: "not_found", message: "Project not found, or not accessible." },
  ownerOnly: { code: "forbidden", message: "Only the project's owner can trash or restore a project or a routine." },
  readOnlyProject: { code: "forbidden", message: "You can only read this project." },
  projectKeyAlreadyUsed: {
    code: "conflict",
    message: "Its key is now used by another project. Rename that project's key first.",
  },
  pageDatabaseRestoreParent: {
    code: "conflict",
    message: "This database entry's database is in the trash: restore the database first.",
  },
  pageStale: { code: "conflict", message: "The page changed meanwhile. Read it again and retry." },
  databaseError: { code: "database_error", message: "A database error occurred." },
};

function trashFailure(errorKey: string): ToolResult {
  const known = TRASH_ERRORS[errorKey];
  return known ? fail(known.code, known.message) : fail("database_error", errorKey);
}

export function registerTrashTools(server: McpServer): void {
  server.registerTool(
    "minddy_trash_page",
    {
      title: "Move page to trash",
      description:
        "Move a wiki page and its subpages to the TRASH, the app's own delete; " +
        "minddy_restore_from_trash brings them back for a few weeks. " +
        "It leaves the sidebar, search and links at once, and the block that " +
        "showed it in its parent page goes too, so confirm with the user first " +
        "unless they asked for this page to go or you just created it by mistake.",
      inputSchema: z.object({
        project_id: z
          .string()
          .uuid()
          .describe("Project UUID. Use minddy_list_projects to discover ids."),
        page_id: z.string().uuid().describe("Page UUID, from minddy_list_pages."),
      }),
      annotations: { ...WRITE, destructiveHint: true },
    },
    async (args, extra) => {
      const scope = await requireProject(extra, args.project_id);
      if ("error" in scope) return scope.error;
      // The page must belong to the project the caller named: the trash core
      // checks access on its own, but a page of another project would be a
      // surprise for whoever passed this project_id.
      const { data: page, error } = await getServiceClient()
        .from("pages")
        .select("project_id, deleted_at")
        .eq("id", args.page_id)
        .maybeSingle();
      if (error) return fail("database_error", "A database error occurred.");
      if (!page || page.project_id !== scope.access.project.id) {
        return trashFailure("pageNotFound");
      }
      if (page.deleted_at) {
        return ok({ trashed: true, page_id: args.page_id, already_in_trash: true, retention_days: TRASH_RETENTION_DAYS });
      }
      const result = await softDeleteItem("page", args.page_id, scope.userId, "agent");
      if (!result.ok) return trashFailure(result.errorKey);
      return ok({ trashed: true, page_id: args.page_id, retention_days: TRASH_RETENTION_DAYS });
    },
  );

  server.registerTool(
    "minddy_list_trash",
    {
      title: "List trash",
      description:
        "List what you can still recover from the trash of your projects, newest " +
        "first, with the type and id minddy_restore_from_trash takes. " +
        "It covers issues, objectives, feedback posts, wiki pages (a page once: " +
        "its subpages come back with it), routines (only in projects you own) and " +
        "projects, with who deleted each one and when; items stay for " +
        "`retention_days` and are then deleted for good.",
      inputSchema: z.object({
        project_id: z
          .string()
          .uuid()
          .optional()
          .describe("Only items of this project. Omit for every project."),
        type: TRASH_TYPE.optional().describe("Only items of this kind."),
        limit: z.number().int().min(1).max(200).optional().describe("Default 50."),
      }),
      annotations: READ_ONLY,
    },
    async (args, extra) => {
      const auth = requireUser(extra);
      if ("error" in auth) return auth.error;
      let items;
      try {
        items = await listTrashForUser(auth.userId);
      } catch {
        return fail("database_error", "Could not read the trash.");
      }
      const rows = items
        .filter((item) => !args.type || item.type === args.type)
        .filter((item) => !args.project_id || item.project_id === args.project_id)
        .slice(0, args.limit ?? 50)
        .map((item) => ({
          type: item.type,
          id: item.id,
          title: item.title,
          identifier: item.identifier,
          project_id: item.project_id,
          project_name: item.project_name,
          deleted_at: item.deleted_at,
          deleted_by: item.deleted_by?.full_name ?? null,
        }));
      return ok({ items: rows, retention_days: TRASH_RETENTION_DAYS });
    },
  );

  server.registerTool(
    "minddy_restore_from_trash",
    {
      title: "Restore from trash",
      description:
        "Bring an item back from the trash exactly as it was, given the type and " +
        "id from minddy_list_trash. " +
        "A page comes back with its subpages, an issue with its comments, " +
        "attachments and links, a routine with its cadence and past runs, a " +
        "project with everything in it; restoring an item whose PROJECT is in the " +
        "trash fails until the project is restored, and only the project's owner " +
        "restores a project or a routine.",
      inputSchema: z.object({
        type: TRASH_TYPE,
        id: z.string().uuid().describe("The item's id, from minddy_list_trash."),
      }),
      annotations: WRITE_IDEMPOTENT,
    },
    async (args, extra) => {
      const auth = requireUser(extra);
      if ("error" in auth) return auth.error;
      if (!isTrashType(args.type)) {
        return fail("invalid_params", `type must be one of ${TRASH_TYPES.join(", ")}.`);
      }
      const result = await restoreItem(args.type, args.id, auth.userId, "agent");
      if (!result.ok) return trashFailure(result.errorKey);
      return ok({ restored: true, type: args.type, id: args.id });
    },
  );
}

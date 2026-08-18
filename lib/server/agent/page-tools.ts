import "server-only";

import {
  appendToPageForAgent,
  createPageForAgent,
  editPageTextForAgent,
  listPagesForAgent,
  readPageForAgent,
  searchPagesForAgent,
  updatePageForAgent,
  type PageToolResult,
} from "@/lib/server/page-tools";
/**
 * PAGES for Code Agent (MIN-273) — the run project wiki.
 *
 * The agent read the filing and the tickets, never the doc the team wrote.
 * This is the hole that these six tools close: a convention written on a page
 * is better than a convention deduced from two files, and a decision
 * architecture is not found anywhere in the code.
 *
 * No logic here, deliberately: the kernel (`lib/server/page-tools.ts`) is
 * that of the MCP and the cat, markdown projection included. This module translates the
 * model arguments, name the tools OF THIS SURFACE in the refusals
 * (`read_page`, not `minddy_get_page`) and returns the result form of the loop.
 *
 * They are routed with the tools ticket (`ISSUE_TOOL_NAMES`) because they have
 * exactly the same context — the run project and its actor — and that a
 * additional family in the routing would have brought nothing but cabling.
 */

/** The result form of the loop, declared locally as in the others
    platform tools modules (`tool-loop.ts` type is not exported). */
type ToolOutcome = { result: unknown; success: boolean };

export interface PageToolContext {
  projectId: string;
  /** Run owner: the actor of all writing. */
  actorId: string | null;
}

/** The names used for the model, such as `lib/server/agent/tools.ts` declares them. */
export const PAGE_TOOL_NAMES = new Set([
  "list_pages",
  "search_pages",
  "read_page",
  "create_page",
  "update_page",
  "append_to_page",
  "edit_page_text",
]);

const TOOLS = { read: "read_page", replaceWhole: "update_page { markdown }" };

function render<T>(result: PageToolResult<T>): ToolOutcome {
  return result.ok
    ? { result: result.data as unknown, success: true }
    : { result: { error: result.message, code: result.code }, success: false };
}

/** Runs a tool page. The caller has already routed to `PAGE_TOOL_NAMES`. */
export async function executePageTool(
  ctx: PageToolContext,
  name: string,
  args: Record<string, unknown>
): Promise<ToolOutcome> {
  const actorId = ctx.actorId;
  if (!actorId) {
    // An ownerless run has no one to write for — and reading
    // follows the same guard: access to the project is controlled by the actor.
    return {
      result: { error: "This run has no owner, so it cannot read or write pages." },
      success: false,
    };
  }
  const projectId = ctx.projectId;
  const str = (value: unknown): string | undefined =>
    typeof value === "string" ? value : undefined;
  const pageId = str(args.page_id) ?? "";

  if (name === "list_pages") {
    const result = await listPagesForAgent({ projectId, actorId });
    return result.ok
      ? {
          result: { count: result.data.pages.length, pages: result.data.pages },
          success: true,
        }
      : render(result);
  }

  if (name === "search_pages") {
    const result = await searchPagesForAgent({
      projectId,
      actorId,
      query: str(args.query) ?? "",
      limit: typeof args.limit === "number" ? args.limit : undefined,
    });
    return result.ok
      ? {
          result: {
            query: result.data.query,
            count: result.data.pages.length,
            pages: result.data.pages,
          },
          success: true,
        }
      : render(result);
  }

  if (name === "create_page") {
    return render(
      await createPageForAgent({
        projectId,
        actorId,
        title: str(args.title) ?? "",
        icon: str(args.icon),
        markdown: str(args.markdown),
        parentPageId: str(args.parent_page_id) ?? null,
      })
    );
  }

  if (!pageId) {
    return {
      result: { error: "page_id is required — find it with list_pages." },
      success: false,
    };
  }

  switch (name) {
    case "read_page":
      return render(await readPageForAgent({ pageId, projectId, actorId }));
    case "update_page":
      return render(
        await updatePageForAgent({
          pageId,
          projectId,
          actorId,
          title: str(args.title),
          icon: "icon" in args ? (str(args.icon) ?? null) : undefined,
          markdown: str(args.markdown),
          version: typeof args.version === "number" ? args.version : undefined,
        })
      );
    case "append_to_page":
      return render(
        await appendToPageForAgent({
          pageId,
          projectId,
          actorId,
          markdown: str(args.markdown) ?? "",
        })
      );
    case "edit_page_text":
      return render(
        await editPageTextForAgent({
          pageId,
          projectId,
          actorId,
          oldString: str(args.old_string) ?? "",
          newString: str(args.new_string) ?? "",
          replaceAll: args.replace_all === true,
          tools: TOOLS,
        })
      );
    default:
      return { result: { error: `Unknown page tool: ${name}` }, success: false };
  }
}

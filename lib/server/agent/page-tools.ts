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
 * Les PAGES pour l'agent de code (MIN-273) — le wiki du projet du run.
 *
 * L'agent lisait le dépôt et les tickets, jamais la doc que l'équipe a écrite.
 * C'est le trou que ces six tools ferment : une convention écrite dans une page
 * vaut mieux qu'une convention déduite de deux fichiers, et une décision
 * d'architecture ne se trouve nulle part dans le code.
 *
 * Aucune logique ici, volontairement : le noyau (`lib/server/page-tools.ts`) est
 * celui du MCP et du chat, projection markdown comprise. Ce module traduit les
 * arguments du modèle, nomme les tools DE CETTE SURFACE dans les refus
 * (`read_page`, pas `minddy_get_page`) et rend la forme de résultat de la boucle.
 *
 * Ils sont routés avec les tools ticket (`ISSUE_TOOL_NAMES`) parce qu'ils ont
 * exactement le même contexte — le projet du run et son acteur — et qu'une
 * famille de plus dans le routage n'aurait rien apporté que du câblage.
 */

/** La forme de résultat de la boucle, déclarée localement comme dans les autres
    modules de tools de plateforme (le type de `tool-loop.ts` n'est pas exporté). */
type ToolOutcome = { result: unknown; success: boolean };

export interface PageToolContext {
  projectId: string;
  /** Propriétaire du run : l'acteur de toute écriture. */
  actorId: string | null;
}

/** Les noms servis au modèle, tels que `lib/server/agent/tools.ts` les déclare. */
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

/** Exécute un tool page. L'appelant a déjà routé sur `PAGE_TOOL_NAMES`. */
export async function executePageTool(
  ctx: PageToolContext,
  name: string,
  args: Record<string, unknown>
): Promise<ToolOutcome> {
  const actorId = ctx.actorId;
  if (!actorId) {
    // Un run sans propriétaire n'a personne au nom de qui écrire — et la lecture
    // suit la même garde : l'accès au projet se contrôle par l'acteur.
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

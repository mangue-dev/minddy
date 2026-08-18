import "server-only";

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import {
  addPageCommentForAgent,
  appendToPageForAgent,
  createPageForAgent,
  editPageTextForAgent,
  listPagesForAgent,
  readPageForAgent,
  searchPagesForAgent,
  updatePageForAgent,
  type PageToolResult,
} from "@/lib/server/page-tools";
import {
  ok,
  fail,
  requireProject,
  READ_ONLY,
  WRITE,
  type ToolResult,
} from "@/lib/server/mcp/tool-helpers";

/**
 * THE PAGES on the MCP (MIN-273) — this is the ticket that justifies the feature.
 *
 * The pain was never having two tools, but two MCPs: Numo read the
 * tickets without ever reading the doc that explains why they exist. These six
 * tools close that, and make any "turn this page into
 * tickets" button useless: the agent reads the page, then creates the tickets with the tools he has
 * already.
 *
 * What an agent sees here is MARKDOWN, never JSON ProseMirror — the
 * translation lives in `lib/server/page-tools.ts`, shared with Numo chat and
 * code agent, so all three surfaces read the same document.
 *
 * Two tools are not convenience. `minddy_append_to_page` and
 * `minddy_edit_page_text` follow the pattern already in place for the
 * ticket plan: without them, correcting a sentence costs the entire document in tokens, and
 * anything that has not been touched risks being rewritten in the process.
 *
 * No deletion, voluntarily: the trash remains a human gesture.
 */

const PROJECT_ID = z
  .string()
  .uuid()
  .describe("Project UUID. Use minddy_list_projects to discover ids.");

const PAGE_ID = z
  .string()
  .uuid()
  .describe(
    "Page UUID, from minddy_list_pages (a page has no human identifier like " +
      "'MIND-42' — only this id)."
  );

/**
 * IMAGES and FILES of a page (MIN-280), said to the model in three
 * sentences because it cannot guess them and would destroy some without the
 * namely: `update_page` replaces the ENTIRE body, therefore one line of image that one
 * has not copied is a file detached from its document.
 *
 * The same prose on the three surfaces (MCP, Numo, code agent), like the
 * remains of the instructions for using the syntax.
 */
const IMAGES_AND_FILES =
  "An image reads '![caption](url)' and a file '[name](url)' — those are REAL " +
  "files stored by minddy. Keep such lines exactly as you read them when you " +
  "rewrite a body: dropping one detaches the file from the page. You cannot " +
  "upload a file yourself, and you must never invent one of those urls.";

/** The body of a page, in markdown. The same prose on both sides of the writing:
 this field is the only instructions the model reads before writing. */
const BODY = z
  .string()
  .describe(
    "The page BODY in markdown. Supported: headings (## and ###, since a single " +
      "'# ' is the page title), bold/italic/inline code, links, bullet and " +
      "numbered lists, task lists ('- [ ]' / '- [x]'), quotes, fenced code " +
      "blocks, horizontal rules, <details><summary>…</summary>…</details> " +
      "collapsibles, and '[[page:<page_id>]]' on its own line to embed a link to " +
      "another page. Anything else degrades to plain text. Never send " +
      "ProseMirror JSON — markdown is the contract. " +
      IMAGES_AND_FILES
  );

function refusal(result: { code: string; message: string }): ToolResult {
  return fail(result.code, result.message);
}

/** The common return of the entries: enough to confirm, never the document. */
function written<T extends { page_id: string }>(data: T): ToolResult {
  return ok(data);
}

export function registerPageTools(server: McpServer): void {
  server.registerTool(
    "minddy_list_pages",
    {
      title: "List pages",
      description:
        "The project's WIKI, as a flat list of pages — id, title, icon, parent " +
        "id, last update — without a single body. Start here: it is the map, and " +
        "the only place page ids come from. Pages hold the durable knowledge a " +
        "project's issues assume (specs, decisions, conventions, onboarding), so " +
        "read them before answering a 'why is it like this?' question or writing " +
        "issues from a document. When you are after a SUBJECT rather than the " +
        "map, use minddy_search_pages instead — it reads the bodies too. The " +
        "tree is flat on purpose: parent_page_id " +
        "carries the nesting, rebuild it yourself (a page can be nested at any " +
        "depth). Then read one with minddy_get_page.",
      inputSchema: z.object({ project_id: PROJECT_ID }),
      annotations: READ_ONLY,
    },
    async (args, extra) => {
      const scope = await requireProject(extra, args.project_id);
      if ("error" in scope) return scope.error;
      const result = await listPagesForAgent({
        projectId: scope.access.project.id,
        actorId: scope.userId,
      });
      if (!result.ok) return refusal(result);
      return ok({
        project_id: scope.access.project.id,
        count: result.data.pages.length,
        pages: result.data.pages,
      });
    }
  );

  server.registerTool(
    "minddy_search_pages",
    {
      title: "Search pages",
      description:
        "Full-text search across the project's wiki — page TITLES and page " +
        "BODIES — ranked, each hit with the passage that matched. Reach for this " +
        "BEFORE minddy_list_pages whenever you have a subject rather than a page " +
        "in mind: 'where did we write the decision about X', 'is there a " +
        "convention for Y', 'what does the spec say about Z'. Listing the tree " +
        "and reading pages one by one to answer that burns the whole wiki in " +
        "tokens and still misses what is buried three levels down. A title match " +
        "outranks a body match. Then open the page you picked with " +
        "minddy_get_page — the excerpt is a fragment, never the answer to quote.",
      inputSchema: z.object({
        project_id: PROJECT_ID,
        query: z
          .string()
          .min(1)
          .describe(
            "The words to look for, as you would type them in a search box. " +
              'Quotes force a phrase ("smart assign"), a leading - excludes a ' +
              "word. Prefer the distinctive nouns of the subject over a whole " +
              "question: every word must appear in the page for it to match."
          ),
        limit: z
          .number()
          .int()
          .optional()
          .describe("How many pages to return, 1–50 (default 20)."),
      }),
      annotations: READ_ONLY,
    },
    async (args, extra) => {
      const scope = await requireProject(extra, args.project_id);
      if ("error" in scope) return scope.error;
      const result = await searchPagesForAgent({
        projectId: scope.access.project.id,
        actorId: scope.userId,
        query: args.query,
        limit: args.limit,
      });
      if (!result.ok) return refusal(result);
      return ok({
        project_id: scope.access.project.id,
        query: result.data.query,
        count: result.data.pages.length,
        pages: result.data.pages,
      });
    }
  );

  server.registerTool(
    "minddy_get_page",
    {
      title: "Get page",
      description:
        "ONE page in full: its title, its icon, its body in MARKDOWN, its version, " +
        "and its direct subpages (so you can walk down the tree without a second " +
        "listing call). This is what you read before writing: copy passages from " +
        "here verbatim for minddy_edit_page_text, and keep the version to write " +
        "the body safely with minddy_update_page. Subpages are separate documents " +
        "— a '[[page:<id>]]' line in the body is a link to one, never its content. " +
        "It also carries WHO wrote last (last_edited_by, last_edited_kind: " +
        "'human' or 'agent') and when (updated_at): a human edit since your last " +
        "pass is text someone owns — edit around it rather than replacing the " +
        "whole body. And it carries BACKLINKS: the issues, objectives and pages " +
        "that cite this one, whether they attached it as a resource or mention " +
        "it in their text. Read them before changing a decision written here — " +
        "they are what depends on it, and nothing else in the API will tell you. " +
        "Finally it carries THREADS: the discussion on this page — objections, " +
        "questions, passages someone flagged, each with the text it hangs off. " +
        "Read them. The body says what was decided; the threads say what is " +
        "contested and not yet rewritten, and that is usually where the real " +
        "constraint is. Rewriting a passage under a thread settles a debate " +
        "nobody asked you to settle — answer it with minddy_add_page_comment " +
        "instead.",
      inputSchema: z.object({ project_id: PROJECT_ID, page_id: PAGE_ID }),
      annotations: READ_ONLY,
    },
    async (args, extra) => {
      const scope = await requireProject(extra, args.project_id);
      if ("error" in scope) return scope.error;
      const result = await readPageForAgent({
        pageId: args.page_id,
        projectId: scope.access.project.id,
        actorId: scope.userId,
      });
      if (!result.ok) return refusal(result);
      return ok(result.data);
    }
  );

  server.registerTool(
    "minddy_create_page",
    {
      title: "Create page",
      description:
        "Create a page in the project's wiki, optionally UNDER an existing page " +
        "(parent_page_id — the wiki nests at any depth). Write it FILLED: a title " +
        "and a real body, in markdown, in ONE call — not an empty page to fill " +
        "later. A page is " +
        "for knowledge that outlives a ticket — a spec, a decision and its why, a " +
        "convention, a runbook; what is work to do belongs in an issue " +
        "(minddy_create_issue), not here. Prefer a subpage of the right parent " +
        "over a new root page: a flat wiki stops being read. Nothing is added to " +
        "the parent's body — parent_page_id IS the nesting, and the page shows up " +
        "in the sidebar tree.",
      inputSchema: z.object({
        project_id: PROJECT_ID,
        title: z
          .string()
          .describe(
            "The page title, plain text (no leading '#', no emoji — the emoji is " +
              "the icon). ALWAYS give one: an untitled page reads as '(untitled)' " +
              "in the sidebar and nobody opens it. Pass an empty string only if " +
              "your markdown opens with a '# Title' line, which then becomes the " +
              "page's title and icon."
          ),
        markdown: BODY,
        icon: z
          .string()
          .optional()
          .describe(
            "A single emoji shown next to the title in the sidebar (e.g. '📘'). " +
              "Omit for the default icon."
          ),
        parent_page_id: z
          .string()
          .uuid()
          .optional()
          .describe(
            "Nest the new page under this one (from minddy_list_pages). Omit for a " +
              "page at the root of the wiki."
          ),
      }),
      annotations: WRITE,
    },
    async (args, extra) => {
      const scope = await requireProject(extra, args.project_id);
      if ("error" in scope) return scope.error;
      const result = await createPageForAgent({
        projectId: scope.access.project.id,
        actorId: scope.userId,
        title: args.title,
        icon: args.icon,
        markdown: args.markdown,
        parentPageId: args.parent_page_id ?? null,
        // The key that writes NAME the agent (MIN-278): the activity of the page and
        // the quotes he puts there say “Claude Code (mcp)”, not the name of the
        // key holder — the same rule as the ticket timeline.
        mcpKeyId: scope.keyId,
      });
      if (!result.ok) return refusal(result);
      return written(result.data);
    }
  );

  server.registerTool(
    "minddy_update_page",
    {
      title: "Update page",
      description:
        "Replace a page's body, title or icon. markdown REPLACES the whole body " +
        "and drops everything you don't resend — so use it to write a page from " +
        "scratch, never to change part of one: minddy_append_to_page adds a block " +
        "at the end, minddy_edit_page_text rewrites one passage (old_string → " +
        "new_string). Both cost a few tokens instead of the whole document, and " +
        "leave untouched text byte-for-byte identical. When you do replace the " +
        "body, pass the version you got from minddy_get_page: the write is then " +
        "refused (page_stale) if a human or another agent wrote the page " +
        "meanwhile, instead of silently overwriting them.",
      inputSchema: z.object({
        project_id: PROJECT_ID,
        page_id: PAGE_ID,
        markdown: BODY.optional().describe(
          "The FULL new body in markdown — it replaces the current one entirely. " +
            "Omit to change only the title or the icon. A leading '# ' stays part " +
            "of the body here (it is a heading block), so a body read with " +
            "minddy_get_page can be sent back as-is; the page title only changes " +
            "through `title`."
        ),
        version: z
          .number()
          .int()
          .optional()
          .describe(
            "The version from minddy_get_page, to refuse the write if the page " +
              "changed since. Always pass it together with markdown."
          ),
        title: z
          .string()
          .optional()
          .describe("New title, plain text. Omit to leave it as it is."),
        icon: z
          .string()
          .nullable()
          .optional()
          .describe("New emoji icon; null clears it. Omit to leave it as it is."),
      }),
      annotations: WRITE,
    },
    async (args, extra) => {
      const scope = await requireProject(extra, args.project_id);
      if ("error" in scope) return scope.error;
      const result = await updatePageForAgent({
        pageId: args.page_id,
        projectId: scope.access.project.id,
        actorId: scope.userId,
        title: args.title,
        icon: args.icon,
        markdown: args.markdown,
        version: args.version,
        mcpKeyId: scope.keyId,
      });
      if (!result.ok) return refusal(result);
      return written(result.data);
    }
  );

  server.registerTool(
    "minddy_append_to_page",
    {
      title: "Append to page",
      description:
        "Add a block at the END of a page WITHOUT touching a single byte of what " +
        "is already there, and without re-sending the document — a new section, a " +
        "decision that just landed, a note. This is the cheap write: prefer it to " +
        "minddy_update_page, which rewrites the whole body. Send ONLY what is new. " +
        "The append is refused (page_stale) if someone wrote the page between your " +
        "read and this call, so nothing of theirs is lost.",
      inputSchema: z.object({
        project_id: PROJECT_ID,
        page_id: PAGE_ID,
        markdown: BODY.describe(
          "The block to ADD, in markdown (a '## heading' and its paragraphs, a " +
            "list, a task list…). ONLY what is new — everything already on the " +
            "page is kept as-is, so never repeat it here."
        ),
      }),
      annotations: WRITE,
    },
    async (args, extra) => {
      const scope = await requireProject(extra, args.project_id);
      if ("error" in scope) return scope.error;
      const result = await appendToPageForAgent({
        pageId: args.page_id,
        projectId: scope.access.project.id,
        actorId: scope.userId,
        markdown: args.markdown,
        mcpKeyId: scope.keyId,
      });
      if (!result.ok) return refusal(result);
      return written(result.data);
    }
  );

  server.registerTool(
    "minddy_edit_page_text",
    {
      title: "Edit page text",
      description:
        "Rewrite ONE passage of a page IN PLACE, the way a code editor patches a " +
        "file: old_string → new_string, copied VERBATIM from minddy_get_page, and " +
        "the match must be unique (add the surrounding lines, or set replace_all). " +
        "Every other byte is left alone. This is how a sentence gets corrected or " +
        "a section rewritten without re-emitting the whole page — and it is the " +
        "safe way round: a full rewrite silently overwrites whatever someone else " +
        "changed meanwhile, a stale old_string fails loudly. To ADD text use " +
        "minddy_append_to_page. Returns a unified diff of what changed.",
      inputSchema: z.object({
        project_id: PROJECT_ID,
        page_id: PAGE_ID,
        old_string: z
          .string()
          .min(1)
          .describe(
            "The exact passage to replace, copied VERBATIM from the markdown " +
              "minddy_get_page returned — whitespace and line breaks included."
          ),
        new_string: z
          .string()
          .describe("What replaces it. An empty string deletes the passage."),
        replace_all: z
          .boolean()
          .optional()
          .describe(
            "Replace EVERY occurrence instead of requiring a unique match " +
              "(default false). Use it for a term repeated throughout the page."
          ),
      }),
      annotations: WRITE,
    },
    async (args, extra) => {
      const scope = await requireProject(extra, args.project_id);
      if ("error" in scope) return scope.error;
      const result = await editPageTextForAgent({
        pageId: args.page_id,
        projectId: scope.access.project.id,
        actorId: scope.userId,
        oldString: args.old_string,
        newString: args.new_string,
        replaceAll: args.replace_all ?? false,
        tools: {
          read: "minddy_get_page",
          replaceWhole: "minddy_update_page { markdown }",
        },
        mcpKeyId: scope.keyId,
      });
      if (!result.ok) return refusal(result);
      return written(trimDiff(result.data));
    }
  );

  server.registerTool(
    "minddy_add_page_comment",
    {
      title: "Comment on a page",
      description:
        "Say something ABOUT a page without touching a single byte of it: answer " +
        "an open thread, raise an objection, explain why you did not do what the " +
        "page asks. This is the one page write that is not an edit, and it is " +
        "often the right one — when a passage looks wrong, a comment asks the " +
        "person who wrote it; an edit overwrites them. Anchor it to a BLOCK by " +
        "passing the block_id of a thread you read in minddy_get_page's " +
        "threads, and reply inside that thread by passing its thread_id as " +
        "parent_comment_id. Never " +
        "invent a block_id: they are not in the markdown, and a made-up one " +
        "produces a thread pointing at nothing. Omit both to comment on the page " +
        "as a whole. The page's author and everyone already in the thread are " +
        "notified.",
      inputSchema: z.object({
        project_id: PROJECT_ID,
        page_id: PAGE_ID,
        body: z
          .string()
          .min(1)
          .describe(
            "The comment, in markdown. Short and specific — it is read next to " +
              "the text it is about, not instead of it."
          ),
        block_id: z
          .string()
          .optional()
          .describe(
            "Anchor the comment to that block, copied VERBATIM from the " +
              "threads of minddy_get_page. Omit to comment on the whole page."
          ),
        parent_comment_id: z
          .string()
          .uuid()
          .optional()
          .describe(
            "Reply INSIDE an existing thread instead of opening a new one: the " +
              "thread_id of a thread you read in minddy_get_page. The reply " +
              "inherits the thread's anchor, so block_id is then ignored."
          ),
      }),
      annotations: WRITE,
    },
    async (args, extra) => {
      const scope = await requireProject(extra, args.project_id);
      if ("error" in scope) return scope.error;
      const result = await addPageCommentForAgent({
        pageId: args.page_id,
        projectId: scope.access.project.id,
        actorId: scope.userId,
        body: args.body,
        blockId: args.block_id ?? null,
        parentCommentId: args.parent_comment_id ?? null,
        // The key that writes NAME the agent: the thread says “Claude Code (mcp)”, not
        // the name of the key holder (minddy's identity rule).
        mcpKeyId: scope.keyId,
      });
      if (!result.ok) return refusal(result);
      return written(result.data);
    }
  );
}

/** Ceiling of the returned diff: enough to confirm that the edition landed in the correct
 place, without re-transporting the document that we have just avoided rewriting
 (same limit as minddy_edit_issue_text). */
const MAX_EDIT_DIFF_CHARS = 2000;

function trimDiff<T extends { diff: string; page_id: string }>(data: T) {
  if (data.diff.length <= MAX_EDIT_DIFF_CHARS) return data;
  return {
    ...data,
    diff: `${data.diff.slice(0, MAX_EDIT_DIFF_CHARS)}\n…`,
    diff_truncated: true,
  };
}

/** The kernel return type, re-exported for test adapters. */
export type { PageToolResult };

import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { signedAttachmentUrl } from "@/lib/server/attachments";
import { isInlineSafeMimeType } from "@/lib/inline-safe";
import { pageFileIdFromSrc } from "@/lib/page-files";
import { descendantIds } from "@/lib/pages";
import {
  getPublicPageShareByToken,
  type PublicPageShareContext,
} from "@/lib/server/view-shares";

/**
 * What a PUBLISHED PAGE shows to someone who doesn't have an account
 * (MIN-283) — and, just as importantly, what it doesn't show.
 *
 * Making the page public is not a second view of the page: it's the SAME surface
 * (the editor set up as read-only), fed by a document from which we have removed
 * everything that would lead elsewhere. This module is that place, and it is the
 * alone:
 *
 * - SUBPAGES are only resolved in the PUBLISHED SET (the single page,
 * or its branch when `include_children`). A subpage outside this
 * set is not "hidden": its title simply does not come out
 * from here, and the block becomes inert on the client side for lack of knowing what to say about it.
 * A block which displays "2027 price specification" crossed out is already a leak;
 * - the FILES and IMAGES (MIN-280) are served by signed URLs
 * placed HERE, when rendered, and only for files on published pages.
 * The bucket remains private and the application route (`/api/projects/…`), it,
 * remains closed to anonymous visitors: it is the document that travels with
 * its addresses, not the door that opens;
 * - the MENTIONS have nothing to neutralize, and it is the model which offers it:
 * a mention is TEXT in the document, the pill not being put back until
 * reading by the surface which has the sources (MIN-269). Making it public
 * does not give them to him, so “@Clément” remains “@Clément” — without avatar,
 * without link, without learning anything from the project.
 */

/** A page from the published set, as the renderer calls it. */
export interface PublicPageNode {
  id: string;
  parent_id: string | null;
  title: string;
  icon: string | null;
}

export interface PublicPageBundle {
  share: PublicPageShareContext["share"];
  project: PublicPageShareContext["project"];
  /** The ROOT page of the publication — the one that the token designates. */
  root: PublicPageNode;
  /** The page actually rendered (the root, or a page from its branch). */
  page: PublicPageNode & { updated_at: string };
  /** The body, file addresses already signed. */
  content: unknown;
  /** The entire published set: what the subpage blocks have the right to name. */
  pages: PublicPageNode[];
  /** The path from the published root to the rendered page (excluded). */
  trail: PublicPageNode[];
}

/** Lifespan of the signed URLs of a published page.
 *
 * Much longer than the ten minutes of the application gate: these URLs are
 * placed in a document that is read in one go, that is printed in PDF, and
 * that a tab can keep open for a day. Much shorter, however,
 * than "indefinitely" — a signed URL that leaks outside the published page should eventually become of no use. Twenty-four hours is the compromise, and the
 * rendering is made for each request, a reload when installing new ones. */
const PUBLIC_FILE_URL_TTL_SECONDS = 24 * 3600;

/**
 * The bundle of a published page, or `null` (→ 404).
 *
 * `pageId` designates a page of the published BRANCH: this is how we navigate
 * from a published page to its subpages without never forge a second token. A
 * page outside the branch — or an unpublished branch — returns `null`, like a
 * unknown token: the visitor does not learn that it exists.
 */
export async function getPublicPageBundle(
  token: string,
  pageId?: string
): Promise<PublicPageBundle | null> {
  const ctx = await getPublicPageShareByToken(token);
  if (!ctx) return null;

  const service = getServiceClient();
  const root: PublicPageNode = {
    id: ctx.page.id,
    parent_id: ctx.page.parent_id,
    title: ctx.page.title,
    icon: ctx.page.icon,
  };

  // All published. Without `include_children`, it fits on one page — and that's
  // the guarantee that counts: no child's title is even READ.
  let pages: PublicPageNode[] = [root];
  if (ctx.share.include_children) {
    const { data } = await service
      .from("pages")
      .select("id, parent_id, title, icon, position")
      .eq("project_id", ctx.project.id)
      .is("deleted_at", null);
    const all = (data ?? []) as Array<PublicPageNode & { position: string }>;
    const inBranch = descendantIds(all, root.id);
    pages = [
      root,
      ...all
        .filter((p) => inBranch.includes(p.id))
        .map((p) => ({ id: p.id, parent_id: p.parent_id, title: p.title, icon: p.icon })),
    ];
  }

  const targetId = pageId ?? root.id;
  if (!pages.some((p) => p.id === targetId)) return null;

  const { data: pageRow } = await service
    .from("pages")
    .select("id, parent_id, title, icon, content, updated_at")
    .eq("id", targetId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!pageRow) return null;

  const publishedIds = new Set(pages.map((p) => p.id));
  const content = await signPublicFileUrls(pageRow.content, publishedIds);

  return {
    share: ctx.share,
    project: ctx.project,
    root,
    page: {
      id: pageRow.id as string,
      parent_id: (pageRow.parent_id as string | null) ?? null,
      title: (pageRow.title as string) ?? "",
      icon: (pageRow.icon as string | null) ?? null,
      updated_at: pageRow.updated_at as string,
    },
    content,
    pages,
    trail: trailWithin(pages, root.id, targetId),
  };
}

/**
 * The path from the published root to `pageId`, the rendered page excluded.
 *
 * It NEVER goes back above the root: the breadcrumbs of a published page
 * say nothing about where in the wiki it came from comes.
 */
function trailWithin(
  pages: PublicPageNode[],
  rootId: string,
  pageId: string
): PublicPageNode[] {
  const byId = new Map(pages.map((p) => [p.id, p]));
  const trail: PublicPageNode[] = [];
  let current = byId.get(pageId)?.parent_id ?? null;
  while (current) {
    const node = byId.get(current);
    if (!node) break;
    trail.unshift(node);
    if (node.id === rootId) break;
    current = node.parent_id;
  }
  return trail;
}

/**
 * The `src` of body files, replaced with signed URLs.
 *
 * Traversal is blind to node type, like `pageFileIdsInBody`: any
 * attribute that looks like the address of a page file counts, and a block de
 * more who would carry one is covered in advance.
 *
 * A file whose page is NOT published has its `src` removed rather than
 * left as is: the application URL would not respond to an
 * anonymous visitor anyway, but it would say the project and the file identifier.
 * The block then makes itself "unavailable", which it already knows how to do.
 */
export async function signPublicFileUrls(
  content: unknown,
  publishedPageIds: Set<string>
): Promise<unknown> {
  const ids = new Set<string>();
  walkSrc(content, (src) => {
    const id = pageFileIdFromSrc(src);
    if (id) ids.add(id);
    return undefined;
  });
  if (ids.size === 0) return content;

  const service = getServiceClient();
  const { data } = await service
    .from("page_files")
    .select("id, page_id, storage_path, file_name, mime_type")
    .in("id", [...ids]);

  const signed = new Map<string, string>();
  type FileRow = {
    id: string;
    page_id: string;
    storage_path: string;
    file_name: string;
    mime_type: string | null;
  };
  await Promise.all(
    ((data ?? []) as FileRow[]).map(async (row) => {
      if (!publishedPageIds.has(row.page_id)) return;
      const url = await signedAttachmentUrl(service, row.storage_path, {
        expiresIn: PUBLIC_FILE_URL_TTL_SECONDS,
        // An IMAGE must be displayed in the document; everything else is one
        // file that we are looking for, and its block is a button
        // download (blocks/file-view.tsx). The arrangement is decided upon
        // SIGNATURE: adding it as a parameter afterwards would not sign anything.
        //
        // “Image” in the sense of the allowlist and not of the `image/` prefix: a page
        // published is readable by anyone, and a `image/svg+xml` is a
        // executable document, not an image (MIN-340).
        download: isInlineSafeMimeType(row.mime_type) ? false : row.file_name,
        mimeType: row.mime_type,
      });
      if (url) signed.set(row.id, url);
    })
  );

  return walkSrc(content, (src) => {
    const id = pageFileIdFromSrc(src);
    if (!id) return undefined;
    return signed.get(id) ?? null;
  });
}

/**
 * Copies the document replacing the strings that `map` rewrites — `undefined`
 * leaves the value in place, `null` removes the attribute.
 *
 * A COPY and not a mutation: the document comes from a reading, and nothing says it's not shared with a query cache.
 */
function walkSrc(
  node: unknown,
  map: (src: string) => string | null | undefined
): unknown {
  if (Array.isArray(node)) return node.map((child) => walkSrc(child, map));
  if (!node || typeof node !== "object") return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (typeof value === "string") {
      const replaced = map(value);
      if (replaced === undefined) out[key] = value;
      else if (replaced !== null) out[key] = replaced;
      else out[key] = null;
    } else if (value && typeof value === "object") {
      out[key] = walkSrc(value, map);
    } else {
      out[key] = value;
    }
  }
  return out;
}

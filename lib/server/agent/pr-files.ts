import "server-only";

import { NextResponse } from "next/server";
import { imageMimeType } from "@/lib/diff-binary";
import { isForgeAssetId, SIGNED_ASSET_HOST } from "@/lib/forge-image-assets";
import type { PullRequestFile } from "@/lib/pull-request-contract";
import { forgeErrorResponse } from "./pr-access";
import type { PrScope } from "./pr-scope";

/** Path that addresses the base version: the old name if the file has been renamed. */
export function basePathOf(file: PullRequestFile): string {
  return file.previous_filename ?? file.filename;
}

/**
 * Plain text of a file at the merge base, used when expanding context in the
 * diff view. The path is validated against this diff's files; otherwise the
 * route could read any file in the repository.
 */
export async function prFileSourceResponse(
  scope: PrScope,
  path: string,
): Promise<NextResponse> {
  const { forge, call } = scope;
  try {
    const [pr, diff] = await Promise.all([
      forge.getPullRequest(call),
      forge.listPullRequestFiles(call),
    ]);
    const files = diff.files;
    const base = pr.base;
    const head = pr.headSha ?? pr.head;
    if (!base || !head) {
      return NextResponse.json({ error: "Pull request has no base or head" }, { status: 409 });
    }

    // An added file has no base version; its patch already represents the
    // entire file.
    const file = files.find((f) => basePathOf(f) === path);
    if (!file || file.status === "added") {
      return NextResponse.json({ error: "File not found in this diff" }, { status: 404 });
    }

    const ref = await forge.getMergeBaseSha({ ...call, base, head });
    const content = await forge.getFileAtRef({
      token: call.token,
      repoFullName: call.repoFullName,
      path,
      ref,
    });
    if (content === null) {
      return NextResponse.json({ error: "File not found at merge base" }, { status: 404 });
    }
    return NextResponse.json({ content });
  } catch (err) {
    return forgeErrorResponse(err);
  }
}

/** Side of the diff whose bytes we want: before the PR, or after. */
export type FileSide = "base" | "head";

/** The diff view shows icons and screenshots, not masters: a heavier image opens on the forge. */
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/** The proxied image response with its security headers, shared by every diff image route. */
export function imageBytesResponse(
  bytes: ArrayBuffer,
  contentType: string,
  /** Does the ref read move under the URL? True when we read a BRANCH (run
      alive) rather than an SHA — the response is then not cacheable. */
  moving = false,
): NextResponse {
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "Image too large to preview" }, { status: 413 });
  }
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(bytes.byteLength),
      // `private`: read with an installation token from an often private
      // repository, so never in a shared cache. The ref is a SHA (or the
      // merge base, fixed while the PR does not move): the content at this
      // URL does not change.
      "Cache-Control": moving ? "private, no-store" : "private, max-age=3600",
      // A repository image must not open as a document of our origin:
      // `nosniff` keeps the type from the extension, and `attachment` stops an
      // SVG opened directly from running in our context (inside the diff
      // view's `<img>` it still renders: the header only governs navigation).
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "attachment",
    },
  });
}

/**
 * Bytes of a diff file on either side (MIN-66), to show a changed image
 * instead of an unavailable diff.
 *
 * A proxy, not a direct link: repositories are private,
 * `raw.githubusercontent.com` answers 404 without a token, and an `<img src>`
 * cannot carry one, so the installation token stays on the server.
 *
 * Three guards, in order: the path must be a file of this diff (otherwise the
 * route could read any file of the repository), the extension must be a known
 * image (the served MIME type comes from it, never from the forge), and the
 * size must fit under `MAX_IMAGE_BYTES`.
 */
export async function prFileBytesResponse(
  scope: PrScope,
  filename: string,
  side: FileSide,
): Promise<NextResponse> {
  const { forge, call } = scope;

  const contentType = imageMimeType(filename);
  if (!contentType) {
    return NextResponse.json({ error: "Not a previewable image" }, { status: 415 });
  }

  try {
    const [pr, diff] = await Promise.all([
      forge.getPullRequest(call),
      forge.listPullRequestFiles(call),
    ]);
    const file = diff.files.find((f) => f.filename === filename);
    if (!file) {
      return NextResponse.json({ error: "File not found in this diff" }, { status: 404 });
    }

    // An added file has no base side and a removed one no head side: a plain
    // 404, which the caller shows as "nothing before" or "nothing after".
    if (side === "base" && file.status === "added") {
      return NextResponse.json({ error: "File has no base version" }, { status: 404 });
    }
    if (side === "head" && file.status === "removed") {
      return NextResponse.json({ error: "File has no head version" }, { status: 404 });
    }

    let ref: string;
    if (side === "head") {
      // The head SHA, not the branch name: a branch moves under the browser
      // cache, a SHA does not, which keeps the URL immutable.
      const head = pr.headSha ?? pr.head;
      if (!head) {
        return NextResponse.json({ error: "Pull request has no head" }, { status: 409 });
      }
      ref = head;
    } else {
      const base = pr.base;
      const head = pr.headSha ?? pr.head;
      if (!base || !head) {
        return NextResponse.json({ error: "Pull request has no base or head" }, { status: 409 });
      }
      ref = await forge.getMergeBaseSha({ ...call, base, head });
    }

    const path = side === "base" ? basePathOf(file) : file.filename;
    const bytes = await forge.getFileBytesAtRef({
      token: call.token,
      repoFullName: call.repoFullName,
      path,
      ref,
    });
    if (bytes === null) {
      return NextResponse.json({ error: "File not found at this ref" }, { status: 404 });
    }
    return imageBytesResponse(bytes, contentType);
  } catch (err) {
    return forgeErrorResponse(err);
  }
}

/**
 * Serves an image pasted into a PR comment (MIN-162).
 *
 * The thread's `<img>` cannot load it itself: the URL in the markdown
 * (`github.com/user-attachments/assets/<uuid>`) answers 404 without a GitHub
 * session, which minddy does not have, App tokens included (measured; see
 * `lib/forge-image-assets`). Only GitHub's rendered body carries a servable
 * signed URL, valid for 300 s, so it is asked for again on every load.
 *
 * The parameter is an identifier, never a URL: this route fetches on the
 * server, and a client-chosen target would make it an open SSRF relay. Hence
 * three locks: the id must look like a uuid, the URL must come from what
 * GitHub rendered for this PR, and its host is checked again before the
 * fetch. The MIME type follows the path's extension, never the host's.
 *
 * Read on the installation token, like every PR read.
 */
export async function prCommentImageResponse(
  scope: PrScope,
  asset: string,
): Promise<NextResponse> {
  if (!isForgeAssetId(asset)) {
    return NextResponse.json({ error: "Invalid asset id" }, { status: 400 });
  }
  try {
    const assets = await scope.forge.listImageAssets(scope.call);
    const url = assets.get(asset.toLowerCase());
    // Nothing of that name in this PR: 404, not a fetch. This lock keeps a
    // caller from choosing what the server fetches.
    if (!url) return NextResponse.json({ error: "Image not found" }, { status: 404 });

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return NextResponse.json({ error: "Image not found" }, { status: 404 });
    }
    if (parsed.protocol !== "https:" || parsed.hostname !== SIGNED_ASSET_HOST) {
      return NextResponse.json({ error: "Image not found" }, { status: 404 });
    }
    const contentType = imageMimeType(parsed.pathname);
    if (!contentType) {
      return NextResponse.json({ error: "Not a previewable image" }, { status: 415 });
    }

    // No authorization header: the signed URL is the credential, and an
    // installation token would only leak.
    const res = await fetch(parsed.toString());
    if (!res.ok) {
      return NextResponse.json({ error: "Image unavailable" }, { status: 502 });
    }
    return imageBytesResponse(await res.arrayBuffer(), contentType);
  } catch (err) {
    return forgeErrorResponse(err);
  }
}

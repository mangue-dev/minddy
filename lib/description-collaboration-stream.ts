"use client";

// The ProseMirror half of a description's live session (MIN-728, MIN-832):
// the document schema, the step stream and its transport. Kept apart from
// lib/use-description-collaboration.ts, which loads it on demand: the schema
// is the full block catalog, and every route hosting a description (both
// boards' issue panel, triage, objectives, feedback) pulled tiptap,
// prosemirror and the block views into its first load for it (MIN-875). The
// hook reads the snapshot and this module in parallel.

import { getSchema } from "@tiptap/core";
import { Node as PMNode, type Schema } from "@tiptap/pm/model";

import { pageExtensions } from "@/components/pages/page-extensions";
import { MENTION_HYDRATION_META } from "@/components/markdown-mention";
import {
  CollabFatalError,
  CollabStream,
  type CollabStreamOptions,
  type CollabTransport,
} from "./page-collaboration-stream";
import type {
  CollabCatchUp,
  CollabSubmission,
  CollabSubmitResult,
  PageCollaborationSnapshot,
} from "./page-collaboration";
import {
  descriptionCollaborationUrl,
  type DescriptionCatchUp,
  type DescriptionKind,
  type DescriptionSnapshot,
} from "./description-collaboration";
import { mergeDocs, type PageDocJSON } from "./pages-merge";

export { caretColor } from "@/components/pages/page-collaboration";
export { COLLAB_BEACON_MAX_BYTES } from "./page-collaboration-stream";

let documentSchemaCache: Schema | null = null;

/** The description schema, for a stream with no editor attached. */
function documentSchema(): Schema {
  documentSchemaCache ??= getSchema(pageExtensions({ headless: true, blocks: "document" }));
  return documentSchemaCache;
}

class DescriptionApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

async function readJson<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null);
  if (!response.ok && response.status !== 409 && response.status !== 422) {
    throw new DescriptionApiError(response.status,
      (data as { error?: string } | null)?.error ?? "Request failed");
  }
  return data as T;
}

const endpoint = descriptionCollaborationUrl;

/** The stream reads a page-shaped snapshot: a description is its body. */
function asStreamSnapshot(snapshot: DescriptionSnapshot): PageCollaborationSnapshot {
  return {
    protocol: snapshot.protocol,
    pageId: snapshot.documentId,
    projectId: snapshot.projectId,
    body: { revision: snapshot.revision, doc: snapshot.doc },
    title: { revision: 0, text: "" },
    version: 0,
    updatedAt: "",
  };
}

function transportFor(kind: DescriptionKind, id: string): CollabTransport {
  const fatal = (error: unknown) =>
    error instanceof DescriptionApiError && [401, 403, 404].includes(error.status)
      ? new CollabFatalError(error.message)
      : error;
  const post = (submission: CollabSubmission, keepalive = false) =>
    fetch(endpoint(kind, id), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(submission),
      keepalive,
    });
  return {
    steps: async (_field, since): Promise<CollabCatchUp> => {
      try {
        const answer = await readJson<DescriptionCatchUp>(
          await fetch(`${endpoint(kind, id)}?since=${since}`, { cache: "no-store" }));
        return answer.kind === "reset"
          ? { kind: "reset", reason: answer.reason, snapshot: asStreamSnapshot(answer.snapshot) }
          : answer;
      } catch (error) {
        throw fatal(error);
      }
    },
    submit: async (submission): Promise<CollabSubmitResult> => {
      try {
        return await readJson<CollabSubmitResult>(await post(submission));
      } catch (error) {
        throw fatal(error);
      }
    },
    beacon: (submission) => {
      void post(submission, true).catch(() => {});
    },
  };
}

/** The stream of one description, from its snapshot. */
export function createDescriptionStream({ kind, id, snapshot, ...callbacks }: {
  kind: DescriptionKind;
  id: string;
  snapshot: DescriptionSnapshot;
} & Pick<CollabStreamOptions, "clientId" | "canSend" | "onRefused" | "onFatal" | "onDiscarded" | "onAttached">): CollabStream {
  return new CollabStream({
    field: "body",
    revision: snapshot.revision,
    transport: transportFor(kind, id),
    schema: documentSchema,
    docFromSnapshot: (next, schema) => PMNode.fromJSON(schema, next.body.doc),
    toJSON: (doc) => doc.toJSON(),
    fromJSON: (schema, json) => PMNode.fromJSON(schema, json),
    // A reset with local work keeps it block by block; contested blocks
    // keep the local version (descriptions have no conflict banner).
    merge: (base, mine, theirs) => {
      const merged = mergeDocs(base.toJSON() as PageDocJSON, mine.toJSON() as PageDocJSON,
        theirs.toJSON() as PageDocJSON);
      try {
        return { doc: PMNode.fromJSON(mine.type.schema, merged.doc) };
      } catch {
        return { doc: mine };
      }
    },
    isPresentation: (origin) => origin.getMeta(MENTION_HYDRATION_META) === true,
    ...callbacks,
  });
}

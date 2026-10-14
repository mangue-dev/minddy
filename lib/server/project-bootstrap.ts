import "server-only";

import type { MembersResponse, Objective } from "@/lib/types";
import {
  loadProjectMembers,
  loadProjectObjectives,
  type ProjectWorkingSetAuth,
} from "./project-working-set-readers";

export type ProjectBootstrapReader = "objectives" | "members";
type ProjectBootstrapData = {
  objectives: Objective[];
  members: MembersResponse;
};
export type ProjectBootstrapFrame = {
  [Reader in ProjectBootstrapReader]:
    | { version: 1; reader: Reader; ok: true; data: ProjectBootstrapData[Reader] }
    | { version: 1; reader: Reader; ok: false; status: 404 | 500; error: string };
}[ProjectBootstrapReader];

/** Only the two complete ordinary readers are admitted by this increment. */
export function parseProjectBootstrapReaders(value: string | null): ProjectBootstrapReader[] | null {
  if (!value) return null;
  const readers = value.split(",");
  if (readers.length > 2 || new Set(readers).size !== readers.length ||
      readers.some((reader) => reader !== "objectives" && reader !== "members")) return null;
  return readers as ProjectBootstrapReader[];
}

/**
 * Share admission only within this request. Each complete DTO is delivered as
 * soon as its ordinary reader finishes, independently of the other reader.
 */
export function createProjectBootstrapStream({
  auth, projectId, readers, signal, translateError,
}: {
  auth: ProjectWorkingSetAuth;
  projectId: string;
  readers: ProjectBootstrapReader[];
  signal: AbortSignal;
  translateError: (key: "databaseError" | "projectNotFound") => string;
}): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let disposed = false;
  let removeAbortListener = () => {};
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const close = () => {
        if (disposed) return;
        disposed = true;
        removeAbortListener();
        controller.close();
      };
      const onAbort = () => close();
      signal.addEventListener("abort", onAbort, { once: true });
      removeAbortListener = () => signal.removeEventListener("abort", onAbort);
      if (signal.aborted) {
        close();
        return;
      }
      // The validated reader set bounds request fan-out to two. Already admitted
      // ordinary SQL reads may finish after cancellation; no result is delivered.
      void Promise.all(readers.map(async (reader) => {
        let frame: ProjectBootstrapFrame;
        try {
          if (reader === "objectives") {
            const result = await loadProjectObjectives(auth, projectId);
            frame = result.ok
              ? { version: 1, reader, ok: true, data: result.data }
              : { version: 1, reader, ok: false, status: result.status, error: translateError(result.errorKey) };
          } else {
            const result = await loadProjectMembers(auth, projectId);
            frame = result.ok
              ? { version: 1, reader, ok: true, data: result.data }
              : { version: 1, reader, ok: false, status: result.status, error: translateError(result.errorKey) };
          }
          if (!disposed) controller.enqueue(encoder.encode(`${JSON.stringify(frame)}\n`));
        } catch {
          if (disposed) return;
          // Ordinary readers report 404/500 themselves. Unexpected exceptions
          // fail only their own reader and never expose private database details.
          controller.enqueue(encoder.encode(`${JSON.stringify({
            version: 1, reader, ok: false, status: 500, error: translateError("databaseError"),
          } satisfies ProjectBootstrapFrame)}\n`));
        }
      })).then(close).catch(() => {
        if (disposed) return;
        disposed = true;
        removeAbortListener();
        controller.error(new Error("Project bootstrap stream failed"));
      });
    },
    cancel() {
      disposed = true;
      removeAbortListener();
    },
  });
}

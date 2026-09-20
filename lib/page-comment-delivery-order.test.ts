import { expect, it } from "vitest";
import { arrangeThreads, type PageComment } from "./page-comments";

it("orders server and optimistic timestamps by time while preserving equal-time arrival order", () => {
  const root: PageComment = {
    id: "server", page_id: "page-1", project_id: "project-1", block_id: null,
    quote: null, body: "First", author_id: "author-1", parent_id: null,
    created_at: "2026-09-20T12:00:00Z", updated_at: "2026-09-20T12:00:00Z",
  };
  const sameInstant = { ...root, id: "optimistic", created_at: "2026-09-20T12:00:00.000Z" };
  const earlier = { ...root, id: "earlier", created_at: "2026-09-20T13:59:59.999+02:00" };
  expect(arrangeThreads([root, sameInstant, earlier], new Set()).map((thread) => thread.root.id))
    .toEqual(["earlier", "server", "optimistic"]);
});

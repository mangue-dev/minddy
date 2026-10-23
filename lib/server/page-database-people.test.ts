import { beforeEach, expect, it, vi } from "vitest";

const insert = vi.hoisted(() => vi.fn());
vi.mock("@/lib/server/notifications", () => ({ insertNotifications: insert }));
import { notifyAddedPeople } from "./page-database-people";

const owners = { id: "10000000-0000-4000-8000-000000000001", name: "Owners", type: "people" as const };
const reviewers = { ...owners, id: "10000000-0000-4000-8000-000000000002", name: "Reviewers" };
const notes = { id: "10000000-0000-4000-8000-000000000003", name: "Notes", type: "text" as const };

beforeEach(() => insert.mockReset());

it("notifies each newly added member once across every people cell of a write", async () => {
  await notifyAddedPeople({} as never, {
    projectId: "project", pageId: "entry", actorId: "actor",
    schema: [owners, reviewers, notes],
    changes: [
      { propertyId: owners.id, value: ["ana", "ben", "actor"], expected: ["ben"] },
      { propertyId: reviewers.id, value: ["ana", "carl"], expected: null },
      { propertyId: notes.id, value: "dana", expected: null },
    ],
  });
  expect(insert.mock.calls[0][1].map((row: { user_id: string }) => row.user_id)).toEqual(["ana", "carl"]);
  expect(insert.mock.calls[0][1][0]).toMatchObject({ type: "page_mention", page_id: "entry", actor_id: "actor" });
});

import { describe, expect, it } from "vitest";
import {
  mentionAttrsFromOption,
  mentionAttrsFromScanned,
} from "@/lib/mention-attributes";

describe("markdown mention attributes", () => {
  it("keeps a selected page emoji on the editor node", () => {
    expect(
      mentionAttrsFromOption({
        type: "page",
        id: "page-1",
        label: "Launch guide",
        icon: "🚀",
      }),
    ).toMatchObject({
      mentionType: "page",
      mentionId: "page-1",
      icon: "🚀",
    });
  });

  it("rebuilds a project node with its orb seed and favicon", () => {
    expect(
      mentionAttrsFromScanned({
        type: "project",
        project: {
          id: "project-1",
          name: "Minddy Website",
          key: "MIN",
          avatarSeed: "orb-seed",
          iconUrl: "https://example.com/icon.png",
        },
      }),
    ).toEqual({
      mentionType: "project",
      mentionId: "project-1",
      mentionLabel: "Minddy Website",
      seed: "orb-seed",
      color: null,
      icon: "https://example.com/icon.png",
      status: null,
    });
  });

  it("keeps an issue status when rebuilding its editor node", () => {
    expect(
      mentionAttrsFromScanned({
        type: "issue",
        issue: {
          id: "issue-1",
          project_id: "project-1",
          identifier: "MIN-1",
          title: "Use the status figure",
          status: "done",
        },
      }),
    ).toMatchObject({ mentionType: "issue", status: "done" });
  });
});

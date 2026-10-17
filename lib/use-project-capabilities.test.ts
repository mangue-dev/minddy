import { describe, expect, it } from "vitest";
import { capabilitiesForProject } from "./use-project-capabilities";

const project = (fields: Partial<{ my_role: "owner" | "member" | "reader"; my_can_comment: boolean }>) => ({
  owner_id: "owner-id",
  ...fields,
});

describe("capabilitiesForProject", () => {
  it("follows the role the project list reports", () => {
    expect(capabilitiesForProject(project({ my_role: "owner" }), "someone")).toMatchObject({
      canWrite: true,
      canComment: true,
      canAdmin: true,
    });
    expect(capabilitiesForProject(project({ my_role: "member" }), "someone")).toMatchObject({
      canWrite: true,
      canComment: true,
      canAdmin: false,
    });
  });

  it("keeps readers read-only, commenting only with their option", () => {
    expect(capabilitiesForProject(project({ my_role: "reader" }), "reader-id")).toMatchObject({
      canWrite: false,
      canComment: false,
    });
    expect(
      capabilitiesForProject(project({ my_role: "reader", my_can_comment: true }), "reader-id")
    ).toMatchObject({ canWrite: false, canComment: true });
  });

  it("never restricts before the role is known", () => {
    expect(capabilitiesForProject(project({}), "owner-id")).toMatchObject({
      role: "owner",
      canAdmin: true,
    });
    expect(capabilitiesForProject(project({}), "someone")).toMatchObject({
      role: "member",
      canWrite: true,
    });
    expect(capabilitiesForProject(null, null).canWrite).toBe(true);
  });
});

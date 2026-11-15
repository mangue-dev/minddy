import { describe, expect, it } from "vitest";
import {
  githubCapabilityFromRepo,
  gitlabCapabilityFromProject,
} from "./repo-capability";

/**
 * An account's access to a repository (MIN-144), read from the ACTUAL payloads
 * of both forges. This verdict decides whether minddy offers "Merge" or
 * explains why it does not. Getting it wrong means either a button that fails
 * with a 403, or an action withheld from someone entitled to it.
 */

describe("githubCapabilityFromRepo", () => {
  it("gives write to anyone who can push", () => {
    expect(
      githubCapabilityFromRepo({
        full_name: "acme/app",
        permissions: { admin: false, maintain: false, push: true, triage: true, pull: true },
      }),
    ).toBe("write");
  });

  it("gives write to an admin (an org owner does not always have explicit push)", () => {
    expect(
      githubCapabilityFromRepo({ permissions: { admin: true, push: false, pull: true } }),
    ).toBe("write");
  });

  it("gives read for a public repository without write access", () => {
    expect(
      githubCapabilityFromRepo({
        permissions: { admin: false, maintain: false, push: false, triage: false, pull: true },
      }),
    ).toBe("read");
  });

  it("does not promote to write when `permissions` is missing", () => {
    expect(githubCapabilityFromRepo({ full_name: "acme/app" })).toBe("read");
    expect(githubCapabilityFromRepo(null)).toBe("read");
    // A 404 never gets here (the caller stops earlier), but its body must
    // certainly not read as an access right.
    expect(githubCapabilityFromRepo({ message: "Not Found" })).toBe("read");
  });
});

describe("gitlabCapabilityFromProject", () => {
  it("gives write to a Developer (30)", () => {
    expect(
      gitlabCapabilityFromProject({
        id: 42,
        permissions: { project_access: { access_level: 30 }, group_access: null },
      }),
    ).toBe("write");
  });

  it("gives write to a Maintainer (40)", () => {
    expect(
      gitlabCapabilityFromProject({
        permissions: { project_access: { access_level: 40 }, group_access: null },
      }),
    ).toBe("write");
  });

  it("gives read to a Reporter (20)", () => {
    expect(
      gitlabCapabilityFromProject({
        permissions: { project_access: { access_level: 20 }, group_access: null },
      }),
    ).toBe("read");
  });

  it("uses the MAX of the project and group", () => {
    // Common case: group Maintainer, no direct access to the project.
    expect(
      gitlabCapabilityFromProject({
        permissions: { project_access: null, group_access: { access_level: 40 } },
      }),
    ).toBe("write");
    expect(
      gitlabCapabilityFromProject({
        permissions: {
          project_access: { access_level: 20 },
          group_access: { access_level: 30 },
        },
      }),
    ).toBe("write");
  });

  it("gives read when `permissions` is missing or empty (public project)", () => {
    expect(gitlabCapabilityFromProject({ id: 42 })).toBe("read");
    expect(
      gitlabCapabilityFromProject({
        permissions: { project_access: null, group_access: null },
      }),
    ).toBe("read");
    expect(gitlabCapabilityFromProject(null)).toBe("read");
  });
});

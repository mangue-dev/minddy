import { describe, expect, it } from "vitest";
import {
  githubCapabilityFromRepo,
  gitlabCapabilityFromProject,
} from "./repo-capability";

/**
 * The right of an account lies on a deposit (MIN-144), read on the ACTUAL charges
 * of the two forges. It's this verdict that decides whether minddy offers "Merge" or
 * explains why he doesn't offer it — to be wrong here, it's either a button that
 * fails in 403, or a gesture taken away from someone who was entitled to it.
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
    // A 404 never passes by here (the caller cuts before), but its body
    // ne doit surtout pas se lire comme un droit.
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
    // Common case: Maintainer of the group, no direct access to the project.
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

  it("donne read quand `permissions` est absent ou vide (projet public)", () => {
    expect(gitlabCapabilityFromProject({ id: 42 })).toBe("read");
    expect(
      gitlabCapabilityFromProject({
        permissions: { project_access: null, group_access: null },
      }),
    ).toBe("read");
    expect(gitlabCapabilityFromProject(null)).toBe("read");
  });
});

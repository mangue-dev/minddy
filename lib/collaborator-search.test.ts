import { describe, expect, it } from "vitest";
import { matchCollaborators } from "./collaborator-search";
import type { Collaborator } from "./types";

const person = (id: string, email: string, full_name: string | null): Collaborator =>
  ({ user_id: id, email, full_name, avatar_seed: `seed-${id}` });
const ana = person("u-ana", "ana@example.com", "Ana Costa");
const bo = person("u-bo", "bo@example.com", "Bo Lind");
const cy = person("u-cy", "cy.handle@example.com", null);

describe("matchCollaborators", () => {
  it("matches the name or the address, ignoring case and surrounding spaces", () => {
    expect(matchCollaborators([ana, bo, cy], "  COSTA ")).toEqual([ana]);
    expect(matchCollaborators([ana, bo, cy], "cy.handle")).toEqual([cy]);
    expect(matchCollaborators([ana, bo, cy], "zzz")).toEqual([]);
  });

  it("leaves out people already queued, invited or members", () => {
    expect(matchCollaborators([ana, bo, cy], "", { userIds: ["u-ana"], emails: ["BO@example.com"] })).toEqual([cy]);
  });

  it("proposes the first ones for an empty query, up to the limit", () => {
    expect(matchCollaborators([ana, bo, cy], "", {}, 2)).toEqual([ana, bo]);
  });
});

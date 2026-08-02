import { describe, expect, it } from "vitest";
import { newlyMentionedUserIds } from "./description-mentions";
import type { Member } from "@/lib/types";

const member = (full_name: string, user_id = full_name.toLowerCase()) =>
  ({ user_id, full_name, email: null, avatar_seed: user_id }) as unknown as Member;

const JEAN = member("Jean");
const MARIE = member("Marie");
const MEMBERS = [JEAN, MARIE];

const call = (
  description: string | null,
  opts: { previous?: string | null; actorId?: string | null } = {},
) =>
  newlyMentionedUserIds({
    members: MEMBERS,
    description,
    previousDescription: opts.previous,
    actorId: opts.actorId ?? "someone-else",
  });

describe("newlyMentionedUserIds", () => {
  it("prévient qui est cité dans une description qui vient de naître", () => {
    expect(call("à relire avec @Jean")).toEqual(["jean"]);
  });

  it("ne prévient personne sans arobase", () => {
    expect(call("à relire avec Jean")).toEqual([]);
  });

  it("ne prévient pas quelqu'un hors du projet", () => {
    expect(call("à relire avec @Pierre")).toEqual([]);
  });

  it("ne se prévient pas soi-même", () => {
    expect(call("je m'en occupe, @Jean", { actorId: "jean" })).toEqual([]);
  });

  it("ne prévient QUE les nouveaux quand la description est modifiée", () => {
    expect(
      call("@Jean puis @Marie", { previous: "@Jean" }),
    ).toEqual(["marie"]);
  });

  it("ne repingue personne quand la description change sans toucher aux mentions", () => {
    expect(
      call("@Jean — corrigé la faute", { previous: "@Jean — corigé la faute" }),
    ).toEqual([]);
  });

  it("ne prévient personne quand une mention est RETIRÉE", () => {
    expect(call("plus personne", { previous: "@Jean" })).toEqual([]);
  });

  it("ne compte qu'une fois quelqu'un cité deux fois", () => {
    expect(call("@Jean et encore @Jean")).toEqual(["jean"]);
  });

  it("exige la casse exacte, comme la pilule affichée", () => {
    expect(call("à relire avec @jean")).toEqual([]);
  });

  it("laisse « @numo » tranquille — ce n'est pas un compte", () => {
    expect(call("@numo regarde ça")).toEqual([]);
  });
});

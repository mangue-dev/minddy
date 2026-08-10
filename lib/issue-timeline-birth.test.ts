import { describe, expect, it } from "vitest";
import { buildTimelineItems } from "@/lib/use-issue-timeline";
import type { Comment, IssueEvent } from "@/lib/types";

/**
 * LA TIMELINE D'UN TICKET COMMENCE PAR SA NAISSANCE — toujours.
 *
 * L'événement `created` est une écriture à part, et une écriture à part peut
 * manquer : elle a échoué, ou la ligne est née d'un insert direct (le monde de
 * démo). Le ticket, lui, sait toujours quand il est né — c'est sa propre
 * colonne. Sans le repli testé ici, ces tickets-là affichent « Aucune activité »,
 * ce qui est faux de tout ticket qui existe.
 *
 * Le repli est un REPLI : dès que le journal porte sa ligne de naissance
 * (`created` ou `imported`), c'est elle qui parle, et rien ne se dédouble.
 */

const BIRTH = { createdAt: "2026-08-10T10:00:00+00:00", createdBy: "member-1" };

const event = (over: Partial<IssueEvent> & { created_at: string }): IssueEvent => ({
  id: `e-${over.created_at}`,
  issue_id: "issue-1",
  actor_id: "member-1",
  type: "updated",
  field: "status",
  from_value: null,
  to_value: null,
  ...over,
});

const comment = (createdAt: string): Comment =>
  ({
    id: `c-${createdAt}`,
    issue_id: "issue-1",
    author_id: "member-1",
    body: "hello",
    parent_id: null,
    created_at: createdAt,
    updated_at: createdAt,
  }) as Comment;

const kinds = (items: ReturnType<typeof buildTimelineItems>) =>
  items.map((i) => (i.kind === "event" ? `${i.event.type}@${i.at}` : `comment@${i.at}`));

describe("buildTimelineItems — la ligne de naissance", () => {
  it("reconstitue « a créé » quand le journal ne la porte pas", () => {
    const items = buildTimelineItems({
      events: [event({ created_at: "2026-08-10T11:00:00+00:00" })],
      comments: [],
      issueId: "issue-1",
      birth: BIRTH,
    });

    expect(kinds(items)).toEqual([
      "created@2026-08-10T10:00:00+00:00",
      "updated@2026-08-10T11:00:00+00:00",
    ]);
    expect(items[0].kind === "event" && items[0].event.actor_id).toBe("member-1");
  });

  it("donne quelque chose à lire à un ticket sans le moindre événement", () => {
    const items = buildTimelineItems({
      events: [],
      comments: [],
      issueId: "issue-1",
      birth: BIRTH,
    });

    expect(kinds(items)).toEqual(["created@2026-08-10T10:00:00+00:00"]);
  });

  it("ne double PAS la naissance déjà journalisée", () => {
    const created = event({
      created_at: "2026-08-10T10:00:02+00:00",
      type: "created",
      field: null,
    });
    const items = buildTimelineItems({
      events: [created],
      comments: [],
      issueId: "issue-1",
      birth: BIRTH,
    });

    expect(kinds(items)).toEqual(["created@2026-08-10T10:00:02+00:00"]);
  });

  it("tient un ticket IMPORTÉ pour né, lui aussi", () => {
    const imported = event({
      created_at: "2026-08-10T10:00:02+00:00",
      type: "imported",
      field: null,
    });
    const items = buildTimelineItems({
      events: [imported],
      comments: [],
      issueId: "issue-1",
      birth: BIRTH,
    });

    expect(kinds(items)).toEqual(["imported@2026-08-10T10:00:02+00:00"]);
  });

  it("attend le chargement avant de se replier", () => {
    // `undefined` = requête en vol. Une ligne de naissance affichée ici serait
    // remplacée une fraction de seconde plus tard par la vraie.
    const items = buildTimelineItems({
      events: undefined,
      comments: [],
      issueId: "issue-1",
      birth: BIRTH,
    });

    expect(items).toEqual([]);
  });

  it("range commentaires et événements au même instant, quelle que soit l'écriture de l'heure", () => {
    // `+00:00` de PostgREST contre `Z` d'un ISO client : même instant, deux
    // typographies — un tri de CHAÎNES mettrait le `Z` en dernier.
    const items = buildTimelineItems({
      events: [event({ created_at: "2026-08-10T12:00:00.000Z" })],
      comments: [comment("2026-08-10T12:00:01+00:00")],
      issueId: "issue-1",
      birth: BIRTH,
    });

    expect(kinds(items)).toEqual([
      "created@2026-08-10T10:00:00+00:00",
      "updated@2026-08-10T12:00:00.000Z",
      "comment@2026-08-10T12:00:01+00:00",
    ]);
  });
});

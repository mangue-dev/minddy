import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { buildOptimisticIssue } from "./optimistic-issue";
import {
  GLOBAL_BOARD_KEY,
  insertIssueEverywhere,
  issueWrites,
  mergeServerIssue,
} from "./optimistic/issue-writes";
import { adoptRemoteRow, remoteEchoOf } from "./optimistic/remote-echo";
import type {
  CreateIssueInput,
  GlobalBoardResponse,
  Issue,
  ResourceInput,
} from "./types";

const PROJECT = "11111111-1111-4111-8111-111111111111";
const OTHER_PROJECT = "44444444-4444-4444-8444-444444444444";
const USER = "55555555-5555-4555-8555-555555555555";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const cachedIssue = (id: string, projectId: string, number: number): Issue =>
  ({ id, project_id: projectId, number, status: "todo" }) as Issue;

/** An attachment such as the composer sends it, once uploaded. */
const file = (storage_path: string): ResourceInput => ({
  kind: "file",
  storage_path,
  file_name: "a.png",
  mime_type: "image/png",
  size_bytes: 1,
});

/** The line as the POST renders it AND the trigger broadcasts it. */
function serverRow(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    project_id: PROJECT,
    number: 42,
    title: "Nouveau ticket",
    status: "backlog",
    priority: "none",
    position: 1000,
    created_by: USER,
    created_at: "2026-08-07T10:00:00+00:00",
    updated_at: "2026-08-07T10:00:00+00:00",
    ...overrides,
  };
}

const projectIssues = (client: QueryClient) =>
  client.getQueryData<Issue[]>(["issues", PROJECT]) ?? [];
const boardIssues = (client: QueryClient) =>
  client.getQueryData<GlobalBoardResponse>(GLOBAL_BOARD_KEY)?.issues ?? [];

let client: QueryClient;

beforeEach(() => {
  issueWrites.reset();
  client = new QueryClient();
  client.setQueryData(["issues", PROJECT], []);
  client.setQueryData(GLOBAL_BOARD_KEY, { issues: [], objectives: {} });
});

// The register is a singleton shared by the entire application.
afterEach(() => issueWrites.reset());

describe("buildOptimisticIssue", () => {
  // The contract which closes the duplicate: the card carries the id that the line will have in
  // base, so the real-time bridge (isOwnEcho → wasJustWritten) recognizes the
  // dissemination of OUR creation instead of adopting it as that of a third party.
  it("nomme la ligne d'un UUID que le registre reconnaît en vol", () => {
    const optimistic = buildOptimisticIssue(
      { title: "Nouveau ticket" },
      PROJECT,
      USER,
      []
    );
    expect(optimistic.id).toMatch(UUID_RE);

    issueWrites.begin({ kind: "insert", row: optimistic });
    // The broadcast starts from the COMMIT trigger, before the POST responds.
    const broadcast = serverRow(optimistic.id);
    expect(issueWrites.wasJustWritten(broadcast.id, broadcast)).toBe(true);
  });

  // On `/all`, the list presented is that of ALL projects: count the
  // maximum without filtering gave a number borrowed from the most provided neighbor.
  it("estime le numéro sur les tickets du projet visé", () => {
    const existing = [
      cachedIssue("a", PROJECT, 3),
      cachedIssue("b", OTHER_PROJECT, 400),
    ];
    expect(
      buildOptimisticIssue({ title: "T" }, PROJECT, USER, existing).number
    ).toBe(4);
  });

  // `resource_count` is an aggregate that only the GET of the board calculates: without it
  // here, the sticker was missing on a ticket created with attachments — more
  // nothing reflects the project on our own creation.
  it("compte les ressources jointes à la création", () => {
    const input: CreateIssueInput = {
      title: "T",
      resources: [file("projects/x/a.png")],
      copy_resources: [file("projects/y/b.png")],
    };
    expect(buildOptimisticIssue(input, PROJECT, USER, []).resource_count).toBe(2);
  });
});

describe("création optimiste, de bout en bout", () => {
  it("laisse UNE carte quand la diffusion précède la réponse du POST", () => {
    const optimistic = buildOptimisticIssue(
      { title: "Nouveau ticket", resources: [file("projects/x/a.png")] },
      PROJECT,
      USER,
      []
    );
    const handle = issueWrites.begin({ kind: "insert", row: optimistic });
    insertIssueEverywhere(client, PROJECT, optimistic);

    // 1. Broadcast comes first — the bridge recognizes it and doesn't adopt anything.
    const broadcast = serverRow(optimistic.id);
    expect(issueWrites.wasJustWritten(broadcast.id, broadcast)).toBe(true);

    // 2. Then the POST response: the server line is placed on the card.
    const issue = { ...serverRow(optimistic.id), category_ids: [] } as unknown as Issue;
    insertIssueEverywhere(client, PROJECT, issue);
    mergeServerIssue(client, PROJECT, issue);
    issueWrites.settle(handle, issue);

    expect(projectIssues(client).map((i) => i.id)).toEqual([optimistic.id]);
    expect(boardIssues(client).map((i) => i.id)).toEqual([optimistic.id]);
    // The final number comes from the server; the aggregate that it does not carry remains.
    expect(projectIssues(client)[0].number).toBe(42);
    expect(projectIssues(client)[0].resource_count).toBe(1);
  });

  // Filet: same adopted (broadcasting another tab of ours, catching up afterwards
  // repeat), the line can no longer be added NEXT to the card — it's the same
  // line, `findCachedIssue` finds it by its id and patches it.
  it("adopte la ligne diffusée en la patchant, jamais en la doublant", () => {
    const optimistic = buildOptimisticIssue({ title: "T" }, PROJECT, USER, []);
    issueWrites.begin({ kind: "insert", row: optimistic });
    insertIssueEverywhere(client, PROJECT, optimistic);

    adoptRemoteRow(
      client,
      PROJECT,
      remoteEchoOf({
        operation: "INSERT",
        table: "issues",
        record: serverRow(optimistic.id),
        old_record: null,
      })
    );

    expect(projectIssues(client).map((i) => i.id)).toEqual([optimistic.id]);
    expect(projectIssues(client)[0].number).toBe(42);
  });
});

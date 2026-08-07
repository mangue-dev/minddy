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

/** Une pièce jointe telle que le composer l'envoie, une fois téléversée. */
const file = (storage_path: string): ResourceInput => ({
  kind: "file",
  storage_path,
  file_name: "a.png",
  mime_type: "image/png",
  size_bytes: 1,
});

/** La ligne telle que le POST la rend ET que le trigger la diffuse. */
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

// Le registre est un singleton partagé par toute l'application.
afterEach(() => issueWrites.reset());

describe("buildOptimisticIssue", () => {
  // Le contrat qui ferme le doublon : la carte porte l'id que la ligne aura en
  // base, donc le pont temps réel (isOwnEcho → wasJustWritten) reconnaît la
  // diffusion de NOTRE création au lieu de l'adopter comme celle d'un tiers.
  it("nomme la ligne d'un UUID que le registre reconnaît en vol", () => {
    const optimistic = buildOptimisticIssue(
      { title: "Nouveau ticket" },
      PROJECT,
      USER,
      []
    );
    expect(optimistic.id).toMatch(UUID_RE);

    issueWrites.begin({ kind: "insert", row: optimistic });
    // La diffusion part du trigger AU COMMIT, avant que le POST ne réponde.
    const broadcast = serverRow(optimistic.id);
    expect(issueWrites.wasJustWritten(broadcast.id, broadcast)).toBe(true);
  });

  // Sur `/all`, la liste présentée est celle de TOUS les projets : compter le
  // maximum sans filtrer donnait un numéro emprunté au voisin le plus fourni.
  it("estime le numéro sur les tickets du projet visé", () => {
    const existing = [
      cachedIssue("a", PROJECT, 3),
      cachedIssue("b", OTHER_PROJECT, 400),
    ];
    expect(
      buildOptimisticIssue({ title: "T" }, PROJECT, USER, existing).number
    ).toBe(4);
  });

  // `resource_count` est un agrégat que seul le GET du board calcule : sans lui
  // ici, la pastille manquait sur un ticket créé avec des pièces jointes — plus
  // rien ne refetch le projet sur notre propre création.
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

    // 1. La diffusion arrive d'abord — le pont la reconnaît et n'adopte rien.
    const broadcast = serverRow(optimistic.id);
    expect(issueWrites.wasJustWritten(broadcast.id, broadcast)).toBe(true);

    // 2. Puis la réponse du POST : la ligne serveur se pose sur la carte.
    const issue = { ...serverRow(optimistic.id), category_ids: [] } as unknown as Issue;
    insertIssueEverywhere(client, PROJECT, issue);
    mergeServerIssue(client, PROJECT, issue);
    issueWrites.settle(handle, issue);

    expect(projectIssues(client).map((i) => i.id)).toEqual([optimistic.id]);
    expect(boardIssues(client).map((i) => i.id)).toEqual([optimistic.id]);
    // Le numéro définitif vient du serveur ; l'agrégat qu'il ne porte pas reste.
    expect(projectIssues(client)[0].number).toBe(42);
    expect(projectIssues(client)[0].resource_count).toBe(1);
  });

  // Filet : même adoptée (diffusion d'un autre onglet à nous, rattrapage après
  // reprise), la ligne ne peut plus s'ajouter À CÔTÉ de la carte — c'est la même
  // ligne, `findCachedIssue` la trouve par son id et la patche.
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

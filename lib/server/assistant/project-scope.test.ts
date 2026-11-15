import { describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { EncryptedRowCodec } from "@/lib/server/encryption/row-codec";
import { EncryptedStore } from "@/lib/server/encryption/store";

const encryption = vi.hoisted(() => ({ store: null as EncryptedStore | null }));
vi.mock("@/lib/server/encryption/registry", () => ({
  getEncryptedStore: () => encryption.store,
}));

import { resolveAssistantProjectTarget } from "./project-scope";

vi.mock("server-only", () => ({}));

const { buildSystemPrompt, buildPageContextBlock } = await import("./prompt");

const USER_ID = "51600000-0000-4000-8000-000000000001";
const PROJECT_ID = "07b14964-0def-4941-8ddf-686572d6345d";

describe("Numo project scope", () => {
  it("requires a named project before cross-project work", () => {
    const prompt = buildSystemPrompt(
      {
        id: "current-project",
        name: "Current project",
        key: "CUR",
        statusCounts: {},
        recentIssues: [],
        members: [],
        objectives: [],
        categories: [],
      },
      "en",
      new Set(),
    );

    expect(prompt).toContain("Conversations have no project identity");
    expect(prompt).toContain(
      "never an implicit mutation target",
    );
    expect(prompt).toContain("call `list_projects`");
    expect(prompt).toContain("Ask which project they mean");
    expect(prompt).toContain(
      "tools documented as OWNER ONLY remain owner-only",
    );
  });
});

describe("resolveAssistantProjectTarget — a named project resolves to its id", () => {
  function clientWith(projects: Array<{ id: string; name: string | null;
    key: string; encrypted_content?: string | null; encryption_version?: number }>) {
    return {
      userId: USER_ID,
      service: {
        from: (table: string) => {
          if (table === "project_members") {
            return {
              select: () => ({ eq: async () => ({ data: [], error: null }) }),
            };
          }
          return {
            select: () => ({
              eq: () => ({
                is: async () => ({ data: projects, error: null }),
              }),
              in: () => ({
                is: async () => ({ data: projects, error: null }),
              }),
            }),
          };
        },
      } as never,
    };
  }

  it("passes a real UUID through untouched", async () => {
    const out = await resolveAssistantProjectTarget(
      clientWith([]),
      PROJECT_ID,
    );
    expect(out).toEqual({ projectId: PROJECT_ID });
  });

  it("resolves a project key, case-insensitively", async () => {
    const out = await resolveAssistantProjectTarget(
      clientWith([{ id: PROJECT_ID, name: "minddy", key: "MIN" }]),
      "min",
    );
    expect(out).toEqual({ projectId: PROJECT_ID });
  });

  it("resolves an exact display name when the key does not match", async () => {
    const out = await resolveAssistantProjectTarget(
      clientWith([{ id: PROJECT_ID, name: "minddy", key: "MIN" }]),
      "Minddy",
    );
    expect(out).toEqual({ projectId: PROJECT_ID });
  });

  it("resolves a sealed project name after the membership lookup", async () => {
    const key = randomBytes(32);
    encryption.store = new EncryptedStore({
      current: async () => ({ version: 1, bytes: Buffer.from(key) }),
      byVersion: async (_scope, version) =>
        ({ version, bytes: Buffer.from(key) }),
    });
    const sealed = await new EncryptedRowCodec(encryption.store).encode({
      id: PROJECT_ID, name: "Private project", automations: [],
      smart_assign_rules: {}, encrypted_content: null, encryption_version: 0,
    }, { table: "projects", scope: { kind: "project", id: PROJECT_ID } });
    const out = await resolveAssistantProjectTarget(clientWith([{
      id: PROJECT_ID, key: "MIN", name: null,
      encrypted_content: sealed.encrypted_content as string,
      encryption_version: sealed.encryption_version as number,
    }]), "Private project");
    expect(out).toEqual({ projectId: PROJECT_ID });
    encryption.store = null;
    key.fill(0);
  });

  it("finds no project when the call names none", async () => {
    expect(await resolveAssistantProjectTarget(clientWith([]), undefined)).toEqual({ projectId: null });
    expect(await resolveAssistantProjectTarget(clientWith([]), "  ")).toEqual({ projectId: null });
  });

  it("refuses an unknown label through the access check, with the list_projects guidance", async () => {
    const out = await resolveAssistantProjectTarget(
      clientWith([{ id: PROJECT_ID, name: "minddy", key: "MIN" }]),
      "unknown project",
    );
    // No key/name match: the raw value falls through to the access check,
    // whose refusal carries the resolution guidance.
    expect(out).toEqual({ projectId: "unknown project" });
  });
});

describe("Numo on a pull request page keeps the full toolkit", () => {
  it("says the PR context does not restrict the issue tools", () => {
    const prompt = buildPageContextBlock({
      projectId: PROJECT_ID,
      pullRequestId: "98bcb59a-8a95-43f4-8876-938d9f657861",
      prNumber: 290,
      prState: "open",
    });
    expect(prompt).toContain("does NOT restrict your toolkit");
    expect(prompt).toContain("create_issue");
  });
});

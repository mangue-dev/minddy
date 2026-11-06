import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  insertNotifications: vi.fn(),
  readNumoNotes: vi.fn(),
  issueFound: true,
}));

vi.mock("./notifications", () => ({ insertNotifications: H.insertNotifications }));
vi.mock("./numo-note-content", () => ({
  encodeNumoNote: async (row: Record<string, unknown>) => ({
    ...row, encryption_version: 0, encrypted_content: null,
  }),
  readNumoNotes: H.readNumoNotes,
}));
const singleIssue = () => ({
  select: () => singleIssue(), eq: () => singleIssue(), is: () => singleIssue(),
  maybeSingle: async () => ({ data: H.issueFound ? { id: "issue" } : null }),
});
vi.mock("./issue-store", () => ({ issueStore: () => singleIssue() }));
vi.mock("./objective-store", () => ({ objectiveStore: () => singleIssue() }));

import { NUMO_NOTES_PER_TURN, parseNumoNoteLink, sendNumoNote } from "./numo-notes";

const USER = "user-1";
const PROJECT = "project-1";
const ISSUE = "issue-1";

/** A minimal PostgREST stand-in: records writes and answers the reads the writer makes. */
function fakeService(options: {
  turnCount?: number;
  recentNoteIds?: string[];
  metadata?: Record<string, unknown>;
} = {}) {
  const noteInserts: Record<string, unknown>[] = [];
  const noteDeletes: string[] = [];
  const recentFilters: Array<[string, string, unknown]> = [];
  const chain = (table: string) => {
    const filters: Array<[string, string, unknown]> = [];
    let mode: "select" | "count" | "delete" = "select";
    const api: Record<string, unknown> = {
      select: (_columns: string, opts?: { head?: boolean }) => {
        if (opts?.head) mode = "count";
        return api;
      },
      eq: (column: string, value: unknown) => {
        filters.push(["eq", column, value]);
        if (mode === "delete" && column === "id") noteDeletes.push(value as string);
        return api;
      },
      is: (column: string, value: unknown) => { filters.push(["is", column, value]); return api; },
      gte: (column: string, value: unknown) => { filters.push(["gte", column, value]); return api; },
      in: () => api,
      insert: async (row: Record<string, unknown>) => {
        if (table === "numo_notes") noteInserts.push(row);
        return { error: null };
      },
      delete: () => { mode = "delete"; return api; },
      limit: async () => {
        if (table === "notifications") recentFilters.push(...filters);
        return { data: table === "notifications"
          ? (options.recentNoteIds ?? []).map((id) => ({ numo_note_id: id }))
          : [], error: null };
      },
      maybeSingle: async () => ({ data: null }),
      then: (resolve: (value: unknown) => unknown) => resolve(mode === "count"
        ? { count: options.turnCount ?? 0, error: null }
        : { data: null, error: null }),
    };
    return api;
  };
  const service = {
    from: (table: string) => chain(table),
    auth: { admin: { getUserById: async () => ({
      data: { user: { user_metadata: options.metadata ?? {} } } }) } },
  };
  return { service: service as never, noteInserts, noteDeletes, recentFilters };
}

const send = (service: never, overrides: Record<string, unknown> = {}) => sendNumoNote({
  service,
  userId: USER,
  projectId: PROJECT,
  title: "Release blocked",
  body: "The migration check failed on the release branch.",
  link: { type: "issue", id: ISSUE },
  turnId: "turn-1",
  ...overrides,
});

beforeEach(() => {
  H.issueFound = true;
  H.insertNotifications.mockReset().mockResolvedValue(1);
  H.readNumoNotes.mockReset().mockResolvedValue(new Map());
});

describe("sendNumoNote", () => {
  it("writes one note to the requesting user's inbox only, signed by Numo", async () => {
    const { service, noteInserts } = fakeService();
    await expect(send(service)).resolves.toMatchObject({ ok: true, delivered: true });
    expect(noteInserts).toHaveLength(1);
    expect(noteInserts[0]).toMatchObject({ user_id: USER, project_id: PROJECT,
      numo_turn_id: "turn-1", title: "Release blocked" });
    expect(H.insertNotifications).toHaveBeenCalledTimes(1);
    const rows = H.insertNotifications.mock.calls[0][1];
    expect(rows).toEqual([expect.objectContaining({
      user_id: USER, project_id: PROJECT, type: "numo_message",
      numo_note_id: noteInserts[0].id, issue_id: ISSUE, routine_id: null,
      actor_id: null, via_assistant: true,
    })]);
  });

  it("refuses an empty title or body", async () => {
    const { service, noteInserts } = fakeService();
    await expect(send(service, { title: "   " })).resolves.toEqual(
      { ok: false, error: "title is required." });
    await expect(send(service, { body: 42 })).resolves.toEqual(
      { ok: false, error: "body is required." });
    expect(noteInserts).toHaveLength(0);
  });

  it("flattens whitespace and caps the length", async () => {
    const { service, noteInserts } = fakeService();
    await send(service, { title: `  ${"a".repeat(300)}  `, body: "one\n\ntwo" });
    expect((noteInserts[0].title as string).length).toBe(120);
    expect(noteInserts[0].body).toBe("one two");
  });

  it("refuses a link outside the project", async () => {
    H.issueFound = false;
    const { service, noteInserts } = fakeService();
    const result = await send(service);
    expect(result).toMatchObject({ ok: false });
    expect(noteInserts).toHaveLength(0);
    expect(H.insertNotifications).not.toHaveBeenCalled();
  });

  it(`stops at ${NUMO_NOTES_PER_TURN} notes in one turn`, async () => {
    const { service, noteInserts } = fakeService({ turnCount: NUMO_NOTES_PER_TURN });
    const result = await send(service);
    expect(result).toMatchObject({ ok: false });
    expect(noteInserts).toHaveLength(0);
  });

  it("does not resend the same note about the same target within a day", async () => {
    H.readNumoNotes.mockResolvedValue(new Map([["old", {
      title: "Earlier", body: "the migration check failed on the release branch.",
    }]]));
    const { service, noteInserts, recentFilters } = fakeService({ recentNoteIds: ["old"] });
    await expect(send(service)).resolves.toEqual(
      { ok: true, delivered: false, reason: "duplicate" });
    expect(noteInserts).toHaveLength(0);
    expect(recentFilters).toContainEqual(["eq", "user_id", USER]);
    expect(recentFilters).toContainEqual(["eq", "issue_id", ISSUE]);
    expect(recentFilters).toContainEqual(["is", "routine_id", null]);
    expect(H.readNumoNotes).toHaveBeenCalledWith(service, ["old"], USER);
  });

  it("writes nothing when the user turned Numo's messages off", async () => {
    const { service, noteInserts } = fakeService({ metadata: { notif_numo: false } });
    await expect(send(service)).resolves.toEqual(
      { ok: true, delivered: false, reason: "muted" });
    expect(noteInserts).toHaveLength(0);
  });

  it("removes the note when its notification was not written", async () => {
    H.insertNotifications.mockResolvedValue(0);
    const { service, noteInserts, noteDeletes } = fakeService();
    await expect(send(service)).resolves.toMatchObject({ ok: false });
    expect(noteDeletes).toEqual([noteInserts[0].id]);
  });
});

describe("parseNumoNoteLink", () => {
  it("accepts the five record types and rejects anything else", () => {
    expect(parseNumoNoteLink(undefined)).toBeNull();
    expect(parseNumoNoteLink({ type: "pull_request", id: " pr " }))
      .toEqual({ type: "pull_request", id: "pr" });
    expect(parseNumoNoteLink({ type: "member", id: "x" })).toBe("invalid");
    expect(parseNumoNoteLink({ type: "issue" })).toBe("invalid");
    expect(parseNumoNoteLink("MIN-42")).toBe("invalid");
  });
});

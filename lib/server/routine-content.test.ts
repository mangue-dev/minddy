import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EncryptedStore, type DataKeyProvider } from "./encryption/store";

const holder = vi.hoisted(() => ({ store: null as EncryptedStore | null }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/encryption/registry", () => ({
  getEncryptedStore: () => holder.store,
}));

const { encodeRoutine, decodeRoutine, decodeRoutineTitle } =
  await import("./routine-content");

beforeEach(() => {
  const root = randomBytes(32);
  const keys: DataKeyProvider = {
    current: async () => ({ version: 1, bytes: Buffer.from(root) }),
    byVersion: async (_scope, version) =>
      ({ version, bytes: Buffer.from(root) }),
  };
  holder.store = new EncryptedStore(keys);
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("agent routine content", () => {
  it("clears source and notification projection and binds to its project", async () => {
    const plain = { id: randomUUID(), project_id: randomUUID(),
      owner_id: randomUUID(), title: "Private routine",
      prompt: "Investigate secret customer", prompt_mentions: [
        { label: "secret customer", id: randomUUID() }],
      base_branch: "private-branch", last_error: "old private error" };
    const sealed = await encodeRoutine(plain, { force: true });
    for (const field of ["title","prompt","prompt_mentions","base_branch"]) {
      expect(sealed[field]).toBeNull();
    }
    expect(sealed.last_error).toBe("launchFailed");
    expect(JSON.stringify(sealed)).not.toContain("Private routine");
    expect(JSON.stringify(sealed)).not.toContain("secret customer");
    expect(JSON.stringify(sealed)).not.toContain("private-branch");
    const decoded = await decodeRoutine(sealed, plain.owner_id);
    expect(decoded.title).toBe(plain.title);
    expect(decoded.prompt).toBe(plain.prompt);
    expect(decoded.prompt_mentions).toEqual(plain.prompt_mentions);
    expect(await decodeRoutineTitle(sealed, plain.owner_id)).toBe(plain.title);
    await expect(decodeRoutine({ ...sealed, project_id: randomUUID() }))
      .rejects.toThrow();
  });
});


it("protects trigger filters in the envelope", async () => {
  const plain = { id: randomUUID(), project_id: randomUUID(), owner_id: randomUUID(), title: "Private trigger", prompt: "Review this issue", prompt_mentions: [], base_branch: null, trigger: { type: "event", event: "issue.created", conditions: { field: "category", operator: "contains", value: randomUUID() } } };
  const sealed = await encodeRoutine(plain, { force: true });
  expect(sealed.trigger).toBeNull();
  expect(JSON.stringify(sealed)).not.toContain(plain.trigger.conditions.value);
  expect((await decodeRoutine(sealed, plain.owner_id)).trigger).toEqual(plain.trigger);
});

async function oldRoutine(payloadOverrides: Record<string, unknown> = {}) {
  const id = randomUUID(), projectId = randomUUID();
  // Encrypt the pre-MIN-677 payload directly: the current encoder adds a trigger.
  const payload = { title: "Existing schedule", prompt: "Review the weekly backlog",
    prompt_mentions: [], base_branch: "main", ...payloadOverrides };
  const envelope = await holder.store!.encrypt(payload, {
    table: "agent_routines", scope: { kind: "project", id: projectId },
    column: "encrypted_content", rowId: JSON.stringify([id]),
  });
  return { id, project_id: projectId, owner_id: randomUUID(),
    title: null, prompt: null, prompt_mentions: null, base_branch: null,
    trigger: null, trigger_type: "schedule", trigger_revision: 1,
    frequency: "weekly", weekdays: [1], hour: 8, minute: 30,
    timezone: "Europe/Paris", next_run_at: "2026-10-19T06:30:00.000Z",
    last_error: null, encrypted_content: envelope, encryption_version: 1 };
}

it("reads pre-trigger ciphertext as a schedule and upgrades it on the next write", async () => {
  const old = await oldRoutine();
  const decoded = await decodeRoutine(old, old.owner_id);
  expect(decoded).toMatchObject({ title: "Existing schedule",
    prompt: "Review the weekly backlog", trigger: { type: "schedule" },
    frequency: old.frequency, weekdays: old.weekdays, hour: old.hour,
    minute: old.minute, timezone: old.timezone, next_run_at: old.next_run_at });
  expect(await decodeRoutineTitle(old, old.owner_id)).toBe("Existing schedule");
  const upgraded = await encodeRoutine(decoded, { force: true });
  expect(upgraded.trigger).toBeNull();
  const payload = await holder.store!.decrypt(holder.store!.fromDatabase(upgraded.encrypted_content), {
    table: "agent_routines", scope: { kind: "project", id: old.project_id },
    column: "encrypted_content", rowId: JSON.stringify([old.id]),
  });
  expect(payload).toHaveProperty("trigger", { type: "schedule" });
  expect(await decodeRoutine(upgraded, old.owner_id)).toEqual(decoded);
  await expect(decodeRoutine({ ...old, project_id: randomUUID() }))
    .rejects.toThrow("Unable to decrypt");
});

it.each(["event", "database"])("rejects pre-trigger ciphertext for a %s routine", async triggerType => {
  await expect(decodeRoutine({ ...await oldRoutine(), trigger_type: triggerType }))
    .rejects.toThrow("Invalid protected row content");
});

it.each([
  { prompt: undefined }, { prompt_mentions: undefined },
  { base_branch: undefined }, { title: undefined }, { unexpected: true },
])("rejects incomplete or unrecognized legacy payloads: %j", async overrides => {
  await expect(decodeRoutine(await oldRoutine(overrides)))
    .rejects.toThrow("Invalid protected row content");
});

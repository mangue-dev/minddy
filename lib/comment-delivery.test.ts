import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { deliverComment, reconcileCommentRead } from "./comment-delivery";
import type { CommentDelivery } from "./comment-delivery";

const draft = {
  id: "draft-uuid", parent_id: null, body: "Draft with attachment",
  updated_at: "2026-09-20T10:00:00Z", attachments: [{ storage_path: "safe/file.png" }],
  delivery: undefined as CommentDelivery | undefined,
};
const key = ["comments", "issue-1"];
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe("optimistic comment delivery", () => {
  it("publishes rich content before the POST resolves and keeps its identity on acknowledgement", async () => {
    const client = new QueryClient();
    const post = deferred<typeof draft>();
    deliverComment(client, key, draft, () => post.promise);
    expect(client.getQueryData<typeof draft[]>(key)?.[0]).toMatchObject({
      ...draft, delivery: { state: "sending" },
    });
    // The server clock can be behind the browser. Its accepted content still wins.
    post.resolve({ ...draft, body: "Accepted", updated_at: "2026-09-20T09:59:00Z" });
    await tick();
    expect(client.getQueryData<typeof draft[]>(key)).toEqual([
      { ...draft, body: "Accepted", updated_at: "2026-09-20T09:59:00Z" },
    ]);
    client.clear();
  });

  it("retains a failed draft and attachments in the cache across observer unmounts and retries once", async () => {
    const client = new QueryClient();
    const retry = deferred<typeof draft>();
    const send = vi.fn().mockRejectedValueOnce(new Error("Offline")).mockReturnValueOnce(retry.promise);
    deliverComment(client, key, draft, send);
    await tick();
    const failed = client.getQueryData<typeof draft[]>(key)![0];
    expect(failed).toMatchObject({ body: draft.body, attachments: draft.attachments, delivery: { state: "error", error: "Offline" } });
    expect(reconcileCommentRead([], [failed])).toEqual([failed]);
    failed.delivery!.retry();
    failed.delivery!.retry();
    expect(send).toHaveBeenCalledTimes(2);
    retry.resolve(draft);
    await tick();
    expect(client.getQueryData(key)).toEqual([draft]);
    client.clear();
  });

  it("deduplicates realtime acknowledgements by UUID without conflating identical messages", async () => {
    const client = new QueryClient();
    const one = deferred<typeof draft>();
    const two = deferred<typeof draft>();
    deliverComment(client, key, draft, () => one.promise);
    const second = { ...draft, id: "second-uuid" };
    deliverComment(client, key, second, () => two.promise);
    const pending = client.getQueryData<typeof draft[]>(key)!;
    const server = [draft, second];
    const refreshed = reconcileCommentRead(server, pending);
    expect(refreshed.map((comment) => comment.id)).toEqual([draft.id, second.id]);
    expect(refreshed.every((comment) => comment.delivery?.state === "sending")).toBe(true);
    client.setQueryData(key, refreshed);
    two.resolve(second);
    one.resolve(draft);
    await tick();
    expect(client.getQueryData(key)).toEqual(server);
    client.clear();
  });

  it("recovers an ambiguous POST failure when the authoritative read contains its UUID", () => {
    const failed = { ...draft, delivery: { state: "error" as const, retry: vi.fn(), discard: vi.fn() } };
    expect(reconcileCommentRead([draft], [failed])).toEqual([draft]);
  });

  it("does not reinsert a pending write into a cleared account cache", async () => {
    const client = new QueryClient();
    const post = deferred<typeof draft>();
    deliverComment(client, key, draft, () => post.promise);
    client.clear();
    client.setQueryData(key, []);
    post.resolve(draft);
    await tick();
    expect(client.getQueryData(key)).toEqual([]);
    client.clear();
  });

  it("cancels an older read before it can remove the pending or accepted comment", async () => {
    const client = new QueryClient();
    client.setQueryData(key, []);
    const read = deferred<typeof draft[]>();
    const fetch = client.fetchQuery({ queryKey: key, queryFn: () => read.promise }).catch(() => undefined);
    const post = deferred<typeof draft>();
    deliverComment(client, key, draft, () => post.promise);
    read.resolve([]);
    await fetch;
    expect(client.getQueryData<typeof draft[]>(key)?.[0].delivery?.state).toBe("sending");
    post.resolve(draft);
    await tick();
    expect(client.getQueryData(key)).toEqual([draft]);
    client.clear();
  });
});

it("does not clear an attachment failure when only the comment body reached the database", () => {
  const failed = { ...draft, delivery: { state: "error" as const, retry: vi.fn(), discard: vi.fn() } };
  expect(reconcileCommentRead<typeof draft>([{ ...draft, attachments: [] }], [failed])).toEqual([failed]);
  expect(reconcileCommentRead([draft], [failed])).toEqual([draft]);
});

it("keeps a failed draft until explicit discard removes a possibly committed server comment", async () => {
  const client = new QueryClient();
  const deletion = deferred<void>();
  const remove = vi.fn(() => deletion.promise);
  deliverComment(client, key, draft, async () => { throw new Error("Delivery failed"); }, remove);
  await tick();
  const failed = client.getQueryData<typeof draft[]>(key)![0];
  const discard = failed.delivery!.discard();
  expect(remove).toHaveBeenCalledOnce();
  expect(client.getQueryData<typeof draft[]>(key)).toHaveLength(1);
  deletion.resolve();
  await discard;
  expect(client.getQueryData(key)).toEqual([]);
  client.clear();
});

// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import type { MyNotification } from "./types";
import { useNotifications } from "./use-notifications";

const api = vi.hoisted(() => ({
  fetch: vi.fn(),
  markRead: vi.fn(),
  markUnread: vi.fn(),
  markAllRead: vi.fn(),
  remove: vi.fn(),
  clearRead: vi.fn(),
}));
vi.mock("./auth-context", () => ({ useAuth: () => ({ user: { id: "user-id" } }) }));
vi.mock("./notifications-api", () => ({
  fetchNotificationsApi: () => api.fetch(),
  markReadApi: (ids: string[]) => api.markRead(ids),
  markUnreadApi: (ids: string[]) => api.markUnread(ids),
  markAllReadApi: () => api.markAllRead(),
  removeNotificationsApi: (ids: string[]) => api.remove(ids),
  clearReadNotificationsApi: () => api.clearRead(),
}));

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

const row = (id: string, read_at: string | null = null) => ({ id, read_at }) as unknown as MyNotification;

/** A request the test settles by hand. */
function deferred() {
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((_resolve, fail) => { reject = fail; });
  return { promise, reject };
}

async function mount(rows: MyNotification[]) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["notifications"], rows);
  let hook!: ReturnType<typeof useNotifications>;
  function Probe() {
    hook = useNotifications();
    return null;
  }
  const root = createRoot(document.createElement("div"));
  await act(() => root.render(<QueryClientProvider client={client}><Probe /></QueryClientProvider>));
  return {
    hook: () => hook,
    rows: () => client.getQueryData<MyNotification[]>(["notifications"])!,
    client,
    close: async () => { await act(() => root.unmount()); client.clear(); },
  };
}

it("rolls back only the failed request, keeping a later success and a new notification", async () => {
  const slowA = deferred();
  api.markRead.mockImplementation((ids: string[]) => (ids[0] === "a" ? slowA.promise : Promise.resolve()));
  const view = await mount([row("a"), row("b")]);
  try {
    let failedA!: Promise<void>;
    await act(async () => {
      failedA = view.hook().markRead(["a"]).catch(() => {});
      await view.hook().markRead(["b"]);
    });
    // Realtime delivered a new notification in the meantime.
    view.client.setQueryData<MyNotification[]>(["notifications"], (old) => [row("c"), ...old!]);
    await act(async () => {
      slowA.reject(new Error("HTTP 500"));
      await failedA;
    });
    const rows = view.rows();
    expect(rows.map((n) => n.id)).toEqual(["c", "a", "b"]);
    expect(rows.find((n) => n.id === "a")!.read_at).toBeNull();
    expect(rows.find((n) => n.id === "b")!.read_at).not.toBeNull();
  } finally { await view.close(); }
});

it("does not undo a newer write on the same notification", async () => {
  const slowRead = deferred();
  api.markRead.mockReturnValue(slowRead.promise);
  api.markUnread.mockResolvedValue(undefined);
  const view = await mount([row("a")]);
  try {
    let failedRead!: Promise<void>;
    await act(async () => {
      failedRead = view.hook().markRead(["a"]).catch(() => {});
      await view.hook().markUnread(["a"]);
      await view.hook().markRead([]);
    });
    // A refetch replaced the row after the failed write was applied.
    view.client.setQueryData<MyNotification[]>(["notifications"], [row("a", "2026-10-21T10:00:00Z")]);
    await act(async () => {
      slowRead.reject(new Error("HTTP 500"));
      await failedRead;
    });
    expect(view.rows()[0].read_at).toBe("2026-10-21T10:00:00Z");
  } finally { await view.close(); }
});

it("puts a failed deletion back in place without restoring other deletions", async () => {
  const slowRemove = deferred();
  api.remove.mockImplementation((ids: string[]) => (ids[0] === "b" ? slowRemove.promise : Promise.resolve()));
  const view = await mount([row("a"), row("b"), row("c")]);
  try {
    let failedRemove!: Promise<void>;
    await act(async () => {
      failedRemove = view.hook().remove(["b"]).catch(() => {});
      await view.hook().remove(["c"]);
    });
    await act(async () => {
      slowRemove.reject(new Error("Network error"));
      await failedRemove;
    });
    expect(view.rows().map((n) => n.id)).toEqual(["a", "b"]);
  } finally { await view.close(); }
});

it("rolls back a failed mark-all-read without touching rows read in the meantime", async () => {
  const slowAll = deferred();
  api.markAllRead.mockReturnValue(slowAll.promise);
  api.markUnread.mockResolvedValue(undefined);
  const view = await mount([row("a"), row("b")]);
  try {
    let failedAll!: Promise<void>;
    await act(async () => {
      failedAll = view.hook().markAllRead().catch(() => {});
      await view.hook().markUnread(["b"]);
    });
    await act(async () => {
      slowAll.reject(new Error("HTTP 500"));
      await failedAll;
    });
    expect(view.rows().map((n) => n.read_at)).toEqual([null, null]);
    expect(view.hook().unreadCount).toBe(2);
  } finally { await view.close(); }
});

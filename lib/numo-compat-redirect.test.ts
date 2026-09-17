// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  open: vi.fn(),
  router: { replace: vi.fn() },
  searchParams: new URLSearchParams(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => h.router,
  useSearchParams: () => h.searchParams,
}));
vi.mock("@/lib/assistant-panel-context", () => ({
  useAssistantPanel: () => ({ open: h.open }),
}));

import { NumoCompatRedirect } from "@/components/assistant/numo-compat-redirect";

let root: Root;
let container: HTMLDivElement;

const UUID = "51400000-0000-4000-8000-000000000099";

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  h.searchParams = new URLSearchParams();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() =>
  act(() => {
    root.unmount();
    container.remove();
  }),
);

function render(retired: "numo" | "agents") {
  return act(async () =>
    root.render(createElement(NumoCompatRedirect, { retired })),
  );
}

/** `fetch` mock: resolve(id) answers for a given source, 404 for the other. */
function mockResolve(source: "agent" | "run", conversationId?: string) {
  return vi.fn(async (url: string) => {
    const query = new URL(url, "http://x").searchParams;
    const ok = query.get("source") === source && conversationId;
    return new Response(
      ok ? JSON.stringify({ conversationId }) : JSON.stringify({ error: "x" }),
      { status: ok ? 200 : 404 },
    );
  });
}

describe("retired Numo page compat surface", () => {
  it("opens the panel on the named conversation and lands on home", async () => {
    h.searchParams.set("conversation", UUID);
    await render("numo");
    expect(h.open).toHaveBeenCalledExactlyOnceWith({ conversationId: UUID });
    expect(h.router.replace).toHaveBeenCalledExactlyOnceWith("/home");
  });

  it("opens the panel without a conversation when the id is junk", async () => {
    h.searchParams.set("conversation", "not-a-uuid");
    await render("numo");
    expect(h.open).toHaveBeenCalledExactlyOnceWith({ conversationId: null });
  });

  it("resolves an old worker conversation id to the common identity", async () => {
    const fetchMock = mockResolve("agent", UUID);
    vi.stubGlobal("fetch", fetchMock);
    h.searchParams.set("run", UUID);
    await render("agents");
    expect(h.open).toHaveBeenCalledExactlyOnceWith({ conversationId: UUID });
  });

  it("resolves an old run id when the worker conversation lookup misses", async () => {
    const fetchMock = mockResolve("run", UUID);
    vi.stubGlobal("fetch", fetchMock);
    h.searchParams.set("run", UUID);
    await render("agents");
    expect(h.open).toHaveBeenCalledExactlyOnceWith({ conversationId: UUID });
  });

  it("still opens the panel when nothing resolves", async () => {
    const fetchMock = mockResolve("agent");
    vi.stubGlobal("fetch", fetchMock);
    h.searchParams.set("run", UUID);
    await render("agents");
    expect(h.open).toHaveBeenCalledExactlyOnceWith({ conversationId: null });
    expect(h.router.replace).toHaveBeenCalledExactlyOnceWith("/home");
  });
});

// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NumoIntent } from "@/lib/assistant-types";
import {
  PagePromotionProvider,
  usePromotePage,
  useRegisterPagePromotionSource,
  type PagePromotionSource,
} from "./page-promotion-context";
import { usePageDocumentMenu } from "./page-document-actions";
import type { ContextMenuAction } from "@/components/issue-context-menu";

const openIntent = vi.fn<(intent: NumoIntent) => void>();
const toastError = vi.fn();
let canWrite = true;

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}));
vi.mock("sonner", () => ({ toast: { error: (message: string) => toastError(message), success: vi.fn() } }));
vi.mock("@/lib/assistant-panel-context", () => ({
  useAssistantPanelActions: () => ({ openIntent }),
}));
vi.mock("@/lib/use-project-capabilities", () => ({
  useProjectCapabilities: () => ({ canWrite }),
}));
vi.mock("@/components/pages/page-publish-dialog", () => ({ PagePublishDialog: () => null }));
vi.mock("@/components/pages/page-agent-copy-dialog", () => ({ PageAgentCopyDialog: () => null }));
vi.mock("@/components/numo-icon", () => ({ NumoIcon: () => null }));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;

beforeEach(() => {
  openIntent.mockReset();
  toastError.mockReset();
  canWrite = true;
});
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = "";
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function OpenEditor({ pageId, source }: { pageId: string; source: PagePromotionSource }) {
  useRegisterPagePromotionSource(pageId, source);
  return null;
}

let promote: ReturnType<typeof usePromotePage> | undefined;
function Promoter() {
  promote = usePromotePage("project-1");
  return null;
}

async function render(children: ReactNode, provided = true) {
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(provided ? createElement(PagePromotionProvider, null, children) : children);
  });
}

describe("usePromotePage", () => {
  it("opens Numo on an unopened page with explicit project and page context", async () => {
    await render(createElement(Promoter));
    await act(async () => promote!({ id: "page-b", title: "Roadmap" }));

    expect(openIntent).toHaveBeenCalledTimes(1);
    const intent = openIntent.mock.calls[0][0];
    expect(intent).toMatchObject({
      source: "page",
      action: "promote",
      projectId: "project-1",
      pageContext: { projectId: "project-1", pageId: "page-b", pageTitle: "Roadmap" },
    });
    expect(intent.prompt).toContain("promotePagePrompt");
    expect(intent.prompt).toContain("Roadmap");
  });

  it("saves only the targeted open page and uses its typed title", async () => {
    const a = { title: () => "Page A", prepare: vi.fn(async () => true) };
    const b = { title: () => "Freshly typed", prepare: vi.fn(async () => true) };
    await render(<>
      <OpenEditor pageId="page-a" source={a} />
      <OpenEditor pageId="page-b" source={b} />
      <Promoter />
    </>);

    await act(async () => promote!({ id: "page-b", title: "Stale summary" }));

    expect(b.prepare).toHaveBeenCalledTimes(1);
    expect(a.prepare).not.toHaveBeenCalled();
    expect(openIntent.mock.calls[0][0].pageContext).toMatchObject({
      pageId: "page-b",
      pageTitle: "Freshly typed",
    });
  });

  it("waits for the pending save before opening Numo", async () => {
    const save = deferred<boolean>();
    await render(<>
      <OpenEditor pageId="page-a" source={{ title: () => "A", prepare: () => save.promise }} />
      <Promoter />
    </>);

    let done: Promise<void> | undefined;
    await act(async () => { done = promote!({ id: "page-a", title: "A" }); });
    expect(openIntent).not.toHaveBeenCalled();

    await act(async () => { save.resolve(true); await done; });
    expect(openIntent).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["reports a failed save", () => Promise.resolve(false)],
    ["rejects", () => Promise.reject(new Error("offline"))],
  ])("does not promote when the page save %s", async (_label, prepare) => {
    await render(<>
      <OpenEditor pageId="page-a" source={{ title: () => "A", prepare }} />
      <Promoter />
    </>);

    await act(async () => promote!({ id: "page-a", title: "A" }));

    expect(openIntent).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith("saveFailed");
  });

  it("ignores a second activation while the first is still saving", async () => {
    const save = deferred<boolean>();
    const prepare = vi.fn(() => save.promise);
    await render(<>
      <OpenEditor pageId="page-a" source={{ title: () => "A", prepare }} />
      <Promoter />
    </>);

    let first: Promise<void> | undefined;
    await act(async () => {
      first = promote!({ id: "page-a", title: "A" });
      void promote!({ id: "page-a", title: "A" });
    });
    await act(async () => { save.resolve(true); await first; });

    expect(prepare).toHaveBeenCalledTimes(1);
    expect(openIntent).toHaveBeenCalledTimes(1);
  });

  it("forgets an editor once it unmounts", async () => {
    const prepare = vi.fn(async () => false);
    await render(<>
      <OpenEditor pageId="page-a" source={{ title: () => "A", prepare }} />
      <Promoter />
    </>);
    await act(async () => root!.render(
      createElement(PagePromotionProvider, null, createElement(Promoter))
    ));

    await act(async () => promote!({ id: "page-a", title: "Summary" }));

    expect(prepare).not.toHaveBeenCalled();
    expect(openIntent.mock.calls[0][0].pageContext?.pageTitle).toBe("Summary");
  });

  it("names an untitled page instead of sending an empty title", async () => {
    await render(createElement(Promoter), false);
    await act(async () => promote!({ id: "page-a", title: "  " }));

    expect(openIntent.mock.calls[0][0].pageContext?.pageTitle).toBe("untitled");
  });
});

describe("page document menu", () => {
  let actionsFor: ((page: { id: string; title: string; favorite: boolean }) => ContextMenuAction[]) | undefined;
  function Menu() {
    actionsFor = usePageDocumentMenu({
      projectId: "project-1",
      pages: [{ id: "page-b", parent_id: null }],
      onCreateChild: vi.fn(),
      onToggleFavorite: vi.fn(),
      onTrash: vi.fn(),
    }).actionsFor;
    return null;
  }

  it("promotes the page the menu was opened on", async () => {
    await render(createElement(Menu));
    const action = actionsFor!({ id: "page-b", title: "Roadmap", favorite: false })
      .find((candidate) => candidate.id === "promote-to-issue");

    await act(async () => { action!.onSelect?.(); });

    expect(openIntent.mock.calls[0][0].pageContext).toMatchObject({
      projectId: "project-1",
      pageId: "page-b",
    });
  });

  it("is not offered to project readers", async () => {
    canWrite = false;
    await render(createElement(Menu));

    const ids = actionsFor!({ id: "page-b", title: "Roadmap", favorite: false }).map((action) => action.id);
    expect(ids).not.toContain("promote-to-issue");
  });
});

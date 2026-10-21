// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PageTaskSurface } from "./page-task-surface";
import { useTaskSurface, type TaskSurface } from "@/components/scratchpad/task-surface";

const openIntent = vi.fn();
const toastError = vi.fn();
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("sonner", () => ({ toast: { error: (message: string) => toastError(message) } }));
vi.mock("@/lib/assistant-panel-context", () => ({ useAssistantPanelActions: () => ({ openIntent }) }));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = "";
  openIntent.mockReset();
  toastError.mockReset();
});

async function mount(flush: () => Promise<boolean>) {
  let surface: TaskSurface | null = null;
  function Probe() {
    surface = useTaskSurface();
    return null;
  }
  root = createRoot(document.body.appendChild(document.createElement("div")));
  await act(async () => root!.render(createElement(PageTaskSurface,
    { projectId: "project", pageId: "page", pageTitle: "Roadmap", flush, children: createElement(Probe) })));
  return {
    async promote() {
      await act(async () => {
        surface!.promote("Ship it");
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    },
  };
}

describe("page task actions wait for a successful save (MIN-705)", () => {
  it("does not open Numo on the persisted page while the save failed", async () => {
    const flush = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const h = await mount(flush);

    await h.promote();
    expect(openIntent).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith("saveFailed");

    // Once the retry saves, the same gesture opens the action exactly once.
    await h.promote();
    expect(flush).toHaveBeenCalledTimes(2);
    expect(openIntent).toHaveBeenCalledTimes(1);
    expect(openIntent).toHaveBeenCalledWith(expect.objectContaining({
      action: "promote",
      pageContext: { projectId: "project", pageId: "page", pageTitle: "Roadmap" },
    }));
  });
});

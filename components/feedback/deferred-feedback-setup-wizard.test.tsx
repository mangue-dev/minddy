// @vitest-environment jsdom
import { act, createElement, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { DeferredFeedbackSetupWizard } from "./deferred-feedback-setup-wizard";

const effects = vi.hoisted(() => ({ mount: vi.fn() }));
vi.mock("./feedback-setup-wizard", () => ({ FeedbackSetupWizard: ({ open, projectId }: { open: boolean; projectId: string }) => {
  const [draft, setDraft] = useState("Untouched");
  useEffect(() => { effects.mount(projectId); }, [projectId]);
  return createElement("button", { hidden: !open, onClick: () => setDraft("Unsaved setup draft") }, draft);
} }));

it("defers setup reads until intent, retains drafts on close and isolates another project", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div"), root = createRoot(container);
  const render = (projectId: string, open: boolean) => act(() => root.render(createElement(DeferredFeedbackSetupWizard,
    { projectId, open, isOwner: true, onOpenChange: () => {} })));
  try {
    await render("one", false); expect(effects.mount).not.toHaveBeenCalled();
    await render("one", true); expect(effects.mount).toHaveBeenCalledExactlyOnceWith("one");
    await act(() => container.querySelector("button")!.click());
    await render("one", false); await render("one", true);
    expect(container.textContent).toBe("Unsaved setup draft"); expect(effects.mount).toHaveBeenCalledTimes(1);
    await render("two", false); expect(container.textContent).toBe("");
    await render("two", true); expect(container.textContent).toBe("Untouched");
    expect(effects.mount).toHaveBeenLastCalledWith("two");
  } finally { await act(() => root.unmount()); vi.unstubAllGlobals(); }
});

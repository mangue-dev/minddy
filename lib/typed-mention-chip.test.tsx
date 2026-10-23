// @vitest-environment jsdom
// An objective mention shows its status glyph, not the target, even when the
// sources on screen do not hold it and the server resolves it (MIN-785).
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/components/mention-chip", () => ({
  MentionChip: ({ type, label, status }: { type: string; label: string; status?: string }) =>
    createElement("span", { "data-type": type, "data-status": status ?? "" }, label),
}));

const { TypedMentionChip } = await import("@/components/typed-mention-chip");

const OBJECTIVE = "77777777-7777-4777-8777-777777777771";

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("typed objective mention", () => {
  it("passes the status the server returns to the pill", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      mentions: [{ type: "objective", id: OBJECTIVE, label: "Launch", status: "done" }],
    }))));
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(createElement(TypedMentionChip, { type: "objective", id: OBJECTIVE }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const pill = container.querySelector("[data-type='objective']");
    expect(pill?.textContent).toBe("Launch");
    // `done` borrows the issue state of the same name for its glyph.
    expect(pill?.getAttribute("data-status")).toBe("done");
    act(() => root.unmount());
  });
});

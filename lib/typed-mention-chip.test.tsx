// @vitest-environment jsdom
// An objective mention shows its status glyph, not the target, even when the
// sources on screen do not hold it and the server resolves it (MIN-785).
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key, useLocale: () => "en" }));
vi.mock("@/components/mention-chip", () => ({
  MentionChip: ({ type, label, status, iconUrl, avatarSeed }: {
    type: string; label: string; status?: string; iconUrl?: string | null; avatarSeed?: string | null;
  }) =>
    createElement("span", {
      "data-type": type, "data-status": status ?? "", "data-icon": iconUrl ?? "", "data-seed": avatarSeed ?? "",
    }, label),
}));
const projects = vi.hoisted(() => ({
  value: null as { projects: Array<{ id: string; orb_seed: string | null; icon_url: string | null }> } | null,
}));
vi.mock("@/lib/projects-context", () => ({ useOptionalProjects: () => projects.value }));

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

describe("typed project mention", () => {
  const PROJECT = "77777777-7777-4777-8777-777777777772";

  // MIN-930: a project mention written as Markdown (a Numo answer, the Home
  // summary) wears the project's orb and icon, like an editor node.
  it("takes its orb and icon from the user's projects", async () => {
    projects.value = { projects: [{ id: PROJECT, orb_seed: "seed-1", icon_url: "https://icon" }] };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      mentions: [{ type: "project", id: PROJECT, label: "Test" }],
    }))));
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(createElement(TypedMentionChip, { type: "project", id: PROJECT }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const pill = container.querySelector("[data-type='project']");
    expect(pill?.textContent).toBe("Test");
    expect(pill?.getAttribute("data-icon")).toBe("https://icon");
    expect(pill?.getAttribute("data-seed")).toBe("seed-1");
    act(() => root.unmount());
    projects.value = null;
  });
});

// @vitest-environment jsdom
//
// A typed mention renders what the reader may see (MIN-734): the target's
// current label, or a neutral pill — never the label stored with it.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Markdown } from "@/components/markdown";
import { MentionLinksProvider, type MentionLinks } from "@/components/mention-links";
import { primeMentionLabel, resetMentionResolution } from "@/lib/mention-resolution";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/lib/pr-endpoint-context", () => ({ usePrEndpoint: () => null }));
vi.mock("@/components/mention-chip", () => ({
  NUMO_MENTION_ID: "__numo__",
  MentionChip: ({ type, label }: { type: string; label: string }) =>
    createElement("span", { "data-chip": type }, label),
}));

const ISSUE = "9f1c2a3b-0000-4000-8000-000000000001";
const PAGE = "9f1c2a3b-0000-4000-8000-000000000002";
let root: Root;
let host: HTMLElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  resetMentionResolution();
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

const links = (labels: Record<string, string>): MentionLinks => ({
  href: () => null,
  issueStatus: () => null,
  navigate: () => {},
  label: (type, id) => labels[`${type}:${id}`] ?? null,
});

async function render(markdown: string, value: MentionLinks | null) {
  await act(async () => {
    root.render(createElement(MentionLinksProvider, { value, children: createElement(Markdown, { children: markdown }) }));
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

it("shows the current label from the sources on screen", async () => {
  await render(`Fix [@MIN-1](mention:issue/${ISSUE})`, links({ [`issue:${ISSUE}`]: "MIN-42" }));
  expect(host.querySelector("[data-chip=issue]")?.textContent).toBe("MIN-42");
  expect(host.textContent).not.toContain("MIN-1");
});

it("shows a neutral pill when the server says the reader may not see the target", async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({
    mentions: [{ type: "page", id: PAGE, label: null }],
  })));
  vi.stubGlobal("fetch", fetchMock);
  await render(`See [@Secret roadmap](mention:page/${PAGE})`, links({}));
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
  expect(fetchMock).toHaveBeenCalledOnce();
  expect(host.querySelector("[data-chip=unavailable]")?.textContent).toBe("mentionUnavailable");
  expect(host.textContent).not.toContain("Secret roadmap");
});

it("shows a mention just picked from the menu at once, without asking the server", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  const member = "5ad9b962-93e7-4a7c-a44b-f4925484ba93";
  primeMentionLabel("member", member, "Jean Dupont");
  await render(`Ask [@Jean Dupont](mention:member/${member})`, links({}));
  expect(host.querySelector("[data-chip=member]")?.textContent).toBe("Jean Dupont");
  expect(fetchMock).not.toHaveBeenCalled();
});

it("names an attachment from its own surface, and never from another one (MIN-742)", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  const mine = "9f1c2a3b-0000-4000-8000-000000000003";
  const elsewhere = "9f1c2a3b-0000-4000-8000-000000000004";
  await render(
    `See [@spec.pdf](mention:resource/${mine}) and [@budget.xlsx](mention:resource/${elsewhere})`,
    links({ [`resource:${mine}`]: "Spec v2.pdf" }),
  );
  const chips = [...host.querySelectorAll("[data-chip]")].map((chip) => [chip.getAttribute("data-chip"), chip.textContent]);
  expect(chips).toEqual([["resource", "Spec v2.pdf"], ["unavailable", "mentionUnavailable"]]);
  // Another surface's attachment is not resolved through the server either.
  expect(fetchMock).not.toHaveBeenCalled();
  expect(host.textContent).not.toContain("budget");
});

it("passes a render's own links to its pills", async () => {
  const id = "9f1c2a3b-0000-4000-8000-000000000005";
  await act(async () => {
    root.render(createElement(Markdown, {
      mentionLinks: links({ [`resource:${id}`]: "notes.md" }),
      children: `Read [@notes](mention:resource/${id})`,
    }));
  });
  expect(host.querySelector("[data-chip=resource]")?.textContent).toBe("notes.md");
});

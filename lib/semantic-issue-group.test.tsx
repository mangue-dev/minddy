// @vitest-environment jsdom

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

/**
 * "Related by meaning" in a cmdk picker (MIN-718): only the picker's own
 * eligible issues, never one already matched by text, always after the text
 * matches — and the highlighted row stays where it was when they arrive.
 */

const h = vi.hoisted(() => ({ ids: [] as string[], enabled: [] as boolean[], pending: false, answered: false }));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/lib/use-semantic-issue-search", () => ({
  useSemanticIssueSearch: (_query: string, options: { enabled?: boolean }) => {
    h.enabled.push(options.enabled !== false);
    return { ids: h.ids, pending: h.pending, answered: h.answered };
  },
}));
// Stubs for the UI primitives the component under test renders.
const uiStubs = vi.hoisted(() => {
  let value: Promise<Record<string, unknown>> | undefined;
  return () => (value ??= (async () => {
  const { Command } = await import("cmdk");
  return { CommandGroup: Command.Group, CommandItem: Command.Item };
})());
});
vi.mock("@/components/ui/command", async (importOriginal) => {
  const stubs = await uiStubs();
  return { ...(await importOriginal<Record<string, unknown>>()), CommandGroup: stubs.CommandGroup, CommandItem: stubs.CommandItem };
});

import { Command } from "cmdk";
import { SemanticIssueGroup } from "@/components/semantic-issue-group";

interface Candidate { id: string; title: string }
const candidates: Candidate[] = [
  { id: "sso", title: "Single sign-on login" },
  { id: "idp", title: "Enterprise identity federation" },
  { id: "saml", title: "SAML assertions" },
];

let root: Root;
let host: HTMLDivElement;
const onSelect = vi.fn();

beforeEach(() => {
  h.pending = false;
  h.answered = false;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  Element.prototype.scrollIntoView = () => {};
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  onSelect.mockReset();
});
afterEach(async () => {
  await act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

function Picker({ search }: { search: string }) {
  return (
    <Command>
      <Command.Input value={search} onValueChange={() => {}} />
      <Command.List>
        <Command.Group heading="Issues">
          {candidates.map((c) => (
            <Command.Item key={c.id} value={c.id} keywords={[c.title]}>{c.title}</Command.Item>
          ))}
        </Command.Group>
        <SemanticIssueGroup
          projectId="p1"
          candidates={candidates.filter((c) => c.id !== "saml")}
          idOf={(c) => c.id}
          textOf={(c) => ({ value: c.id, keywords: [c.title] })}
          onSelect={onSelect}
          renderItem={(c) => <span data-semantic>{c.title}</span>}
        />
      </Command.List>
    </Command>
  );
}

const options = () => [...host.querySelectorAll("[cmdk-item]")].map((el) => el.textContent);
const selected = () => host.querySelector('[cmdk-item][data-selected="true"]')?.textContent;

it("appends eligible meaning matches after the text matches, without moving the highlight", async () => {
  h.ids = [];
  await act(() => root.render(<Picker search="single sign" />));
  expect(options()).toEqual(["Single sign-on login"]);
  expect(selected()).toBe("Single sign-on login");

  // The answer arrives: "sso" is already shown by text, "saml" is not eligible here.
  h.ids = ["sso", "saml", "idp"];
  await act(() => root.render(<Picker search="single sign" />));
  expect(options()).toEqual(["Single sign-on login", "Enterprise identity federation"]);
  expect(host.querySelectorAll("[data-semantic]")).toHaveLength(1);
  expect(selected()).toBe("Single sign-on login");
});

it("selects the issue itself, not a lookalike", async () => {
  h.ids = ["idp"];
  await act(() => root.render(<Picker search="single sign" />));
  const row = [...host.querySelectorAll("[cmdk-item]")].find((el) => el.textContent === "Enterprise identity federation")!;
  await act(async () => { (row as HTMLElement).click(); });
  expect(onSelect).toHaveBeenCalledWith({ id: "idp", title: "Enterprise identity federation" });
});

it("asks for nothing when the picker has no eligible issue", async () => {
  h.ids = [];
  h.enabled = [];
  await act(() => root.render(
    <Command>
      <Command.Input value="single sign" onValueChange={() => {}} />
      <Command.List>
        <SemanticIssueGroup
          projectId={null}
          candidates={[] as Candidate[]}
          idOf={(c) => c.id}
          textOf={(c) => ({ value: c.id })}
          onSelect={onSelect}
          renderItem={(c) => c.title}
        />
      </Command.List>
    </Command>
  ));
  expect(h.enabled.every((value) => value === false)).toBe(true);
});

it("says when the search by meaning is running, then when it found nothing new", async () => {
  h.ids = [];
  h.pending = true;
  await act(() => root.render(<Picker search="login keeps failing" />));
  expect(host.querySelector('[role="status"]')?.textContent).toBe("searchingByMeaning");

  h.pending = false;
  h.answered = true;
  await act(() => root.render(<Picker search="login keeps failing" />));
  expect(host.querySelector('[role="status"]')?.textContent).toBe("noRelatedByMeaning");

  // A search that did not really run (an outage, indexing off) claims nothing.
  h.answered = false;
  await act(() => root.render(<Picker search="login keeps failing" />));
  expect(host.querySelector('[role="status"]')).toBeNull();
});

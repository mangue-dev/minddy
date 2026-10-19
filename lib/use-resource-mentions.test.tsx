// @vitest-environment jsdom
//
// MIN-742: a surface's text mentions its own attachments — offered after the
// people in the `@` menu, labeled and opened from that surface's list alone.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { DocumentEditorMentions } from "@/components/editor/document-editor";
import type { ResourceLike } from "@/components/resources";
import { landedResources } from "@/lib/use-attachment-uploads";
import { closeResourcePreview, useResourcePreview } from "@/lib/resource-preview";
import { useResourceMentions } from "./use-resource-mentions";

const push = vi.fn();
// The real hook is memoized: one router for the component's lifetime.
const router = { push };
vi.mock("@/lib/use-app-router", () => ({ useAppRouter: () => router }));

const base: DocumentEditorMentions = {
  options: [
    { type: "member", id: "m1", label: "Jean Dupont" },
    { type: "issue", id: "i1", label: "MIN-1" },
  ],
  scan: (() => []) as unknown as DocumentEditorMentions["scan"],
  links: {
    href: (type, id) => `/${type}/${id}`,
    issueStatus: () => null,
    navigate: vi.fn(),
    label: (type, id) => (type === "issue" && id === "i1" ? "MIN-1" : null),
  },
};

const file: ResourceLike = { id: "r1", kind: "file", file_name: "spec.pdf", mime_type: "application/pdf", storage_path: "projects/p/abc" };
const link: ResourceLike = { id: "r2", kind: "link", file_name: "Linear docs", url: "https://linear.app/docs", icon_data_url: null };
const page: ResourceLike = { id: "r3", kind: "page", file_name: "Old title", page_id: "pg", project_id: "p", page: { id: "pg", title: "Roadmap", icon: "🗺️" } };

let root: Root;
let result: DocumentEditorMentions | undefined;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  root = createRoot(document.body.appendChild(document.createElement("div")));
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  push.mockReset();
});

function Probe({ resources, mentions = base }: { resources: ResourceLike[]; mentions?: DocumentEditorMentions }) {
  result = useResourceMentions(mentions, resources);
  return null;
}
const render = (resources: ResourceLike[]) => act(async () => root.render(createElement(Probe, { resources })));

it("offers the surface's resources right after the people", async () => {
  await render([file, link, page]);
  expect(result?.options.map((option) => `${option.type}:${option.label}`)).toEqual([
    "member:Jean Dupont",
    "resource:spec.pdf",
    "resource:Linear docs",
    "resource:Roadmap",
    "issue:MIN-1",
  ]);
});

it("labels and links its own resources, and nothing else", async () => {
  await render([file, link, page]);
  const links = result!.links!;
  expect(links.label?.("resource", "r1")).toBe("spec.pdf");
  expect(links.label?.("resource", "r3")).toBe("Roadmap");
  expect(links.label?.("resource", "from-another-ticket")).toBeNull();
  expect(links.href("resource", "r1")).toBe("/api/attachments/file?path=projects%2Fp%2Fabc");
  expect(links.href("resource", "r2")).toBe("https://linear.app/docs");
  expect(links.href("resource", "r3")).toBe("/projects/p/pages/pg");
  // Other mentions keep the surface's own rules.
  expect(links.label?.("issue", "i1")).toBe("MIN-1");
  expect(links.href("issue", "i1")).toBe("/issue/i1");
});

it("opens a page in the app and a link beside it", async () => {
  const open = vi.fn();
  vi.stubGlobal("open", open);
  await render([link, page]);
  result!.links!.navigate("resource", "r3");
  expect(push).toHaveBeenCalledWith("/projects/p/pages/pg");
  result!.links!.navigate("resource", "r2");
  expect(open).toHaveBeenCalledWith("https://linear.app/docs", "_blank", "noopener,noreferrer");
});

it("opens a file mention in the shared reader, not in a new tab", async () => {
  const open = vi.fn();
  vi.stubGlobal("open", open);
  let previewed: ReturnType<typeof useResourcePreview> = null;
  function Watcher() {
    previewed = useResourcePreview();
    return null;
  }
  await act(async () => root.render(createElement("div", null,
    createElement(Probe, { resources: [file] }), createElement(Watcher))));
  await act(async () => result!.links!.navigate("resource", "r1"));
  expect(open).not.toHaveBeenCalled();
  expect(previewed).toEqual({ file_name: "spec.pdf", storage_path: "projects/p/abc", mime_type: "application/pdf" });
  await act(async () => closeResourcePreview());
  expect(previewed).toBeNull();
});

it("keeps the same model for the same rows, so the editor is not rebuilt", async () => {
  await render([file]);
  const first = result;
  await render([{ ...file }]);
  expect(result).toBe(first);
  await render([{ ...file, file_name: "renamed.pdf" }]);
  expect(result).not.toBe(first);
});

it("lists a composer's landed entries under the id they will be saved with", () => {
  const landed = landedResources([
    { localId: "l1", status: "done", kind: "file", file_name: "a.png", storage_path: "projects/p/a", mime_type: "image/png", size_bytes: 1 },
    { localId: "l2", status: "uploading", kind: "file", file_name: "b.png", storage_path: "", mime_type: "image/png", size_bytes: 1 },
  ]);
  expect(landed.map((entry) => entry.id)).toEqual(["l1"]);
});

// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectOrb } from "@/components/project-orb";
import { MentionSuggestions, type MentionOption } from "@/components/mention-suggest";
import { isPersistableKey } from "./query-provider";
import { projectIconQueryKey } from "./use-project-icon";

vi.mock("mangue-ui", () => ({
  cn: (...classes: unknown[]) => classes.filter(Boolean).join(" "),
}));

const projectId = "11111111-1111-4111-8111-111111111111";
const iconUrl = `/api/projects/${projectId}/icon/content?v=1`;
const nextIconUrl = `/api/projects/${projectId}/icon/content?v=2`;
const option: MentionOption = { type: "project", id: projectId, label: "Project", iconUrl };
const fetchIcon = vi.fn();
let client: QueryClient;
let root: Root;
let host: HTMLDivElement;

function response(content = "first icon") {
  return { ok: true, blob: async () => new Blob([content], { type: "image/webp" }) };
}

function menu(options = [option]) {
  return createElement(MentionSuggestions, {
    options, activeIndex: 0, onPick: vi.fn(), onHover: vi.fn(),
  });
}

async function render(children: ReactNode, withProvider = true) {
  await act(async () => root.render(withProvider
    ? createElement(QueryClientProvider, { client }, children)
    : children));
}

async function expectImages(count: number) {
  await vi.waitFor(async () => {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(host.querySelectorAll("img")).toHaveLength(count);
  });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", fetchIcon);
  HTMLElement.prototype.scrollIntoView = vi.fn();
  fetchIcon.mockReset();
  fetchIcon.mockResolvedValue(response());
  client = new QueryClient();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
  vi.unstubAllGlobals();
});

describe("protected project icon memory cache", () => {
  it("reopens the mention menu with the loaded image and no additional request", async () => {
    await render(menu());
    await expectImages(1);
    const source = host.querySelector("img")!.src;
    expect(source).toMatch(/^data:image\/webp;base64,/);
    await render(null);
    await render(menu());
    expect(host.querySelector("img")!.src).toBe(source);
    expect(fetchIcon).toHaveBeenCalledTimes(1);
    expect(fetchIcon).toHaveBeenCalledWith(iconUrl, {
      signal: expect.any(AbortSignal), credentials: "same-origin",
    });
  });

  it("shares an in-flight request between the sidebar orb and mention suggestions", async () => {
    let finish!: (value: ReturnType<typeof response>) => void;
    fetchIcon.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    await render(createElement("div", null,
      createElement(ProjectOrb, { seed: projectId, iconUrl }), menu()));
    expect(fetchIcon).toHaveBeenCalledTimes(1);
    await act(async () => finish(response()));
    await expectImages(2);
    expect(host.querySelectorAll("img")[0].src).toBe(host.querySelectorAll("img")[1].src);
  });

  it("loads a changed URL immediately without showing the previous icon", async () => {
    await render(menu());
    await expectImages(1);
    const previous = host.querySelector("img")!.src;
    let finish!: (value: ReturnType<typeof response>) => void;
    fetchIcon.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    await render(menu([{ ...option, iconUrl: nextIconUrl }]));
    expect(host.querySelector("img")).toBeNull();
    await act(async () => finish(response("second icon")));
    await expectImages(1);
    expect(host.querySelector("img")!.src).not.toBe(previous);
    expect(fetchIcon).toHaveBeenCalledTimes(2);
  });

  it("revalidates expired image data when the menu opens", async () => {
    client.setQueryData(projectIconQueryKey(iconUrl), "data:image/webp;base64,b2xk", {
      updatedAt: Date.now() - 5 * 60_000 - 1,
    });
    await render(menu());
    await vi.waitFor(() => expect(fetchIcon).toHaveBeenCalledTimes(1));
    await expectImages(1);
  });

  it("discards inactive image data after five minutes", async () => {
    await render(menu());
    await expectImages(1);
    vi.useFakeTimers();
    await render(null);
    expect(client.getQueryData(projectIconQueryKey(iconUrl))).toBeDefined();
    await act(async () => vi.advanceTimersByTimeAsync(5 * 60_000 + 1));
    expect(client.getQueryData(projectIconQueryKey(iconUrl))).toBeUndefined();
  });

  it("cancels pending downloads and ignores late results after cache cleanup", async () => {
    let finish!: (value: ReturnType<typeof response>) => void;
    fetchIcon.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    await render(menu());
    const signal = fetchIcon.mock.calls[0][1].signal as AbortSignal;
    await render(null);
    client.clear();
    expect(signal.aborted).toBe(true);
    await act(async () => finish(response("late private icon")));
    expect(client.getQueryData(projectIconQueryKey(iconUrl))).toBeUndefined();
  });

  it("returns to the gradient when authorization or image decoding fails", async () => {
    fetchIcon.mockResolvedValueOnce({ ok: false });
    await render(menu());
    await vi.waitFor(async () => {
      await act(async () => {});
      expect(client.getQueryState(projectIconQueryKey(iconUrl))?.status).toBe("error");
    });
    expect(host.querySelector("img")).toBeNull();
    expect(host.querySelector('[style*="mask-image"]')).not.toBeNull();
    await render(menu([{ ...option, iconUrl: nextIconUrl }]));
    await expectImages(1);
    await act(async () => host.querySelector("img")!.dispatchEvent(new Event("error")));
    expect(host.querySelector("img")).toBeNull();
    expect(host.querySelector('[style*="mask-image"]')).not.toBeNull();
  });

  it("keeps icon image data out of persisted query snapshots", async () => {
    await render(menu());
    await expectImages(1);
    const query = client.getQueryCache().find({ queryKey: projectIconQueryKey(iconUrl) })!;
    expect(query.state.data).toMatch(/^data:image/);
    expect(isPersistableKey(query.queryKey)).toBe(false);
  });

  it.each([
    "https://storage.example/project.webp?v=1",
    "data:image/webp;base64,cHVibGlj",
    `${iconUrl}&share_token=public&share_kind=share`,
  ])("retains direct image rendering for public and legacy URL %s", async (url) => {
    await render(menu([{ ...option, iconUrl: url }]));
    expect(host.querySelector("img")!.getAttribute("src")).toBe(url);
    expect(fetchIcon).not.toHaveBeenCalled();
  });

  it("renders protected icons directly on surfaces without a query provider", async () => {
    await render(createElement(ProjectOrb, { seed: projectId, iconUrl }), false);
    expect(host.querySelector("img")!.getAttribute("src")).toBe(iconUrl);
    expect(fetchIcon).not.toHaveBeenCalled();
  });
});

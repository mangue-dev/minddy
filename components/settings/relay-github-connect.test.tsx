// @vitest-environment jsdom
import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { RelayGithubConnect } from "./relay-github-connect";

const state = vi.hoisted(() => ({
  router: { replace: vi.fn() },
  params: new URLSearchParams("code=claim-code"),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => state.router,
  useSearchParams: () => state.params,
}));
vi.mock("@hugeicons/react", () => ({ HugeiconsIcon: () => null }));
vi.mock("@/components/icon", () => ({ AppIcon: () => null }));
vi.mock("@/components/git/provider-icons", () => ({ Github: () => null }));
vi.mock("@/components/ui/button", () => ({
  Button: ({ asChild: _asChild, variant: _variant, ...props }: ComponentProps<"button"> & { asChild?: boolean; variant?: string }) => <button {...props} />,
}));

let host: HTMLDivElement;
let root: Root;
const fetchMock = vi.fn<typeof fetch>();
const reply = (status: number, data: unknown) => new Response(JSON.stringify(data), { status });
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

beforeEach(async () => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("open", vi.fn());
  fetchMock.mockReset();
  state.router.replace.mockReset();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function render() {
  await act(async () => {
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <NextIntlClientProvider locale="en" messages={messages}>
          <RelayGithubConnect />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );
  });
}

describe("RelayGithubConnect polling", () => {
  it("stops polling once connected and navigates back only once", async () => {
    fetchMock.mockResolvedValue(reply(200, { status: "connected" }));
    await render();
    await advance(10_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(state.router.replace).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain(messages.RelayClaim.connected);
  });

  it("never leaves a refusal for a later success", async () => {
    fetchMock.mockResolvedValueOnce(reply(403, { error: "expired" })).mockResolvedValue(reply(200, { status: "connected" }));
    await render();
    await advance(10_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("expired");
    expect(state.router.replace).not.toHaveBeenCalled();
  });

  it("waits for a slow poll to settle before sending the next one", async () => {
    let settle!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => { settle = resolve; }))
      .mockResolvedValue(reply(200, { status: "pending" }));
    await render();
    await advance(10_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => settle(reply(200, { status: "pending" })));
    await advance(2_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

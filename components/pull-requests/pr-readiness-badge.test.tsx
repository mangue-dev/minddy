// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { PrReadinessBadge, PrReadinessControl } from "./pr-readiness";
import type { PullRequestReadiness } from "@/lib/pr-readiness";

// The full design system pulls in emoji data that Node cannot import without attributes.
vi.mock("@/components/ui/badge", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
vi.mock("@/components/pull-requests/pr-insights", () => ({ ChecksDonut: () => null }));

const render = (node: React.ReactNode) =>
  renderToStaticMarkup(<NextIntlClientProvider locale="en" messages={messages}>{node}</NextIntlClientProvider>);

describe("PrReadinessBadge", () => {
  it("says the readiness is loading only while no read has failed", () => {
    expect(render(<PrReadinessBadge readiness={null} />)).toContain(messages.PullRequests.readinessLoading);
    const failed = render(<PrReadinessBadge readiness={null} unavailable />);
    expect(failed).toContain(messages.PullRequests.readinessUnavailable);
    expect(failed).not.toContain(messages.PullRequests.readinessLoading);
  });

  it("shows the draft state of a draft pull request instead of a loading label", () => {
    const draft = { state: "draft", blockers: [], passed: [], mergeAllowed: false } as unknown as PullRequestReadiness;
    const html = render(<PrReadinessBadge readiness={draft} unavailable />);
    expect(html).toContain(messages.PullRequests.readinessDraft);
    expect(html).not.toContain(messages.PullRequests.readinessLoading);
  });
});

describe("PrReadinessControl trigger", () => {
  const readiness = (state: string) =>
    ({ state, blockers: [], passed: [], mergeAllowed: state === "ready", methods: ["squash"], preferredMethod: "squash" }) as unknown as PullRequestReadiness;
  const control = (state: string, overrides: { merging?: boolean; mergeFlowActive?: boolean } = {}) => render(
    <PrReadinessControl readiness={readiness(state)} providerName="GitHub" canAct={() => false} acting={null}
      onAction={() => {}} canMerge merging={overrides.merging ?? false} onMerge={() => {}}
      mergeFlowActive={overrides.mergeFlowActive ?? false} autoMergeAllowed autoMerging={false} onToggleAutoMerge={() => {}} />,
  );

  it("says a merge is in flight instead of the state it started from", () => {
    const html = control("ready", { merging: true });
    expect(html).toContain(messages.PullRequests.readinessMerging);
    expect(html).not.toContain(messages.PullRequests.readinessReady);
  });

  it("names a registered auto-merge, even once the pull request is ready, in the state's color", () => {
    const blocked = control("checks_failing", { mergeFlowActive: true });
    expect(blocked).toContain(messages.PullRequests.readinessAutoMergeActive);
    expect(blocked).toContain("text-destructive");
    const ready = control("ready", { mergeFlowActive: true });
    expect(ready).toContain(messages.PullRequests.readinessAutoMergeActive);
    expect(ready).toContain("text-emerald-700");
  });

  it("paints a merged pull request in the merged purple, not as an error", () => {
    const html = control("merged", { mergeFlowActive: true });
    expect(html).toContain(messages.PullRequests.readinessMerged);
    expect(html).toContain("text-violet-700");
    expect(html).not.toContain("text-destructive");
  });
});

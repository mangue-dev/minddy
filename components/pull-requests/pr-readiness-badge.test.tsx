// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { PrReadinessBadge } from "./pr-readiness";
import type { PullRequestReadiness } from "@/lib/pr-readiness";

// The full design system pulls in emoji data that Node cannot import without attributes.
vi.mock("mangue-ui", () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  cn: (...names: unknown[]) => names.filter(Boolean).join(" "),
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

// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import type { PullRequestListItem } from "@/lib/agent-api";

// Render the popover's content inline: the test reads what it lists.
// Stubs for the UI primitives the component under test renders.
const uiStubs = vi.hoisted(() => {
  let value: Promise<Record<string, unknown>> | undefined;
  return () => (value ??= (async () => {
  const Pass = ({ children }: { children?: React.ReactNode }) => <>{children}</>;
  return {
    Button: ({ children }: { children?: React.ReactNode }) => <button type="button">{children}</button>,
    Popover: Pass, PopoverTrigger: Pass, PopoverContent: Pass,
    Spinner: () => null,
    cn: (...names: unknown[]) => names.filter(Boolean).join(" "),
  };
})());
});
vi.mock("@/components/ui/button", async (importOriginal) => {
  const stubs = await uiStubs();
  return { ...(await importOriginal<Record<string, unknown>>()), Button: stubs.Button };
});
vi.mock("@/components/ui/popover", async (importOriginal) => {
  const stubs = await uiStubs();
  return { ...(await importOriginal<Record<string, unknown>>()), Popover: stubs.Popover, PopoverTrigger: stubs.PopoverTrigger, PopoverContent: stubs.PopoverContent };
});
vi.mock("@/components/ui/spinner", async (importOriginal) => {
  const stubs = await uiStubs();
  return { ...(await importOriginal<Record<string, unknown>>()), Spinner: stubs.Spinner };
});
vi.mock("@/components/ui/app-tooltip", () => ({ AppTooltip: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/components/issue-indicators", () => ({
  StatusIndicator: ({ status }: { status: string }) => <span data-status={status} />,
}));
vi.mock("./pr-unlink-confirmation", () => ({ usePrUnlinkConfirmation: () => ({ isPending: false, requestUnlink: vi.fn() }) }));

const { PrLinkedIssues } = await import("./pr-linked-issues");

describe("PrLinkedIssues", () => {
  it("shows each linked issue's status in the popover, like the relations popover", () => {
    const item = {
      prId: "pr", issue: null, project: null,
      issues: [
        { id: "a", number: 1, title: "Ship it", project_id: "p", project_key: "MIN", status: "in_review" },
        { id: "b", number: 2, title: "Old work", project_id: "p", project_key: "MIN", status: "done" },
      ],
    } as unknown as PullRequestListItem;
    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale="en" messages={messages}>
        <PrLinkedIssues item={item} onOpenIssue={() => {}} />
      </NextIntlClientProvider>,
    );
    expect(html).toContain('data-status="in_review"');
    expect(html).toContain('data-status="done"');
    expect(html).toMatch(/line-through[^>]*>Old work/);
  });
});

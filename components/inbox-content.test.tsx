// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "@/messages/en.json";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { MyNotification } from "@/lib/types";

const mocks = vi.hoisted(() => ({ notifications: [] as MyNotification[] }));
vi.mock("next-intl", () => ({
  useTranslations: (namespace: keyof typeof en) => (key: string, values: Record<string, unknown> = {}) =>
    Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
      (en[namespace] as Record<string, string>)[key] ?? key),
  useFormatter: () => ({ dateTime: () => "date" }),
}));
vi.mock("@/lib/use-live-now", () => ({ useTimeAgo: () => () => "now" }));
vi.mock("@/lib/use-app-router", () => ({ useAppRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/use-notifications", () => ({
  useNotifications: () => ({
    notifications: mocks.notifications,
    unreadCount: mocks.notifications.filter((n) => !n.read_at).length,
    loading: false,
    markRead: vi.fn(), markAllRead: vi.fn(), markUnread: vi.fn(), remove: vi.fn(), clearRead: vi.fn(),
  }),
}));
vi.mock("@/lib/use-invitations-query", () => ({
  useInvitationResponder: () => ({ invitations: [], busyId: null, answer: vi.fn() }),
}));
vi.mock("@hugeicons/react", () => ({ HugeiconsIcon: () => null }));
vi.mock("@/components/app-link", () => ({ default: ({ children }: { children: React.ReactNode }) => <a>{children}</a> }));
vi.mock("@/components/empty-scene", () => ({ EmptyScene: ({ title }: { title: string }) => <p>{title}</p> }));

import InboxContent, { inboxFilterFor, type InboxFocus } from "./inbox-content";

function notification(id: string, fields: Partial<MyNotification> = {}): MyNotification {
  return {
    id, type: "comment", read_at: null, created_at: new Date().toISOString(),
    issue_id: "i1", issue_number: 4, issue_title: `Ticket ${id}`,
    objective_id: null, objective_name: null, feedback_post_id: null, feedback_title: null,
    routine_id: null, routine_title: null, pull_request_id: null, pull_request_number: null,
    pull_request_title: null, page_id: null, page_title: null, block_id: null,
    project_id: "p1", project_key: "MIN", actor_name: "Ana", actor_avatar_seed: null,
    from_numo: false, via_mcp: false, api_key_agent: null, api_key_name: null,
    via_smart_assign: false, via_automation: false, comment_excerpt: null,
    ...fields,
  } as MyNotification;
}

let host: HTMLDivElement;
let root: Root;
const scrolled: string[] = [];

function render(focus: InboxFocus | null) {
  act(() => root.render(
    <TooltipProvider>
      <InboxContent onNavigate={() => {}} focus={focus} />
    </TooltipProvider>,
  ));
}

const pressedFilter = () => host.querySelector("[aria-pressed=true]")?.textContent;
const pulsing = () =>
  Array.from(host.querySelectorAll<HTMLElement>(".inbox-row-target")).map((row) => row.dataset.notificationId);

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  // The confirmation dialogs adapt to the viewport.
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false,
  }));
  // The scrolling list measures its edges to fade them.
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  scrolled.length = 0;
  Element.prototype.scrollIntoView = function (this: HTMLElement) {
    scrolled.push(this.dataset.notificationId ?? "");
  };
  mocks.notifications = [
    notification("unread"),
    notification("read", { read_at: new Date().toISOString() }),
  ];
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("InboxContent targeting (MIN-846)", () => {
  it("lists a notification under Unread while unread, All once read", () => {
    expect(inboxFilterFor({ read_at: null })).toBe("unread");
    expect(inboxFilterFor({ read_at: "2026-10-29T00:00:00Z" })).toBe("all");
  });

  it("opens the tab that lists a read notification, scrolls to it and pulses it once", () => {
    render(null);
    expect(pressedFilter()).toContain(en.Inbox.filterUnread);
    expect(pulsing()).toEqual([]);

    render({ id: "read", seq: 1 });
    expect(pressedFilter()).toContain(en.Inbox.filterAll);
    expect(pulsing()).toEqual(["read"]);
    expect(scrolled).toEqual(["read"]);

    act(() => vi.advanceTimersByTime(1_700));
    expect(pulsing()).toEqual([]);

    // A refreshed list does not replay a request already handled.
    mocks.notifications = [...mocks.notifications];
    render({ id: "read", seq: 1 });
    expect(pulsing()).toEqual([]);
  });

  it("waits for the row to load, and pulses again on a new request", () => {
    mocks.notifications = [];
    render({ id: "unread", seq: 1 });
    expect(pulsing()).toEqual([]);

    mocks.notifications = [notification("unread")];
    render({ id: "unread", seq: 1 });
    expect(pressedFilter()).toContain(en.Inbox.filterUnread);
    expect(pulsing()).toEqual(["unread"]);

    render({ id: "unread", seq: 2 });
    expect(pulsing()).toEqual(["unread"]);
    expect(scrolled).toEqual(["unread", "unread"]);
  });
});

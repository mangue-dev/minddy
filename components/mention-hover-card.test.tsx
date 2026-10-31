// @vitest-environment jsdom
//
// The body of a mention's hover card (MIN-879): what each type shows once
// the server answered.
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { MentionPreview, PreviewProject } from "@/lib/mention-preview";

vi.mock("@/components/user-avatar", () => ({ UserAvatar: () => null }));
vi.mock("@/components/project-orb", () => ({ ProjectOrb: () => null }));
vi.mock("@/components/issue-card", () => ({ IssueCardBody: () => null }));
// The excerpt is the read-only document editor, covered on its own.
vi.mock("@/components/editor/document-editor-lazy", () => ({
  LazyDocumentEditor: ({ value, readOnly }: { value: string; readOnly?: boolean }) =>
    createElement("div", { "data-excerpt": readOnly ? "read-only" : "editable" }, value),
}));

const { MentionPreviewCard } = await import("./mention-preview-cards");
const { MentionHover } = await import("./mention-hover");

const project: PreviewProject = { id: "p1", name: "Minddy", key: "MIN", orbSeed: "p1", iconUrl: null };
let root: Root;
let host: HTMLElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

async function render(preview: MentionPreview) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrap = (children: ReactNode) =>
    createElement(QueryClientProvider, {
      client,
      children: createElement(NextIntlClientProvider, {
        locale: "en", messages, timeZone: "UTC",
        children: createElement(TooltipProvider, { children }),
      }),
    });
  await act(async () => {
    root.render(wrap(createElement(MentionPreviewCard, { preview })));
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}

describe("MentionPreviewCard", () => {
  it("shows a page's first lines through the read-only editor", async () => {
    await render({
      type: "page", project, title: "Launch plan", icon: "🚀", updatedAt: null, database: null,
      excerpt: "## Scope\n- [x] Pricing page\n- [ ] Announcement\nThe rest waits.",
    });
    expect(host.textContent).toContain("Launch plan");
    expect(host.textContent).toContain("Minddy");
    const excerpt = host.querySelector("[data-excerpt]");
    expect(excerpt?.getAttribute("data-excerpt")).toBe("read-only");
    expect(excerpt?.textContent).toBe("## Scope\n- [x] Pricing page\n- [ ] Announcement\nThe rest waits.");
  });

  it("shows a database's first rows and how many more it holds", async () => {
    await render({
      type: "page", project, title: "Releases", icon: null, updatedAt: null, excerpt: "",
      database: {
        titleName: null,
        columns: [{ name: "Status", type: "select" }, { name: "Released", type: "date" }, { name: "Public", type: "checkbox" }],
        rows: [{
          title: "0.21", icon: null,
          cells: [
            { kind: "options", options: [{ name: "Shipped", color: "#16a34a" }], single: true },
            { kind: "date", value: "2026-10-31" },
            { kind: "checkbox", checked: true },
          ],
        }],
        total: 4,
      },
    });
    // The table's own header, with the title column's default name.
    expect([...host.querySelectorAll("th")].map((cell) => cell.textContent)).toEqual(["Name", "Status", "Released", "Public"]);
    expect([...host.querySelectorAll("td")].slice(0, 3).map((cell) => cell.textContent)).toEqual(["0.21", "Shipped", "Oct 31, 2026"]);
    expect(host.querySelector("[data-database-option-badge]")?.textContent).toBe("Shipped");
    expect(host.querySelector("[role=checkbox]")?.getAttribute("data-state")).toBe("checked");
    expect(host.textContent).toContain("3 more rows");
  });

  it("shows a person's account and their role where the mention is read", async () => {
    await render({
      type: "member", name: "Camille Roy", email: "camille@example.com", avatarSeed: "seed",
      membership: { projectName: "Minddy", role: "reader", joinedAt: "2026-09-01T10:00:00Z" },
    });
    expect(host.textContent).toContain("Camille Roy");
    expect(host.textContent).toContain("camille@example.com");
    expect(host.textContent).toContain("Joined Minddy on Sep 1, 2026");
    expect(host.querySelector("[data-slot=badge]")?.textContent).toBe("Reader");
  });

  it("lists a project's members with their roles", async () => {
    await render({
      type: "project", project, memberCount: 11,
      members: [
        { userId: "u1", name: "Camille Roy", avatarSeed: "s1", role: "owner" },
        { userId: "u2", name: "Alice Martin", avatarSeed: "s2", role: "reader" },
      ],
    });
    expect([...host.querySelectorAll("li")].map((item) => item.textContent)).toEqual(["Camille RoyOwner", "Alice MartinReader"]);
    expect(host.textContent).toContain("9 more members");
  });

  it("shows a routine's state as a badge beside its name, under its project", async () => {
    await render({ type: "routine", project, title: "Weekly triage", excerpt: "Sort the inbox.", enabled: false, nextRunAt: null });
    expect(host.firstElementChild?.firstElementChild?.textContent).toBe("Minddy");
    expect(host.querySelector("[data-slot=badge]")?.textContent).toBe("Paused");
  });

  it("shows an objective's progress beside its name", async () => {
    await render({
      type: "objective", project,
      objective: { id: "o1", name: "Search v2", color: "#3b82f6", status: "in_progress", targetDate: null },
      excerpt: "", lead: null, relations: [],
      issues: [{ status: "done", effort: "m" }, { status: "todo", effort: "m" }],
    });
    expect(host.textContent).toContain("Search v2");
    expect(host.textContent).toContain("1/2");
    // The ring says the count and the indicator the status: no words repeat them.
    expect(host.textContent).not.toContain("2 issues");
    expect(host.textContent).not.toContain("In progress");
  });

  it("counts an MCP server's tools only when it is signed in", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ tools: 12 })));
    vi.stubGlobal("fetch", fetchMock);
    await render({ type: "mcp", id: "m1", name: "Linear", service: "linear", enabled: true, auth: "oauth", connected: true });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
    expect(host.querySelector("[data-slot=badge]")?.textContent).toBe("Signed in");
    expect(host.textContent).toContain("12 tools");
    // The tool count, not the server's address.
    expect(host.textContent).not.toContain("mcp.linear.app");
    expect(fetchMock).toHaveBeenCalledWith("/api/account/mcp-connections/m1/test", { method: "POST" });

    fetchMock.mockClear();
    await render({ type: "mcp", id: "m2", name: "Notion", service: null, enabled: true, auth: "oauth", connected: false });
    expect(host.textContent).toContain("Sign-in needed");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("MentionHover", () => {
  it("renders the trigger alone where the signed-in app does not provide the card", async () => {
    await act(async () => {
      root.render(createElement(MentionHover, { type: "issue", id: "i1", children: createElement("span", null, "MIN-42") }));
    });
    expect(host.innerHTML).toBe("<span>MIN-42</span>");
  });
});

describe("MentionHoverCard", () => {
  it("does what a click on the mention does when its card is clicked", async () => {
    const { MentionHoverCard } = await import("./mention-hover-card");
    const onOpen = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ preview: null }))));
    const client = new QueryClient();
    await act(async () => {
      root.render(createElement(QueryClientProvider, {
        client,
        children: createElement(NextIntlClientProvider, {
          locale: "en", messages, timeZone: "UTC",
          children: createElement(MentionHoverCard, {
            type: "page", id: "p1", onOpen,
            children: createElement("button", { type: "button" }, "Spec"),
          }),
        }),
      }));
    });
    const trigger = host.querySelector("button")!;
    // Focus opens it too, after the hover delay.
    vi.useFakeTimers();
    try {
      await act(async () => {
        trigger.focus();
        vi.advanceTimersByTime(500);
      });
    } finally {
      vi.useRealTimers();
    }
    const card = document.querySelector("[data-slot=hover-card-content] > div") as HTMLElement | null;
    expect(card).not.toBeNull();
    await act(async () => card!.click());
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("clicks its trigger when it has no action of its own", async () => {
    const { MentionHoverCard } = await import("./mention-hover-card");
    const onClick = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ preview: null }))));
    await act(async () => {
      root.render(createElement(QueryClientProvider, {
        client: new QueryClient(),
        children: createElement(NextIntlClientProvider, {
          locale: "en", messages, timeZone: "UTC",
          children: createElement(MentionHoverCard, {
            type: "page", id: "p1",
            children: createElement("a", { href: "/p", onClick: (event: Event) => { event.preventDefault(); onClick(); } }, "Spec"),
          }),
        }),
      }));
    });
    vi.useFakeTimers();
    try {
      await act(async () => {
        host.querySelector("a")!.focus();
        vi.advanceTimersByTime(500);
      });
    } finally {
      vi.useRealTimers();
    }
    await act(async () => (document.querySelector("[data-slot=hover-card-content] > div") as HTMLElement).click());
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("reads the card ahead once the pointer rests, and not when it only crosses", async () => {
    const { MentionHoverCard } = await import("./mention-hover-card");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ preview: null })));
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => {
      root.render(createElement(QueryClientProvider, {
        client: new QueryClient(),
        children: createElement(NextIntlClientProvider, {
          locale: "en", messages, timeZone: "UTC",
          children: createElement(MentionHoverCard, {
            type: "page", id: "p1",
            children: createElement("a", { href: "/p" }, "Spec"),
          }),
        }),
      }));
    });
    const link = host.querySelector("a")!;
    const pointer = (type: string, related: Element | null) =>
      new MouseEvent(type, { bubbles: true, relatedTarget: related });
    vi.useFakeTimers();
    try {
      // Crossing: in and out before the intent delay.
      await act(async () => {
        link.dispatchEvent(pointer("pointerover", document.body));
        vi.advanceTimersByTime(100);
        link.dispatchEvent(pointer("pointerout", document.body));
        vi.advanceTimersByTime(400);
      });
      expect(fetchMock).not.toHaveBeenCalled();
      // Resting: read ahead, before the card's own delay opens it.
      await act(async () => {
        link.dispatchEvent(pointer("pointerover", document.body));
        vi.advanceTimersByTime(160);
      });
      expect(fetchMock).toHaveBeenCalledWith("/api/mentions/preview?type=page&id=p1");
      expect(document.querySelector("[data-slot=hover-card-content]")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not reopen the card when its trigger is clicked, which focuses it", async () => {
    const { MentionHoverCard } = await import("./mention-hover-card");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ preview: null }))));
    await act(async () => {
      root.render(createElement(QueryClientProvider, {
        client: new QueryClient(),
        children: createElement(NextIntlClientProvider, {
          locale: "en", messages, timeZone: "UTC",
          children: createElement(MentionHoverCard, {
            type: "page", id: "p1",
            children: createElement("button", { type: "button" }, "Spec"),
          }),
        }),
      }));
    });
    const trigger = host.querySelector("button")!;
    vi.useFakeTimers();
    try {
      await act(async () => {
        trigger.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
        trigger.focus();
        // The pointer leaves while the trigger keeps focus.
        trigger.dispatchEvent(new MouseEvent("pointerout", { bubbles: true, relatedTarget: document.body }));
        vi.advanceTimersByTime(600);
      });
    } finally {
      vi.useRealTimers();
    }
    expect(document.querySelector("[data-slot=hover-card-content]")).toBeNull();
  });
});

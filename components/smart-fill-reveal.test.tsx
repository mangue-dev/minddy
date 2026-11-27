// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import {
  beginSmartFillReveal,
  endSmartFillReveal,
  landSmartFillReveal,
} from "@/lib/smart-fill-reveal";
import type { Issue } from "@/lib/types";
import { SmartFillReveal } from "./smart-fill-reveal";

// The frame shows which phase the card asked for; the sweep itself is CSS.
vi.mock("@/components/smart-fill-reveal-frame", () => ({
  default: ({ phase, children }: { phase: string; children: ReactNode }) => (
    <div data-phase={phase}>{children}</div>
  ),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const placeholder = {
  id: "card",
  number: 6,
  title: "Export fails on long reports",
  priority: "none",
  effort: null,
  objective_id: null,
  assignee_id: null,
  category_ids: [],
} as unknown as Issue;
const filled = {
  ...placeholder,
  number: 7,
  title: "PDF export fails past 40 pages",
  priority: "high",
  category_ids: ["bug"],
} as unknown as Issue;

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

function renderCard(issue: Issue) {
  act(() => {
    root.render(
      <SmartFillReveal issue={issue} renderPlaceholder={() => <span>empty</span>}>
        <span>{issue.title}</span>
      </SmartFillReveal>,
    );
  });
}

/** The phase the frame shows, once its lazy chunk has resolved. */
async function phase(): Promise<string | null | undefined> {
  await act(async () => {});
  return host.querySelector("[data-phase]")?.getAttribute("data-phase");
}

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  endSmartFillReveal("card");
  vi.useRealTimers();
});

describe("SmartFillReveal", () => {
  it("renders a card Smart Fill is not filling as is", () => {
    renderCard(filled);
    expect(host.innerHTML).toBe("<span>PDF export fails past 40 pages</span>");
  });

  it("starts the sweep only once the card renders the landed row", async () => {
    beginSmartFillReveal(placeholder);
    renderCard(placeholder);
    expect(await phase()).toBe("filling");

    // The store learns the row first; the card still renders the old one.
    act(() => landSmartFillReveal(filled));
    expect(await phase()).toBe("filling");

    renderCard(filled);
    expect(await phase()).toBe("revealing");
    expect(host.textContent).toContain("PDF export fails past 40 pages");
  });

  it("keeps sweeping when the row changes again during the sweep", async () => {
    beginSmartFillReveal(placeholder);
    renderCard(placeholder);
    act(() => landSmartFillReveal(filled));
    renderCard(filled);
    expect(await phase()).toBe("revealing");
    renderCard({ ...filled, priority: "urgent" } as Issue);
    expect(await phase()).toBe("revealing");
  });

  it("sweeps anyway when the row the card renders never matches", async () => {
    vi.useFakeTimers();
    beginSmartFillReveal(placeholder);
    renderCard(placeholder);
    act(() => landSmartFillReveal(filled));
    // Edited elsewhere before the card caught up: it never equals the landed row.
    renderCard({ ...filled, title: "Renamed by a teammate" } as Issue);
    expect(await phase()).toBe("filling");
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(await phase()).toBe("revealing");
  });
});

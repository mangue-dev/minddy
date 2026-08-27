// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { useFormatter, useLocale, useTimeZone } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BrowserIntlProvider,
  InheritedIntlProvider,
} from "@/components/browser-intl-provider";

function DeadlineLabels() {
  const format = useFormatter();
  const timeZone = useTimeZone();
  const date = format.dateTime(new Date("2026-08-30T22:00:00.000Z"), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const timed = format.dateTime(new Date("2026-08-31T07:00:00.000Z"), {
    hour: "2-digit",
    minute: "2-digit",
  });

  return createElement("span", null, `${timeZone}|${date}|${timed}`);
}

function InheritedLocale() {
  return createElement("span", null, useLocale());
}

describe("BrowserIntlProvider", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("formats stored instants in the browser time zone after hydration", async () => {
    const resolvedOptions = Intl.DateTimeFormat.prototype.resolvedOptions;
    vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockImplementation(
      function (this: Intl.DateTimeFormat) {
        return { ...resolvedOptions.call(this), timeZone: "Europe/Paris" };
      },
    );

    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(
          BrowserIntlProvider,
          {
            locale: "fr",
            messages: {},
            initialTimeZone: "UTC",
            children: createElement(DeadlineLabels),
          },
        ),
      );
    });

    expect(container.textContent).toMatch(
      /^Europe\/Paris\|31\/08\/2026\|09:00$/,
    );

    act(() => root.unmount());
  });

  it("passes the parent locale to a nested catalog provider", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(
          BrowserIntlProvider,
          {
            locale: "fr",
            messages: {},
            initialTimeZone: "UTC",
            children: createElement(
              InheritedIntlProvider,
              {
                messages: {},
                children: createElement(InheritedLocale),
              },
            ),
          },
        ),
      );
    });

    expect(container.textContent).toBe("fr");

    act(() => root.unmount());
  });
});

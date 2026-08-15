import { describe, expect, it } from "vitest";

import { nativePushContent, nativePushTarget } from "./native-push";

describe("nativePushContent", () => {
  it("lit le titre, le corps et la destination APNs", () => {
    expect(
      nativePushContent({
        aps: { alert: { title: "MIN-356", body: "Clément a commenté" } },
        url: "/projects/p?issue=i",
      })
    ).toEqual({
      title: "MIN-356",
      body: "Clément a commenté",
      url: "/projects/p?issue=i",
    });
  });

  it("accepte la forme courte d'alert", () => {
    expect(nativePushContent({ aps: { alert: "Du nouveau" } })).toEqual({
      title: "minddy",
      body: "Du nouveau",
      url: null,
    });
  });

  it("refuse une charge sans alerte visible", () => {
    expect(nativePushContent({ aps: { "content-available": 1 } })).toBeNull();
  });
});

describe("nativePushTarget", () => {
  it("garde uniquement une route relative", () => {
    expect(nativePushTarget("/inbox#latest")).toBe("/inbox#latest");
    expect(nativePushTarget("https://evil.example/")).toBeNull();
    expect(nativePushTarget("//evil.example/")).toBeNull();
  });
});

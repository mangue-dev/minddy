import { describe, expect, it } from "vitest";
import { microphoneRequestAllowed } from "./media-guard";

const ORIGIN = "https://www.minddy.app";

describe("microphoneRequestAllowed", () => {
  it("allows dictation from our origin through", () => {
    // The exact form that Chromium passes: the origin has a final slash.
    expect(
      microphoneRequestAllowed(
        { securityOrigin: `${ORIGIN}/`, mediaTypes: ["audio"] },
        ORIGIN
      )
    ).toBe(true);
  });

  it("falls back to the frame URL when the origin is missing", () => {
    expect(
      microphoneRequestAllowed(
        { requestingUrl: `${ORIGIN}/projects/x`, mediaTypes: ["audio"] },
        ORIGIN
      )
    ).toBe(true);
  });

  it("rejects the camera, alone or accompanied", () => {
    expect(
      microphoneRequestAllowed(
        { securityOrigin: `${ORIGIN}/`, mediaTypes: ["video"] },
        ORIGIN
      )
    ).toBe(false);
    expect(
      microphoneRequestAllowed(
        { securityOrigin: `${ORIGIN}/`, mediaTypes: ["audio", "video"] },
        ORIGIN
      )
    ).toBe(false);
  });

  it("rejects a request that does not say what it opens", () => {
    expect(
      microphoneRequestAllowed({ securityOrigin: `${ORIGIN}/` }, ORIGIN)
    ).toBe(false);
    expect(
      microphoneRequestAllowed(
        { securityOrigin: `${ORIGIN}/`, mediaTypes: [] },
        ORIGIN
      )
    ).toBe(false);
  });

  it("refuse tout ce qui n'est pas notre origine", () => {
    expect(
      microphoneRequestAllowed(
        { securityOrigin: "https://evil.example/", mediaTypes: ["audio"] },
        ORIGIN
      )
    ).toBe(false);
    // Subdomain and same host in plain text: third parties like the others.
    expect(
      microphoneRequestAllowed(
        { securityOrigin: "https://docs.minddy.app/", mediaTypes: ["audio"] },
        ORIGIN
      )
    ).toBe(false);
    expect(
      microphoneRequestAllowed(
        { securityOrigin: "http://www.minddy.app/", mediaTypes: ["audio"] },
        ORIGIN
      )
    ).toBe(false);
  });

  it("rejects a request without provenance or an unreadable one", () => {
    expect(microphoneRequestAllowed({ mediaTypes: ["audio"] }, ORIGIN)).toBe(
      false
    );
    expect(
      microphoneRequestAllowed(
        { securityOrigin: "pas une url", mediaTypes: ["audio"] },
        ORIGIN
      )
    ).toBe(false);
  });

  it("suit l'origine qu'on lui donne (dev sur localhost)", () => {
    const dev = "http://localhost:3000";
    expect(
      microphoneRequestAllowed(
        { securityOrigin: "http://localhost:3000/", mediaTypes: ["audio"] },
        dev
      )
    ).toBe(true);
    expect(
      microphoneRequestAllowed(
        { securityOrigin: `${ORIGIN}/`, mediaTypes: ["audio"] },
        dev
      )
    ).toBe(false);
  });
});

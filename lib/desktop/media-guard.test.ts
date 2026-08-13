import { describe, expect, it } from "vitest";
import { microphoneRequestAllowed } from "./media-guard";

const ORIGIN = "https://www.minddy.app";

describe("microphoneRequestAllowed", () => {
  it("laisse passer une dictée de notre origine", () => {
    // La forme exacte que passe Chromium : l'origine porte un slash final.
    expect(
      microphoneRequestAllowed(
        { securityOrigin: `${ORIGIN}/`, mediaTypes: ["audio"] },
        ORIGIN
      )
    ).toBe(true);
  });

  it("retombe sur l'URL de la frame quand l'origine manque", () => {
    expect(
      microphoneRequestAllowed(
        { requestingUrl: `${ORIGIN}/projects/x`, mediaTypes: ["audio"] },
        ORIGIN
      )
    ).toBe(true);
  });

  it("refuse la caméra, seule ou accompagnée", () => {
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

  it("refuse une demande qui ne dit pas ce qu'elle ouvre", () => {
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
    // Sous-domaine et même hôte en clair : des tierces parties comme les autres.
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

  it("refuse une demande sans provenance, ou illisible", () => {
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

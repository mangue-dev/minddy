import { describe, expect, it } from "vitest";
import {
  collectSignedAssets,
  forgeAssetId,
  forgeImageSrc,
  isForgeAssetId,
  signedForgeAssetId,
} from "./forge-image-assets";

const UUID = "22560e52-8a83-49d1-93d5-39a47187b7e0";
const PUBLIC_URL = `https://github.com/user-attachments/assets/${UUID}`;
// Forme exacte mesurée contre l'API (cf. la doc du module).
const SIGNED_URL =
  `https://private-user-images.githubusercontent.com/81526886/630179617-${UUID}.png` +
  "?jwt=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJnaXRodWIuY29tIn0.sig";

describe("forgeAssetId", () => {
  it("relit l'uuid d'une URL d'asset", () => {
    expect(forgeAssetId(PUBLIC_URL)).toBe(UUID);
  });

  it("ignore tout ce qui n'est pas un asset de commentaire", () => {
    expect(forgeAssetId("https://img.shields.io/badge/ci-passing-green.svg")).toBeNull();
    expect(forgeAssetId("https://github.com/mangue-dev/minddy/pull/30")).toBeNull();
    // Un hôte qui RESSEMBLE : le motif est ancré, il ne se laisse pas préfixer.
    expect(forgeAssetId(`https://evil.com/github.com/user-attachments/assets/${UUID}`)).toBeNull();
    expect(forgeAssetId(`http://github.com/user-attachments/assets/${UUID}`)).toBeNull();
    // Ni suffixe : `…/<uuid>/../../etc` ne doit pas passer pour un uuid.
    expect(forgeAssetId(`${PUBLIC_URL}/../../secret`)).toBeNull();
  });
});

describe("signedForgeAssetId", () => {
  it("relit le même uuid depuis l'URL signée", () => {
    expect(signedForgeAssetId(SIGNED_URL)).toBe(UUID);
  });

  it("refuse un autre hôte", () => {
    expect(
      signedForgeAssetId(`https://evil.example/81526886/630179617-${UUID}.png?jwt=x`),
    ).toBeNull();
  });
});

describe("isForgeAssetId", () => {
  it("n'accepte qu'une forme d'uuid", () => {
    expect(isForgeAssetId(UUID)).toBe(true);
    expect(isForgeAssetId(UUID.toUpperCase())).toBe(true);
    expect(isForgeAssetId("../../../etc/passwd")).toBe(false);
    expect(isForgeAssetId("http://169.254.169.254/latest/meta-data")).toBe(false);
    expect(isForgeAssetId("")).toBe(false);
  });
});

describe("collectSignedAssets", () => {
  it("indexe les images d'un body_html par uuid", () => {
    const html = `<p><a href="${SIGNED_URL}"><img src="${SIGNED_URL.replace(
      /&/g,
      "&amp;",
    )}" alt="capture" /></a></p>`;
    const map = collectSignedAssets([html]);
    expect(map.get(UUID)).toBe(SIGNED_URL);
  });

  it("ne retient QUE l'hôte signé — pas une image tierce du même commentaire", () => {
    const html =
      `<img src="https://img.shields.io/badge/ci-passing.svg" />` +
      `<img src="http://169.254.169.254/latest/meta-data" />` +
      `<img src="${SIGNED_URL}" />`;
    const map = collectSignedAssets([html]);
    expect([...map.keys()]).toEqual([UUID]);
  });

  it("verse plusieurs surfaces dans la même table et ignore les vides", () => {
    const other = SIGNED_URL.replace(UUID, "11111111-2222-3333-4444-555555555555");
    const map = collectSignedAssets([
      null,
      undefined,
      "",
      `<img src="${SIGNED_URL}" />`,
      `<img src="${other}" />`,
    ]);
    expect(map.size).toBe(2);
    expect(map.get("11111111-2222-3333-4444-555555555555")).toBe(other);
  });

  it("garde le premier jwt quand un asset est cité deux fois", () => {
    const second = SIGNED_URL.replace("sig", "autre");
    const map = collectSignedAssets([`<img src="${SIGNED_URL}" />`, `<img src="${second}" />`]);
    expect(map.get(UUID)).toBe(SIGNED_URL);
  });
});

describe("forgeImageSrc", () => {
  const endpoint = "/api/pull-requests/abc";

  it("route un asset de commentaire vers le proxy de SA pull request", () => {
    expect(forgeImageSrc(PUBLIC_URL, endpoint)).toBe(
      `/api/pull-requests/abc/image?asset=${UUID}`,
    );
  });

  it("laisse passer tout le reste — un badge CI se sert très bien tout seul", () => {
    const badge = "https://img.shields.io/badge/ci-passing-green.svg";
    expect(forgeImageSrc(badge, endpoint)).toBe(badge);
    expect(forgeImageSrc(undefined, endpoint)).toBeUndefined();
  });
});

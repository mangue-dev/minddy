import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { parseResourcesInput, MAX_ATTACHMENTS_PER_ENTITY } = await import(
  "./attachments"
);

/**
 * MIN-184 — `parseResourcesInput` est la porte d'entrée des descripteurs que le
 * CLIENT compose. Rien de ce qui la franchit n'a été vu par le serveur ailleurs :
 * un chemin de storage y désigne un objet qu'on va rattacher à une entité, une
 * URL y devient un `href` sur lequel quelqu'un cliquera, un data URI y devient
 * le `src` d'une balise `<img>`.
 *
 * D'où la forme du contrat : elle rend `null` — jamais une liste amputée — dès
 * qu'UNE entrée cloche. Une validation qui jette silencieusement l'entrée fautive
 * enregistrerait le reste comme si de rien n'était, et personne ne verrait qu'il
 * manque quelque chose.
 */

const PREFIX = "projects/11111111-1111-4111-8111-111111111111/";

const file = (over: Record<string, unknown> = {}) => ({
  storage_path: `${PREFIX}abc/capture.png`,
  file_name: "capture.png",
  mime_type: "image/png",
  size_bytes: 1024,
  ...over,
});

const link = (over: Record<string, unknown> = {}) => ({
  kind: "link",
  url: "https://linear.app/docs",
  file_name: "Linear — Docs",
  ...over,
});

describe("parseResourcesInput — l'absence d'entrée", () => {
  it("accepte null et undefined comme « rien à enregistrer »", () => {
    expect(parseResourcesInput(null, PREFIX)).toEqual([]);
    expect(parseResourcesInput(undefined, PREFIX)).toEqual([]);
  });

  it("refuse ce qui n'est pas une liste", () => {
    expect(parseResourcesInput({ url: "https://x.com" }, PREFIX)).toBeNull();
    expect(parseResourcesInput("https://x.com", PREFIX)).toBeNull();
  });

  it("refuse au-delà du plafond, liens et fichiers confondus", () => {
    const eleven = Array.from({ length: MAX_ATTACHMENTS_PER_ENTITY + 1 }, (_, i) =>
      link({ url: `https://exemple.com/${i}` })
    );
    expect(parseResourcesInput(eleven, PREFIX)).toBeNull();
    expect(parseResourcesInput(eleven.slice(0, 10), PREFIX)).toHaveLength(10);
  });
});

describe("parseResourcesInput — un fichier", () => {
  it("accepte un fichier du bon préfixe", () => {
    expect(parseResourcesInput([file()], PREFIX)).toEqual([
      {
        storage_path: `${PREFIX}abc/capture.png`,
        file_name: "capture.png",
        mime_type: "image/png",
        size_bytes: 1024,
      },
    ]);
  });

  it("refuse un chemin hors du préfixe du projet", () => {
    const other = "projects/22222222-2222-4222-8222-222222222222/x/f.png";
    expect(parseResourcesInput([file({ storage_path: other })], PREFIX)).toBeNull();
  });

  it("refuse une traversée de chemin", () => {
    expect(
      parseResourcesInput([file({ storage_path: `${PREFIX}../../secret` })], PREFIX)
    ).toBeNull();
  });

  it("refuse un fichier au-dessus du plafond de taille", () => {
    expect(
      parseResourcesInput([file({ size_bytes: 21 * 1024 * 1024 })], PREFIX)
    ).toBeNull();
  });

  it("refuse un kind inconnu", () => {
    expect(parseResourcesInput([file({ kind: "folder" })], PREFIX)).toBeNull();
    expect(parseResourcesInput([link({ kind: "bookmark" })], PREFIX)).toBeNull();
  });
});

describe("parseResourcesInput — un lien", () => {
  it("accepte un lien http(s)", () => {
    expect(parseResourcesInput([link()], PREFIX)).toEqual([
      {
        kind: "link",
        url: "https://linear.app/docs",
        file_name: "Linear — Docs",
        icon_data_url: null,
      },
    ]);
  });

  it.each([
    ["javascript:", "javascript:alert(document.cookie)"],
    ["data:", "data:text/html,<script>alert(1)</script>"],
    ["file:", "file:///etc/passwd"],
    ["vbscript:", "vbscript:msgbox(1)"],
  ])("refuse un lien en %s", (_label, url) => {
    expect(parseResourcesInput([link({ url })], PREFIX)).toBeNull();
  });

  it("refuse une URL non parsable ou sans schéma", () => {
    expect(parseResourcesInput([link({ url: "pas une url" })], PREFIX)).toBeNull();
    expect(parseResourcesInput([link({ url: "linear.app" })], PREFIX)).toBeNull();
  });

  it("refuse une URL démesurée", () => {
    const long = `https://exemple.com/${"a".repeat(2100)}`;
    expect(parseResourcesInput([link({ url: long })], PREFIX)).toBeNull();
  });

  it("refuse un libellé vide", () => {
    expect(parseResourcesInput([link({ file_name: "   " })], PREFIX)).toBeNull();
  });

  it("tronque un libellé trop long plutôt que de refuser le lien", () => {
    const parsed = parseResourcesInput([link({ file_name: "x".repeat(500) })], PREFIX);
    expect(parsed?.[0].file_name).toHaveLength(200);
  });

  it("accepte un favicon en data URI d'image", () => {
    const icon = "data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4H";
    const parsed = parseResourcesInput([link({ icon_data_url: icon })], PREFIX);
    expect(parsed?.[0]).toMatchObject({ icon_data_url: icon });
  });

  it.each([
    ["une URL distante", "https://evil.example.com/pixel.gif"],
    ["un data URI non-image", "data:text/html;base64,PHNjcmlwdD4="],
    ["un SVG (script-capable)", "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="],
    ["du base64 hors alphabet", "data:image/png;base64,<script>"],
  ])("refuse %s comme favicon", (_label, icon) => {
    expect(parseResourcesInput([link({ icon_data_url: icon })], PREFIX)).toBeNull();
  });

  it("refuse un favicon au-dessus du plafond de la ligne", () => {
    const huge = `data:image/webp;base64,${"A".repeat(30 * 1024)}`;
    expect(parseResourcesInput([link({ icon_data_url: huge })], PREFIX)).toBeNull();
  });
});

describe("parseResourcesInput — les deux moitiés ensemble", () => {
  it("accepte un mélange de fichiers et de liens", () => {
    const parsed = parseResourcesInput([file(), link()], PREFIX);
    expect(parsed).toHaveLength(2);
    expect(parsed?.[0].kind).toBeUndefined();
    expect(parsed?.[1].kind).toBe("link");
  });

  it("rend null pour TOUT le lot dès qu'une entrée cloche", () => {
    expect(
      parseResourcesInput([file(), link({ url: "javascript:x" })], PREFIX)
    ).toBeNull();
  });
});

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { parseResourcesInput, MAX_ATTACHMENTS_PER_ENTITY } = await import(
  "./attachments"
);

/**
 * MIN-184 — `parseResourcesInput` is the gateway to the descriptors that the
 * CLIENT composes. Nothing that crosses it has been seen by the server elsewhere:
 * a storage path designates an object that we will attach to an entity, a
 * URL becomes a `href` on which someone will click, a data URI becomes
 * the `src` of a tag `<img>`.
 *
 * Hence the form of the contract: it makes `null` — never an amputated list — as soon as ONE entry goes wrong. A commit that silently throws away the offending entry
 * would log the rest as if nothing happened, and no one would see that something is missing.
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

const PAGE_ID = "33333333-3333-4333-8333-333333333333";

const page = (over: Record<string, unknown> = {}) => ({
  kind: "page",
  page_id: PAGE_ID,
  file_name: "Spécification",
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

describe("parseResourcesInput — une page (MIN-275)", () => {
  it("accepte une page du projet", () => {
    expect(parseResourcesInput([page()], PREFIX)).toEqual([
      { kind: "page", page_id: PAGE_ID, file_name: "Spécification" },
    ]);
  });

  it("refuse un page_id qui n'est pas un uuid", () => {
    expect(parseResourcesInput([page({ page_id: "42" })], PREFIX)).toBeNull();
    expect(parseResourcesInput([page({ page_id: 42 })], PREFIX)).toBeNull();
  });

  it("refuse une page qui porte AUSSI une url ou un chemin de storage", () => {
    // The three forms are mutually exclusive: accepting both would miss one
    // line that the SQL constraint would refuse anyway, but in 500.
    expect(
      parseResourcesInput([page({ url: "https://exemple.com" })], PREFIX)
    ).toBeNull();
    expect(
      parseResourcesInput([page({ storage_path: `${PREFIX}a/b.png` })], PREFIX)
    ).toBeNull();
  });

  it("retombe sur un libellé par défaut quand la page n'a pas de titre", () => {
    const parsed = parseResourcesInput([page({ file_name: "  " })], PREFIX);
    expect(parsed?.[0].file_name).toBe("Page");
  });

  it("tronque un titre trop long", () => {
    const parsed = parseResourcesInput([page({ file_name: "x".repeat(500) })], PREFIX);
    expect(parsed?.[0].file_name).toHaveLength(200);
  });

  it("compte dans le plafond commun aux trois formes", () => {
    const eleven = Array.from({ length: MAX_ATTACHMENTS_PER_ENTITY + 1 }, () => page());
    expect(parseResourcesInput(eleven, PREFIX)).toBeNull();
  });
});

describe("parseResourcesInput — les trois formes ensemble", () => {
  it("accepte un mélange de fichiers, de liens et de pages", () => {
    const parsed = parseResourcesInput([file(), link(), page()], PREFIX);
    expect(parsed).toHaveLength(3);
    expect(parsed?.[0].kind).toBeUndefined();
    expect(parsed?.[1].kind).toBe("link");
    expect(parsed?.[2].kind).toBe("page");
  });

  it("rend null pour TOUT le lot dès qu'une entrée cloche", () => {
    expect(
      parseResourcesInput([file(), link({ url: "javascript:x" })], PREFIX)
    ).toBeNull();
  });
});

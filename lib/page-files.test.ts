import { describe, expect, it } from "vitest";

import {
  fileDownloadHref,
  formatFileSize,
  normalizePageFileSrc,
  pageFileIdFromSrc,
  pageFileIdsInBody,
  pageFileProjectFromSrc,
  pageFileStoragePrefix,
  pageFileUrl,
} from "@/lib/page-files";

/**
 * MIN-280 — the address of a page file is a CONTRACT between four places.
 *
 * The block node writes it, the markdown projection copies it, the route reads it again
 * to serve the bytes, and housekeeping looks for it in the bodies to know this
 * which is still alive. None of these four can check the other three:
 * if the shape changes on one side, the only thing that happens is that a nightly scan
 * stops recognizing live files — and deletes them.
 *
 * This is the worst possible flaw in this topic, and it is silent. Hence this test,
 * which plays both ways on the SAME form.
 */

const PROJECT = "07b14964-0def-4941-8ddf-686572d6345d";
const FILE = "11111111-1111-4111-8111-111111111111";

describe("l'adresse d'un fichier de page", () => {
  it("round-trips in both directions", () => {
    const url = pageFileUrl(PROJECT, FILE);
    expect(pageFileIdFromSrc(url)).toBe(FILE);
    expect(pageFileProjectFromSrc(url)).toBe(PROJECT);
  });

  it("does not recognize an address that is not its own", () => {
    // An EXTERNAL image is a normal case, not an error: it costs nothing
    // to the bucket, so she has nothing to do in the household.
    for (const src of [
      "https://exemple.org/capture.png",
      "/api/attachments/file?path=projects/x/y/f.png",
      `/api/projects/${PROJECT}/pages/${FILE}`,
      "",
      null,
      42,
    ]) {
      expect(pageFileIdFromSrc(src), String(src)).toBeNull();
    }
  });

  it("recognizes itself even when given an ORIGIN", () => {
    // The real case (MIN-284): copying and pasting an image block goes through the
    // clipboard, which carries HTML, and Chrome absolutizes the `src` there. THE
    // corps rangeait `http://localhost:3000/api/…` — l'image ne chargeait plus
    // out of the post which had stuck, and the scanning, which did not recognize it
    // more, was about to delete the file she named.
    for (const origin of ["http://localhost:3000", "https://www.minddy.app"]) {
      const absolute = `${origin}${pageFileUrl(PROJECT, FILE)}`;
      expect(pageFileIdFromSrc(absolute)).toBe(FILE);
      expect(pageFileProjectFromSrc(absolute)).toBe(PROJECT);
      expect(pageFileIdsInBody({ attrs: { src: absolute } })).toEqual(
        new Set([FILE])
      );
      // And the front door returns it to its relative form, so that it ceases
      // to be written like this.
      expect(normalizePageFileSrc(absolute)).toBe(pageFileUrl(PROJECT, FILE));
      expect(fileDownloadHref(absolute)).toBe(
        `${pageFileUrl(PROJECT, FILE)}?download=1`
      );
    }
  });

  it("passes through an address that is not ours INTACT", () => {
    // Normalization is not a filter: an external image is legitimate.
    expect(normalizePageFileSrc("https://exemple.org/capture.png")).toBe(
      "https://exemple.org/capture.png"
    );
    expect(normalizePageFileSrc("  ")).toBeNull();
    expect(normalizePageFileSrc(null)).toBeNull();
  });

  it("stores bytes under the PROJECT prefix", () => {
    // And not under a `pages/` prefix at the root: this is what makes the
    // storage insertion policy and resource reading gate
    // are already valid, without one more branch (see migration).
    expect(pageFileStoragePrefix(PROJECT, "page-1")).toBe(
      `projects/${PROJECT}/pages/page-1`
    );
  });
});

describe("files cited by a body", () => {
  const body = {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "Voici :" }] },
      { type: "image", attrs: { src: pageFileUrl(PROJECT, FILE), alt: "Une capture" } },
      {
        type: "details",
        content: [
          {
            type: "detailsContent",
            content: [
              {
                type: "pageFile",
                attrs: {
                  src: pageFileUrl(PROJECT, "22222222-2222-4222-8222-222222222222"),
                  name: "rapport.pdf",
                },
              },
            ],
          },
        ],
      },
      { type: "image", attrs: { src: "https://exemple.org/graphe.png" } },
    ],
  };

  it("finds them, including when NESTED in another block", () => {
    // A file placed in a leaflet is the case which breaks reading at
    // first level — and this is exactly the file that housekeeping would delete.
    expect([...pageFileIdsInBody(body)].sort()).toEqual([
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
    ]);
  });

  it("finds nothing in an empty or missing body", () => {
    expect(pageFileIdsInBody(null).size).toBe(0);
    expect(pageFileIdsInBody({ type: "doc", content: [] }).size).toBe(0);
  });
});

describe("displayed size", () => {
  it("se lit d'un coup d'œil", () => {
    expect(formatFileSize(0)).toBe("");
    expect(formatFileSize(820)).toBe("820 B");
    expect(formatFileSize(1_400)).toBe("1.4 kB");
    expect(formatFileSize(2_400_000)).toBe("2.4 MB");
    // Beyond ten units, the decimal no longer learns anything.
    expect(formatFileSize(24_000_000)).toBe("24 MB");
  });
});

describe("fileDownloadHref", () => {
  const url = pageFileUrl(
    "07b14964-0def-4941-8ddf-686572d6345d",
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
  );

  it("requests the attachment from the application address", () => {
    expect(fileDownloadHref(url)).toBe(`${url}?download=1`);
  });

  it("leaves a signed URL INTACT (MIN-283)", () => {
    // It already has its disposition: a second `download` responds 400
    // au storage — « querystring/download must be string ».
    const signed = "https://xyz.supabase.co/storage/v1/object/sign/a.pdf?token=abc&download=rapport.pdf";
    expect(fileDownloadHref(signed)).toBe(signed);
  });
});

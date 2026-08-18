import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * MIN-348 — expensive surfaces that rotated without flow rate limit.
 *
 * The limiter existed; what was missing was that it was SET. This file
 * keeps the list of what the audit had noted, and for each the same
 * question, which is the only one that matters: beyond its window, is the following call
 * refused in 429 — and refused BEFORE the work that it was supposed to
 * avoid (the compressed image, the duplicate page, the rendered PNG) ?
 *
 * A word about the form: the limiter is a module in memory, shared by all
 * the process, indexed on (key, route). Each case therefore gives itself a
 * user (or an IP) of its own — otherwise the cases would be limited to each other, and the file would lie in both directions.
 */

const getAuthedUser = vi.fn();
const getProjectAccess = vi.fn();
const createPage = vi.fn();
const duplicatePage = vi.fn();
const createPageFile = vi.fn();
const uploadProjectIcon = vi.fn();
const compressIconFile = vi.fn();
const authorizeRunPrRequest = vi.fn();
const prAttachmentResponse = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}));
vi.mock("@/lib/server/api-auth", () => ({
  getAuthedUser: (...args: unknown[]) => getAuthedUser(...args),
}));
vi.mock("@/lib/server/project-access", () => ({
  getProjectAccess: (...args: unknown[]) => getProjectAccess(...args),
}));
vi.mock("@/lib/server/pages", () => ({
  listPages: vi.fn(),
  createPage: (...args: unknown[]) => createPage(...args),
  duplicatePage: (...args: unknown[]) => duplicatePage(...args),
}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ eq: () => ({ is: () => ({ maybeSingle: async () => ({ data: { id: "page" } }) }) }) }),
      }),
    }),
  }),
}));
vi.mock("@/lib/server/page-files", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/page-files")>()),
  createPageFile: (...args: unknown[]) => createPageFile(...args),
}));
vi.mock("@/lib/server/project-icon", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/project-icon")>()),
  uploadProjectIcon: (...args: unknown[]) => uploadProjectIcon(...args),
  compressIconFile: (...args: unknown[]) => compressIconFile(...args),
}));
vi.mock("@/lib/server/agent/pr-actions", () => ({
  authorizeRunPrRequest: (...args: unknown[]) => authorizeRunPrRequest(...args),
  prAttachmentResponse: (...args: unknown[]) => prAttachmentResponse(...args),
  readUploadedFile: async (request: Request) => {
    const entry = (await request.formData()).get("file");
    return entry instanceof File ? entry : null;
  },
}));
// Rendering a thumbnail costs an entire renderer: here, all that matters is the
// fait qu'on y arrive ou non.
vi.mock("next/og", () => ({
  ImageResponse: class {
    status = 200;
    constructor() {}
  },
}));

const PROJECT = "07b14964-0def-4941-8ddf-686572d6345d";
const PAGE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

getProjectAccess.mockResolvedValue({ role: "owner", isOwner: true });
createPage.mockResolvedValue({ ok: true, page: { id: PAGE } });
duplicatePage.mockResolvedValue({ ok: true, page: { id: PAGE } });
createPageFile.mockResolvedValue({
  id: "file-1",
  file_name: "c.png",
  mime_type: "image/png",
  size_bytes: 3,
});
uploadProjectIcon.mockResolvedValue("https://cdn/icon.webp");
compressIconFile.mockResolvedValue(Buffer.from("webp"));

const pagesRoute = await import("@/app/api/projects/[id]/pages/route");
const duplicateRoute = await import(
  "@/app/api/projects/[id]/pages/[pageId]/duplicate/route"
);
const pageFilesRoute = await import(
  "@/app/api/projects/[id]/pages/[pageId]/files/route"
);
const projectIconRoute = await import("@/app/api/projects/[id]/icon/route");
const accountIconRoute = await import("@/app/api/account/project-icon/route");
const runAttachmentsRoute = await import(
  "@/app/api/agent-runs/[runId]/pr/attachments/route"
);
const ogRoute = await import("@/app/og/route");

/** A multipart request carrying a tiny file. */
function upload(): never {
  const form = new FormData();
  form.append("file", new File(["oct"], "c.png", { type: "image/png" }));
  return new Request("https://minddy.app/x", { method: "POST", body: form }) as never;
}

/**
 * Calls `call` up to 429, at most `limit + 1` times, and returns the rank of
 * refusal. `null` = never refused, that is to say the fault we are looking for.
 */
async function refusedAt(
  limit: number,
  call: () => Promise<{ status: number }>
): Promise<number | null> {
  for (let i = 1; i <= limit + 1; i++) {
    const response = await call();
    if (response.status === 429) return i;
  }
  return null;
}

describe("newly rate-limited surfaces", () => {
  it("limits page creation", async () => {
    getAuthedUser.mockResolvedValue({ ok: true, user: { id: "u-page-create" } });
    const params = { params: Promise.resolve({ id: PROJECT }) };
    const rank = await refusedAt(30, () =>
      pagesRoute.POST(
        new Request("https://minddy.app/p", {
          method: "POST",
          body: JSON.stringify({ title: "A" }),
        }) as never,
        params
      )
    );
    expect(rank).toBe(31);
  });

  it("borne la duplication d'une branche", async () => {
    getAuthedUser.mockResolvedValue({ ok: true, user: { id: "u-page-dup" } });
    const params = { params: Promise.resolve({ id: PROJECT, pageId: PAGE }) };
    const rank = await refusedAt(10, () =>
      duplicateRoute.POST(
        new Request("https://minddy.app/d", { method: "POST" }) as never,
        params
      )
    );
    expect(rank).toBe(11);
    // And the refusal arrives BEFORE the copy: it is this that we limit.
    expect(duplicatePage).toHaveBeenCalledTimes(10);
  });

  it("borne l'envoi d'un fichier de page, avant de lire ses octets", async () => {
    getAuthedUser.mockResolvedValue({ ok: true, user: { id: "u-page-file" } });
    const params = { params: Promise.resolve({ id: PROJECT, pageId: PAGE }) };
    const rank = await refusedAt(20, () => pageFilesRoute.POST(upload(), params));
    expect(rank).toBe(21);
    expect(createPageFile).toHaveBeenCalledTimes(20);
  });

  it("borne la compression d'une icône de projet", async () => {
    getAuthedUser.mockResolvedValue({ ok: true, user: { id: "u-icon-project" } });
    const params = { params: Promise.resolve({ id: PROJECT }) };
    const rank = await refusedAt(20, () => projectIconRoute.POST(upload(), params));
    expect(rank).toBe(21);
    expect(uploadProjectIcon).toHaveBeenCalledTimes(20);
  });

  it("also limits its projectless twin (the wizard preview)", async () => {
    getAuthedUser.mockResolvedValue({ ok: true, user: { id: "u-icon-account" } });
    const rank = await refusedAt(20, () => accountIconRoute.POST(upload()));
    expect(rank).toBe(21);
    expect(compressIconFile).toHaveBeenCalledTimes(20);
  });

  it("limits the PR attachment FACADE like the route it exposes", async () => {
    // The route by PR was limited, its frontage per run was not: a
    // guard that can be bypassed through another door is not one.
    authorizeRunPrRequest.mockResolvedValue({
      ok: true,
      scope: {},
      userId: "u-run-pr",
    });
    prAttachmentResponse.mockResolvedValue({ status: 200 });
    const params = { params: Promise.resolve({ runId: "run-1" }) };
    const rank = await refusedAt(60, () =>
      runAttachmentsRoute.POST(upload(), params)
    );
    expect(rank).toBe(61);
  });

  it("borne /og par ADRESSE IP — la route n'a pas d'utilisateur", async () => {
    const request = () =>
      new NextRequest("https://minddy.app/og?route=home&locale=en", {
        headers: { "x-forwarded-for": "203.0.113.9" },
      });
    const rank = await refusedAt(60, async () => await ogRoute.GET(request()));
    expect(rank).toBe(61);
  });

  it("redirects a non-canonical /og URL to the canonical one without rendering the image", async () => {
    // The CDN indexes on the entire URL: without that, `&cache_buster=n` produces
    // as many new entries as requests, therefore as many renderings.
    const response = await ogRoute.GET(
      new NextRequest("https://minddy.app/og?route=home&locale=en&x=1", {
        headers: { "x-forwarded-for": "203.0.113.10" },
      })
    );
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(
      "https://minddy.app/og?route=home&locale=en"
    );
  });
});

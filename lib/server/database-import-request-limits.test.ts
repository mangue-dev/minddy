import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  forcedToolCall: vi.fn(),
  getAppConfigValues: vi.fn(),
  getAuthedUser: vi.fn(),
  getProjectAccess: vi.fn(),
  hasUsageBudget: vi.fn(),
  importDatabase: vi.fn(),
  rateLimitRefusal: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}));
vi.mock("@/lib/server/api-auth", () => ({
  getAuthedUser: H.getAuthedUser,
}));
vi.mock("@/lib/server/project-access", () => ({
  getProjectAccess: H.getProjectAccess,
}));
vi.mock("@/lib/server/session-rate-limit", () => ({
  rateLimitRefusal: H.rateLimitRefusal,
}));
vi.mock("@/lib/server/database-import", () => ({
  importDatabase: H.importDatabase,
}));
vi.mock("@/lib/server/usage", () => ({
  hasUsageBudget: H.hasUsageBudget,
}));
vi.mock("@/lib/server/app-config", () => ({
  getAppConfigValues: H.getAppConfigValues,
}));
vi.mock("@/lib/ai-model-config", () => ({
  aiModelFallback: vi.fn(() => "true"),
}));
vi.mock("@/lib/server/model-config", () => ({
  modelConfigKeys: vi.fn(() => []),
  resolveFromValues: vi.fn(() => ({ model: "test-model" })),
}));
vi.mock("@/lib/server/feedback/forced-tool-call", () => ({
  forcedToolCall: H.forcedToolCall,
}));

const databaseImportRoute = await import(
  "@/app/api/projects/[id]/pages/[pageId]/import/route"
);
const importPlanRoute = await import(
  "@/app/api/projects/[id]/pages/import-plan/route"
);

const importContext = {
  params: Promise.resolve({ id: "project-1", pageId: "page-1" }),
};
const planContext = { params: Promise.resolve({ id: "project-1" }) };

function streamRequest(
  url: string,
  chunks: Uint8Array[],
  contentType?: string,
): NextRequest {
  let index = 0;
  return new NextRequest(url, {
    method: "POST",
    headers: contentType ? { "content-type": contentType } : undefined,
    body: new ReadableStream<Uint8Array>({
      pull(controller) {
        const chunk = chunks[index++];
        if (chunk) controller.enqueue(chunk);
        else controller.close();
      },
    }),
    duplex: "half",
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  H.getAuthedUser.mockResolvedValue({ ok: true, user: { id: "user-1" } });
  H.getProjectAccess.mockResolvedValue({ role: "owner" });
  H.rateLimitRefusal.mockReturnValue(null);
  H.importDatabase.mockResolvedValue({ imported: 1 });
  H.hasUsageBudget.mockResolvedValue(true);
  H.getAppConfigValues.mockResolvedValue({});
  H.forcedToolCall.mockResolvedValue({ types: ["title"] });
});

describe("database import request limits", () => {
  it("rejects a declared oversized multipart import with 413", async () => {
    const request = new NextRequest(
      "https://minddy.test/api/projects/project-1/pages/page-1/import",
      {
        method: "POST",
        headers: {
          "content-length": String(
            databaseImportRoute.DATABASE_IMPORT_REQUEST_MAX_BYTES + 1,
          ),
        },
      },
    );

    const response = await databaseImportRoute.POST(request, importContext);

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({ error: "importTooLarge" });
    expect(H.importDatabase).not.toHaveBeenCalled();
  });

  it("rejects an oversized chunked multipart import with 413", async () => {
    const request = streamRequest(
      "https://minddy.test/api/projects/project-1/pages/page-1/import",
      [
        new Uint8Array(
          databaseImportRoute.DATABASE_IMPORT_REQUEST_MAX_BYTES + 1,
        ),
      ],
      "multipart/form-data; boundary=test-boundary",
    );
    expect(request.headers.has("content-length")).toBe(false);

    const response = await databaseImportRoute.POST(request, importContext);

    expect(response.status).toBe(413);
    expect(H.importDatabase).not.toHaveBeenCalled();
  });

  it("preserves a binary file in a bounded chunked multipart import", async () => {
    const fileBytes = new Uint8Array([0, 255, 128, 13, 10]);
    const form = new FormData();
    form.set(
      "file",
      new File([fileBytes], "database.zip", { type: "application/zip" }),
    );
    form.set(
      "options",
      JSON.stringify({
        requestId: "11111111-1111-4111-8111-111111111111",
        revision: 0,
        sourceId: "source-1",
        columns: [{ name: "Name", type: "title" }],
        people: {},
      }),
    );
    const encoded = new Request("https://minddy.test", {
      method: "POST",
      body: form,
    });
    const contentType = encoded.headers.get("content-type")!;
    const body = new Uint8Array(await encoded.arrayBuffer());
    const midpoint = Math.floor(body.byteLength / 2);
    const request = streamRequest(
      "https://minddy.test/api/projects/project-1/pages/page-1/import",
      [body.subarray(0, midpoint), body.subarray(midpoint)],
      contentType,
    );
    expect(request.headers.has("content-length")).toBe(false);

    const response = await databaseImportRoute.POST(request, importContext);

    expect(response.status).toBe(200);
    expect(H.importDatabase).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project-1",
        pageId: "page-1",
        actorId: "user-1",
        filename: "database.zip",
        bytes: fileBytes,
      }),
    );
  });
});

describe("database import plan request limits", () => {
  it("rejects a declared oversized JSON plan with 413", async () => {
    const request = new NextRequest(
      "https://minddy.test/api/projects/project-1/pages/import-plan",
      {
        method: "POST",
        headers: {
          "content-length": String(
            importPlanRoute.DATABASE_IMPORT_PLAN_REQUEST_MAX_BYTES + 1,
          ),
        },
      },
    );

    const response = await importPlanRoute.POST(request, planContext);

    expect(response.status).toBe(413);
    expect(H.hasUsageBudget).not.toHaveBeenCalled();
  });

  it("rejects an oversized chunked JSON plan with 413", async () => {
    const request = streamRequest(
      "https://minddy.test/api/projects/project-1/pages/import-plan",
      [
        new Uint8Array(
          importPlanRoute.DATABASE_IMPORT_PLAN_REQUEST_MAX_BYTES + 1,
        ),
      ],
      "application/json",
    );
    expect(request.headers.has("content-length")).toBe(false);

    const response = await importPlanRoute.POST(request, planContext);

    expect(response.status).toBe(413);
    expect(H.hasUsageBudget).not.toHaveBeenCalled();
  });

  it("accepts a bounded chunked JSON plan", async () => {
    const body = new TextEncoder().encode(
      JSON.stringify({
        columns: [{ name: "Name", type: "title", samples: ["One"] }],
      }),
    );
    const request = streamRequest(
      "https://minddy.test/api/projects/project-1/pages/import-plan",
      [body.subarray(0, 10), body.subarray(10)],
      "application/json",
    );

    const response = await importPlanRoute.POST(request, planContext);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ types: ["title"] });
    expect(H.forcedToolCall).toHaveBeenCalledOnce();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  getAuthedUser: vi.fn(),
  rateLimitRefusal: vi.fn(),
}));

vi.mock("@/lib/server/api-auth", () => ({
  getAuthedUser: H.getAuthedUser,
}));
vi.mock("@/lib/server/session-rate-limit", () => ({
  rateLimitRefusal: H.rateLimitRefusal,
}));

const { POST } = await import("@/app/api/product-feedback/route");

function request(body: unknown): Request {
  return new Request("https://app.example.test/api/product-feedback", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  process.env.MINDDY_PUBLIC_APP_URL = "https://app.example.test";
  process.env.MINDDY_PUBLIC_SUPABASE_URL = "https://database.example.test";
  process.env.MINDDY_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  process.env.MINDDY_FEEDBACK_KEY = "mdy_feedback-secret";
  process.env.MINDDY_DOCUMENTATION_FEEDBACK_KEY = "mdy_documentation-secret";
  H.getAuthedUser.mockReset();
  H.getAuthedUser.mockResolvedValue({
    ok: true,
    user: {
      id: "user-1",
      email: "ada@example.test",
      user_metadata: { full_name: "Ada Lovelace" },
    },
  });
  H.rateLimitRefusal.mockReset();
  H.rateLimitRefusal.mockReturnValue(null);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ id: "feedback-1" }), { status: 201 }),
  ));
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.MINDDY_FEEDBACK_KEY;
  delete process.env.MINDDY_DOCUMENTATION_FEEDBACK_KEY;
});

describe("POST /api/product-feedback", () => {
  it("submits feedback with the signed-in user's identity", async () => {
    const response = await POST(request({
      title: "Keyboard shortcuts",
      description: "Please add a shortcut reference.",
    }) as never);

    expect(response.status).toBe(201);
    expect(fetch).toHaveBeenCalledWith(
      new URL("https://app.example.test/api/v1/feedback"),
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer mdy_feedback-secret",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: "Keyboard shortcuts",
          body: "Please add a shortcut reference.",
          user: {
            external_id: "user-1",
            email: "ada@example.test",
            name: "Ada Lovelace",
          },
        }),
      }),
    );
  });

  it("rejects invalid input before calling the integration", async () => {
    const response = await POST(request({ title: "   " }) as never);

    expect(response.status).toBe(422);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("constrains the optional display name to the integration contract", async () => {
    H.getAuthedUser.mockResolvedValueOnce({
      ok: true,
      user: {
        id: "user-1",
        email: "ada@example.test",
        user_metadata: { full_name: "A".repeat(201) },
      },
    });

    await POST(request({ title: "A useful idea" }) as never);

    const options = vi.mocked(fetch).mock.calls[0]?.[1];
    const forwarded = JSON.parse(String(options?.body));
    expect(forwarded.user.name).toBe("A".repeat(200));
  });

  it("reports an unavailable integration without exposing a secret", async () => {
    delete process.env.MINDDY_FEEDBACK_KEY;

    const response = await POST(request({ title: "A useful idea" }) as never);
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error).toBe("Product feedback integration is not configured.");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("preserves upstream rate-limit guidance", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, {
      status: 429,
      headers: { "Retry-After": "42" },
    }));

    const response = await POST(request({ title: "A useful idea" }) as never);

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("42");
  });
});


describe("documentation error reports", () => {
  const report = {
    source: "documentation",
    title: "The instructions are unclear",
    description: "The final step needs more detail.",
    documentationContext: { articleId: "issues", locale: "fr" },
  };

  it("adds authoritative article context after the user's text using the dedicated integration", async () => {
    const { getDocumentationArticle } = await import("@/lib/server/documentation");
    const article = getDocumentationArticle("issues", "fr")!;
    const response = await POST(request({ ...report, objective_id: "untrusted-objective" }) as never);
    expect(response.status).toBe(201);
    const options = vi.mocked(fetch).mock.calls[0]![1]!;
    expect(options.headers).toMatchObject({ Authorization: "Bearer mdy_documentation-secret" });
    const forwarded = JSON.parse(String(options.body));
    expect(forwarded.body).toBe(`${report.description}\n\n---\nArticle: issues\nLocale: fr\nRevision: ${article.revision}\nURL: https://app.example.test/fr/documentation/issues`);
    expect(forwarded).not.toHaveProperty("objective_id");
    expect(forwarded.user.external_id).toBe("user-1");
  });

  it("requires authentication before processing a report", async () => {
    H.getAuthedUser.mockResolvedValueOnce({ ok: false, response: new Response(null, { status: 401 }) });
    expect((await POST(request(report) as never)).status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("never falls back to the general integration when documentation reporting is disabled", async () => {
    delete process.env.MINDDY_DOCUMENTATION_FEEDBACK_KEY;
    expect((await POST(request(report) as never)).status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    { source: "other" },
    { documentationContext: null },
    { documentationContext: { articleId: "issues", locale: "unknown" } },
    { documentationContext: { articleId: "../private", locale: "en" } },
    { description: "X".repeat(10_000) },
  ])("rejects unsupported context or oversized reports: %j", async invalid => {
    expect((await POST(request({ ...report, ...invalid }) as never)).status).toBe(422);
    expect(fetch).not.toHaveBeenCalled();
  });
});

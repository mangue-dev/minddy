import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { POST } from "@/app/api/account/project-brief/route";
import { readPageContent } from "./page-content-input";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), rateLimit: vi.fn() }));
vi.mock("@/lib/server/api-auth", () => ({ getAuthedUser: mocks.auth }));
vi.mock("@/lib/server/session-rate-limit", () => ({ rateLimitRefusal: mocks.rateLimit }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ ok: true, user: { id: "owner" } });
  mocks.rateLimit.mockReturnValue(null);
});

function request(body: unknown) {
  return new NextRequest("https://minddy.example/api/account/project-brief", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}

describe("initial brief projection", () => {
  it("returns the full projected body of a 50,000-character brief accepted by page writes", async () => {
    const markdown = "# Initial brief\n\n" + "x".repeat(49_975) + "THE END!";
    expect(markdown.length).toBe(50_000);
    const response = await POST(request({ markdown }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const { content } = await response.json();
    expect(readPageContent(content)).toEqual(content);
    expect(content.content[0].type).toBe("heading");
    expect(content.content[1].content[0].text).toBe(markdown.split("\n\n")[1]);
  });

  it("rejects short Markdown that expands past the stored page JSON limit", async () => {
    const markdown = "x\n\n".repeat(16_666);
    expect(markdown.length).toBeLessThan(50_000);
    const response = await POST(request({ markdown }));
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "pageTooLarge" });
  }, 30_000);

  it.each([null, {}, { markdown: 42 }, { markdown: " \n " }])("rejects invalid input %j", async (body) => {
    const response = await POST(request(body));
    expect(response.status).toBe(400);
  });

  it("rejects input beyond the character limit", async () => {
    expect((await POST(request({ markdown: "x".repeat(50_001) }))).status).toBe(413);
  });

  it("requires authentication and honors the projection rate limit", async () => {
    mocks.auth.mockResolvedValueOnce({ ok: false, response: NextResponse.json({}, { status: 401 }) });
    expect((await POST(request({ markdown: "Brief" }))).status).toBe(401);
    expect(mocks.rateLimit).not.toHaveBeenCalled();
    mocks.rateLimit.mockReturnValueOnce(NextResponse.json({}, { status: 429 }));
    expect((await POST(request({ markdown: "Brief" }))).status).toBe(429);
  });
});

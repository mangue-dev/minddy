import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { GET } from "@/app/api/objectives/[id]/feedback/route";
import { POST } from "@/app/api/v1/feedback/route";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), access: vi.fn(), objective: vi.fn(), feedback: vi.fn(),
  integration: vi.fn(), create: vi.fn(), identity: vi.fn(),
}));
vi.mock("@/lib/server/api-auth", () => ({ getAuthedUser: mocks.auth }));
vi.mock("@/lib/server/project-access", () => ({ getProjectAccess: mocks.access }));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => ({}) }));
vi.mock("@/lib/server/objective-store", () => ({ objectiveStore: () => {
  const query = { select: () => query, eq: () => query, is: () => query, maybeSingle: mocks.objective };
  return query;
} }));
vi.mock("@/lib/server/feedback/team-queries", () => ({ listFeedbackForObjective: mocks.feedback }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
vi.mock("@/lib/server/integration-auth", () => ({
  authenticateIntegration: mocks.integration,
  requireIntegrationKind: () => null,
  publicApiError: (status: number, code: string, message: string) => NextResponse.json({ error: { code, message } }, { status }),
}));
vi.mock("@/lib/server/session-rate-limit", () => ({ checkSessionRateLimit: () => ({ allowed: true }) }));
vi.mock("@/lib/server/feedback/identity", () => ({ upsertFeedbackUser: mocks.identity }));
vi.mock("@/lib/server/feedback/posts", () => ({ createFeedbackPost: mocks.create, FEEDBACK_TITLE_MAX: 500, FEEDBACK_BODY_MAX: 10_000 }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ ok: true, user: { id: "member" } });
  mocks.access.mockResolvedValue({ isOwner: false });
  mocks.objective.mockResolvedValue({ data: { id: "objective", project_id: "project" } });
  mocks.feedback.mockResolvedValue([{ id: "private-post", is_public: false }]);
  mocks.integration.mockResolvedValue({ ok: true, project: { id: "project" }, integration: { id: "integration", objective_id: "configured-objective" } });
  mocks.identity.mockResolvedValue({ id: "visitor", pseudonym: "Visitor" });
  mocks.create.mockResolvedValue({ ok: true, post: { id: "post", objective_id: "configured-objective" } });
});

const objectiveRequest = () => GET(new NextRequest("https://minddy.example/api/objectives/objective/feedback"), {
  params: Promise.resolve({ id: "objective" }),
});
const integrationRequest = (analyze: boolean) => new NextRequest("https://minddy.example/api/v1/feedback", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ title: "Documentation request", user: { external_id: "visitor" }, analyze, objective_id: "payload-override" }),
});

describe("objective feedback access", () => {
  it("authorizes the objective's project before reading private feedback", async () => {
    const response = await objectiveRequest();
    expect(response.status).toBe(200);
    expect(mocks.access).toHaveBeenCalledWith("member", "project");
    expect(mocks.feedback).toHaveBeenCalledWith("project", "objective");
    expect(mocks.access.mock.invocationCallOrder[0]).toBeLessThan(mocks.feedback.mock.invocationCallOrder[0]);
    expect(await response.json()).toEqual({ feedback: [{ id: "private-post", is_public: false }] });
  });

  it("does not read private feedback for a project outsider", async () => {
    mocks.access.mockResolvedValue(null);
    expect((await objectiveRequest()).status).toBe(404);
    expect(mocks.feedback).not.toHaveBeenCalled();
  });

  it("does not read private feedback for a missing or deleted objective", async () => {
    mocks.objective.mockResolvedValue({ data: null });
    expect((await objectiveRequest()).status).toBe(404);
    expect(mocks.feedback).not.toHaveBeenCalled();
  });

  it("requires authentication before reading the objective", async () => {
    mocks.auth.mockResolvedValue({ ok: false, response: NextResponse.json({}, { status: 401 }) });
    expect((await objectiveRequest()).status).toBe(401);
    expect(mocks.objective).not.toHaveBeenCalled();
    expect(mocks.feedback).not.toHaveBeenCalled();
  });
});

describe("integration feedback objectives", () => {
  it.each([true, false])("inherits the authenticated default regardless of payload or analyze=%s", async (analyze) => {
    const response = await POST(integrationRequest(analyze));
    expect(response.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ objectiveId: "configured-objective", analyze }));
    expect(await response.json()).toMatchObject({ objective_id: "configured-objective" });
  });

  it("preserves no objective when the integration default is empty", async () => {
    mocks.integration.mockResolvedValue({ ok: true, project: { id: "project" }, integration: { id: "integration", objective_id: null } });
    mocks.create.mockResolvedValue({ ok: true, post: { id: "post", objective_id: null } });
    expect((await POST(integrationRequest(true))).status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ objectiveId: null }));
  });

  it("reports an unavailable default as a recoverable integration error", async () => {
    mocks.create.mockResolvedValue({ ok: false, errorKey: "objectiveNotFound" });
    const response = await POST(integrationRequest(true));
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: "objective_not_found" } });
  });
});

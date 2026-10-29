import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * The published model configuration (MIN-829): Minddy Cloud serves its own
 * file to the documentation; a self-hosted instance serves nothing unless
 * its operator opts in, and the file never carries more than the registry.
 */

const readAiConfigValues = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/admin-model-config", () => ({ readAiConfigValues }));

const { GET } = await import("@/app/api/recommended-models/route");
const request = (query = "") => new NextRequest(`https://www.minddy.app/api/recommended-models${query}`);

beforeEach(() => {
  readAiConfigValues.mockReset().mockResolvedValue({
    category_assistant_model: "openai/gpt-5-mini",
    jev_model: "liquid/d1",
  });
});
afterEach(() => vi.unstubAllEnvs());

describe("GET /api/recommended-models", () => {
  it("does not exist on a self-hosted instance that did not opt in", async () => {
    vi.stubEnv("MINDDY_EDITION", "self-hosted");
    vi.stubEnv("MINDDY_PUBLISH_MODEL_CONFIG", "");
    expect((await GET(request())).status).toBe(404);
    expect(readAiConfigValues).not.toHaveBeenCalled();
  });

  it("serves Minddy Cloud's configuration as the importable file, cached at the edge", async () => {
    vi.stubEnv("MINDDY_EDITION", "cloud");
    const response = await GET(request("?download=1"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("public");
    expect(response.headers.get("content-disposition")).toContain("attachment");
    const file = await response.json();
    expect(file).toMatchObject({
      format: "minddy.instance-models",
      version: 1,
      categories: { assistant: { model: "openai/gpt-5-mini" } },
      tasks: { jev_model: { model: "liquid/d1" } },
    });
  });

  it("serves a self-hosted instance whose operator opted in", async () => {
    vi.stubEnv("MINDDY_EDITION", "self-hosted");
    vi.stubEnv("MINDDY_PUBLISH_MODEL_CONFIG", "1");
    expect((await GET(request())).status).toBe(200);
  });
});

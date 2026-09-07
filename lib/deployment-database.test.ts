import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { checkDeploymentDatabase } from "@/scripts/check-deployment-database.mjs";

const env = {
  MINDDY_PUBLIC_SUPABASE_URL: "https://database.example.test/",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-key",
};
const paths = {
  "/rpc/auth_authorization_state": { post: {} },
  "/rpc/resolve_realtime_topic": { post: {} },
};

describe("deployment database preflight", () => {
  it("checks the role-filtered schema without invoking application RPCs", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ paths }));
    await checkDeploymentDatabase(env, fetcher);
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, options] = fetcher.mock.calls[0];
    expect(url.toString()).toBe("https://database.example.test/rest/v1/");
    expect(options).toMatchObject({
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        Accept: "application/openapi+json",
      },
      redirect: "error",
      cache: "no-store",
    });
    expect(options.method).toBeUndefined();
    expect(options.body).toBeUndefined();
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it.each(Object.keys(paths))("blocks a deployment when %s is missing", async (missing) => {
    const present = Object.fromEntries(Object.entries(paths).filter(([key]) => key !== missing));
    const fetcher = vi.fn().mockResolvedValue(Response.json({ paths: present }));
    await expect(checkDeploymentDatabase(env, fetcher)).rejects.toThrow(missing);
  });

  it.each([null, {}, { paths: {} }, { paths: { "/rpc/auth_authorization_state": {} } }])(
    "rejects an incomplete schema: %j",
    async (schema) => {
      await expect(checkDeploymentDatabase(env, vi.fn().mockResolvedValue(Response.json(schema))))
        .rejects.toThrow("missing required RPCs");
    },
  );

  it.each(["MINDDY_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"])(
    "fails before fetching when %s is missing",
    async (key) => {
      const fetcher = vi.fn();
      await expect(checkDeploymentDatabase({ ...env, [key]: "" }, fetcher))
        .rejects.toThrow("Database preflight requires");
      expect(fetcher).not.toHaveBeenCalled();
    },
  );

  it("does not expose upstream response bodies", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("private upstream details", { status: 503 }));
    await expect(checkDeploymentDatabase(env, fetcher))
      .rejects.toThrow(/^Database preflight could not read the target PostgREST schema\.$/);
  });

  it("does not expose network errors", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("private network details"));
    await expect(checkDeploymentDatabase(env, fetcher))
      .rejects.toThrow(/^Database preflight could not read the target PostgREST schema\.$/);
  });

  it("rejects malformed JSON", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("not JSON"));
    await expect(checkDeploymentDatabase(env, fetcher)).rejects.toThrow("could not read");
  });

  it("runs the preflight before Vercel builds the application", () => {
    const config = JSON.parse(readFileSync("vercel.json", "utf8"));
    expect(config.buildCommand).toBe("npm run check:deployment-db && npm run build");
  });
});

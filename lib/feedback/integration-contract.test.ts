import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  WEBHOOK_SIGNATURE_HEADER,
  integrationUsage,
  integrationWebhookDoc,
  type IntegrationKind,
} from "./integration-contract";
import { WEBHOOK_EVENTS, WEBHOOK_SCOPES } from "@/lib/server/webhooks";

/**
 * The contract between WHAT AGENTS ARE TOLD and WHAT ROUTES DO.
 *
 * `integrationUsage` is the only description of the integration format that
 * receives from Numo and the user's MCP agent; it is against it that they
 * write code in another repository, without ever seeing `app/api/v1/`. An outdated
 * description therefore does not break anything for us: it breaks for the client,
 * silently, at the first request.
 *
 * The test rereads the REAL routes: each announced URL must correspond to an existing
 * `route.ts`, and each announced error code must appear in the
 * code that serves it (the route, or the authentication base that it shares).
 */

const ROOT = join(import.meta.dirname, "..", "..");
const ORIGIN = "https://www.minddy.app";

/** `.../api/v1/feedback/<post_id>/vote` → `app/api/v1/feedback/[id]/vote/route.ts`. */
function routeFileFor(url: string): string | null {
  const path = url.replace(ORIGIN, "");
  let dir = join(ROOT, "app");
  for (const segment of path.split("/").filter(Boolean)) {
    if (segment.startsWith("<")) {
      // Dynamic segment: the name of the road side parameter does not have to stick to the
      // name shown to the agent (`<post_id>` vs `[id]`).
      const dynamic = readdirSync(dir).find((entry) => entry.startsWith("["));
      if (!dynamic) return null;
      dir = join(dir, dynamic);
      continue;
    }
    dir = join(dir, segment);
    if (!existsSync(dir)) return null;
  }
  const file = join(dir, "route.ts");
  return existsSync(file) ? file : null;
}

/** The base shared by all /api/v1 routes (401, 403, error form). */
const AUTH_SOURCE = readFileSync(
  join(ROOT, "lib", "server", "integration-auth.ts"),
  "utf8"
);

describe.each(["feedback", "issues"] as IntegrationKind[])(
  "integrationUsage(%s)",
  (kind) => {
    const usage = integrationUsage(kind, ORIGIN);

    it("announces its own kind and a bearer key stored in an env var", () => {
      expect(usage.kind).toBe(kind);
      expect(usage.auth.header).toContain("Bearer");
      expect(usage.auth.env_var).toMatch(/^MINDDY_[A-Z_]+$/);
    });

    it("only points at endpoints that exist", () => {
      expect(usage.endpoints.length).toBeGreaterThan(0);
      for (const endpoint of usage.endpoints) {
        expect(endpoint.url.startsWith(`${ORIGIN}/api/v1/`)).toBe(true);
        expect(routeFileFor(endpoint.url), `no route for ${endpoint.url}`).not.toBeNull();
      }
    });

    it("declares the HTTP method the route actually exports", () => {
      for (const endpoint of usage.endpoints) {
        const source = readFileSync(routeFileFor(endpoint.url)!, "utf8");
        expect(source).toContain(`export async function ${endpoint.method}(`);
      }
    });

    it("only lists error codes the code can actually return", () => {
      const sources =
        AUTH_SOURCE +
        usage.endpoints.map((e) => readFileSync(routeFileFor(e.url)!, "utf8")).join("\n");
      for (const error of usage.errors) {
        expect(sources, `error code "${error.code}" is never emitted`).toContain(
          `"${error.code}"`
        );
      }
    });
  }
);

/**
 * The webhook has the same requirement as the endpoints, in the other direction: this
 * that we announce must be what `lib/server/webhooks.ts` REALLY sends. A
 * agent writes its receive route against this description and will only test it
 * in production, on an event that it does not cause itself.
 */
describe("integrationWebhookDoc", () => {
  const doc = integrationWebhookDoc();
  const DISPATCHER = readFileSync(
    join(ROOT, "lib", "server", "webhooks.ts"),
    "utf8"
  );

  it("lists exactly the events the dispatcher can send", () => {
    expect(doc.events.map((e) => e.name).sort()).toEqual([...WEBHOOK_EVENTS].sort());
  });

  it("lists exactly the scopes the dispatcher understands", () => {
    expect(doc.scopes.map((s) => s.value).sort()).toEqual([...WEBHOOK_SCOPES].sort());
  });

  it("only announces headers the dispatcher actually sets", () => {
    for (const header of Object.keys(doc.headers)) {
      expect(DISPATCHER, `header "${header}" is never sent`).toContain(`"${header}"`);
    }
    expect(Object.keys(doc.headers)).toContain(WEBHOOK_SIGNATURE_HEADER);
  });

  it("only announces body fields the dispatcher actually builds", () => {
    for (const field of Object.keys(doc.payload)) {
      expect(DISPATCHER, `body field "${field}" is never sent`).toMatch(
        new RegExp(`\\b${field}\\b`)
      );
    }
  });

  it("describes the signature the dispatcher computes: HMAC-SHA256 keyed by the key hash", () => {
    expect(DISPATCHER).toContain('createHmac("sha256", integration.key_hash)');
    expect(doc.signature).toContain("SHA-256 hex digest");
    // The receiver signs the BRUT body: re-serializing the JSON changes the
    // bytes, and this is the error we pay for in production.
    expect(doc.signature).toMatch(/raw/i);
  });

  // The webhook only delivers outcome events: announce it on a key
  // feedback would write a receive route that is never called.
  it("n'est porté que par la clé issues", () => {
    expect(integrationUsage("issues", ORIGIN).webhook?.events).toEqual(doc.events);
    expect(integrationUsage("feedback", ORIGIN).webhook).toBeUndefined();
  });

  it("dit lui-même qu'il est réservé aux clés issues", () => {
    expect(doc.configure).toContain("'issues' key only");
  });
});

describe("integrationUsage", () => {
  it("normalises a trailing slash on the origin", () => {
    const usage = integrationUsage("feedback", "http://localhost:3000/");
    expect(usage.endpoints[0]?.url).toBe("http://localhost:3000/api/v1/feedback");
  });

  it("gives the two kinds distinct endpoints and env vars", () => {
    const feedback = integrationUsage("feedback", ORIGIN);
    const issues = integrationUsage("issues", ORIGIN);
    expect(feedback.auth.env_var).not.toBe(issues.auth.env_var);
    expect(feedback.endpoints.map((e) => e.url)).not.toEqual(
      issues.endpoints.map((e) => e.url)
    );
  });
});

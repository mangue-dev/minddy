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
 * Le contrat entre CE QU'ON RACONTE AUX AGENTS et CE QUE LES ROUTES FONT.
 *
 * `integrationUsage` est la seule description du format d'intégration que
 * reçoivent Numo et l'agent MCP de l'utilisateur ; c'est contre elle qu'ils
 * écrivent du code dans un autre dépôt, sans jamais voir `app/api/v1/`. Une
 * description périmée ne casse donc rien chez nous : elle casse chez le client,
 * silencieusement, à la première requête.
 *
 * Le test relit les VRAIES routes : chaque URL annoncée doit correspondre à un
 * `route.ts` existant, et chaque code d'erreur annoncé doit apparaître dans le
 * code qui la sert (la route, ou le socle d'authentification qu'elle partage).
 */

const ROOT = join(import.meta.dirname, "..", "..");
const ORIGIN = "https://www.minddy.app";

/** `.../api/v1/feedback/<post_id>/vote` → `app/api/v1/feedback/[id]/vote/route.ts`. */
function routeFileFor(url: string): string | null {
  const path = url.replace(ORIGIN, "");
  let dir = join(ROOT, "app");
  for (const segment of path.split("/").filter(Boolean)) {
    if (segment.startsWith("<")) {
      // Segment dynamique : le nom du paramètre côté route n'a pas à coller au
      // nom qu'on montre à l'agent (`<post_id>` vs `[id]`).
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

/** Le socle partagé par toutes les routes /api/v1 (401, 403, forme d'erreur). */
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
 * Le webhook a la même exigence que les endpoints, dans l'autre sens : ce
 * qu'on annonce doit être ce que `lib/server/webhooks.ts` envoie VRAIMENT. Un
 * agent écrit sa route de réception contre cette description et ne la testera
 * qu'en production, sur un événement qu'il ne provoque pas lui-même.
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
    // Le récepteur signe le corps BRUT : re-sérialiser le JSON change les
    // octets, et c'est l'erreur qu'on paie en production.
    expect(doc.signature).toMatch(/raw/i);
  });

  // Le webhook ne livre que des événements d'issue : l'annoncer sur une clé
  // feedback ferait écrire une route de réception qui n'est jamais appelée.
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

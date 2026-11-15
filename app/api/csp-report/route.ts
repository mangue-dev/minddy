import { NextResponse } from "next/server";

/**
 * Receives the violations of the report-only script policy (MIN-999,
 * `lib/csp.ts`) and writes one compact log line per violation, so the
 * policy can be enforced once the logs are clean.
 *
 * Anyone can post here, so it stores nothing, reads no session and touches no
 * database. The body is capped and only a few short fields are logged.
 */

const MAX_BODY_BYTES = 16 * 1024;
const MAX_REPORTS = 10;
const MAX_FIELD = 200;

const ACCEPTED_TYPES = ["application/reports+json", "application/csp-report", "application/json"];

/** Reads at most `limit` bytes; null when the body is larger. */
async function readCapped(request: Request, limit: number): Promise<string | null> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

function field(value: unknown): string {
  return typeof value === "string" ? value.slice(0, MAX_FIELD) : "";
}

/** The violations of either format: Reporting API batches or legacy `csp-report`. */
function violations(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload
      .filter((report) => report && typeof report === "object" && (report as { type?: unknown }).type === "csp-violation")
      .map((report) => (report as { body?: unknown }).body)
      .filter((body): body is Record<string, unknown> => !!body && typeof body === "object");
  }
  const legacy = (payload as { "csp-report"?: unknown } | null)?.["csp-report"];
  return legacy && typeof legacy === "object" ? [legacy as Record<string, unknown>] : [];
}

export async function POST(request: Request) {
  const type = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!ACCEPTED_TYPES.includes(type)) return new NextResponse(null, { status: 415 });

  const text = await readCapped(request, MAX_BODY_BYTES);
  if (text === null) return new NextResponse(null, { status: 413 });

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  for (const report of violations(payload).slice(0, MAX_REPORTS)) {
    // Both formats: camelCase (Reporting API) and kebab-case (legacy).
    const directive = field(report.effectiveDirective ?? report["effective-directive"] ?? report["violated-directive"]);
    const blocked = field(report.blockedURL ?? report["blocked-uri"]);
    const page = field(report.documentURL ?? report["document-uri"]);
    const sample = field(report.sample ?? report["script-sample"]);
    // Every field is JSON-quoted: an unauthenticated body must not be able to
    // forge extra log lines with newlines.
    console.warn(
      `[csp-report] directive=${JSON.stringify(directive)} blocked=${JSON.stringify(blocked)} page=${JSON.stringify(page)} sample=${JSON.stringify(sample)}`,
    );
  }
  return new NextResponse(null, { status: 204 });
}

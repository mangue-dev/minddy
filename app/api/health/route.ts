import { NextResponse } from "next/server";

/**
 * Liveness probe for process supervisors and the official OCI image.
 *
 * This intentionally does not query Supabase or optional integrations. Those
 * dependencies have their own availability signals; a failed provider must not
 * cause an otherwise healthy application process to be restarted repeatedly.
 */
export function GET() {
  return NextResponse.json(
    { status: "ok" },
    { headers: { "Cache-Control": "no-store" } },
  );
}

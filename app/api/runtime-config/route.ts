import { NextResponse } from "next/server";

import { getRuntimeConfig } from "@/lib/runtime-config";

/**
 * Public bootstrap for non-React consumers such as service workers. The root
 * provider receives the same projection during the first document render.
 */
export function GET() {
  return NextResponse.json(getRuntimeConfig().public, {
    headers: { "Cache-Control": "no-store" },
  });
}

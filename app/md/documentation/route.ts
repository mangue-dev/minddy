import type { NextRequest } from "next/server";
import { documentationMarkdownResponse } from "@/lib/server/documentation-markdown";

/** The proxy preserves the original public URL when rewriting to this handler. */
export function GET(request: NextRequest): Response {
  return documentationMarkdownResponse(request.url);
}

import { NextResponse, type NextRequest } from "next/server";
import {
  authorizePrRequest,
  prRequestReviewerResponse,
} from "@/lib/server/agent/pr-actions";

export const maxDuration = 60;

/** Request a review from a forge account using the connected user's identity. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ prId: string }> },
) {
  const { prId } = await params;
  const auth = await authorizePrRequest(request, prId);
  if (!auth.ok) return auth.response;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const login =
    body && typeof body === "object" && "login" in body
      ? body.login
      : undefined;
  return prRequestReviewerResponse(auth.scope, login);
}

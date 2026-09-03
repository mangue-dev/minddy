import { NextResponse, type NextRequest } from "next/server";

import { authDisplayName, type AuthNameMeta } from "@/lib/display-name";
import {
  FEEDBACK_BODY_MAX,
  FEEDBACK_TITLE_MAX,
} from "@/lib/feedback/types";
import { getRuntimeConfig } from "@/lib/runtime-config";
import { getAuthedUser } from "@/lib/server/api-auth";
import { rateLimitRefusal } from "@/lib/server/session-rate-limit";

const SUBMIT_TIMEOUT_MS = 10_000;

/**
 * Relays signed-in product feedback through the configured Minddy integration.
 * The integration key never enters the browser runtime configuration.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const limited = rateLimitRefusal(auth.user.id, "product-feedback", {
    limit: 10,
    windowMs: 60_000,
  });
  if (limited) return limited;

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return NextResponse.json({ error: "Request body must be a JSON object." }, { status: 400 });
  }

  const fields = input as Record<string, unknown>;
  const title = typeof fields.title === "string" ? fields.title.trim() : "";
  const description =
    typeof fields.description === "string" ? fields.description.trim() : "";
  if (!title) {
    return NextResponse.json({ error: "Title is required." }, { status: 422 });
  }
  if (title.length > FEEDBACK_TITLE_MAX) {
    return NextResponse.json(
      { error: `Title must be at most ${FEEDBACK_TITLE_MAX} characters.` },
      { status: 422 },
    );
  }
  if (fields.description !== undefined && typeof fields.description !== "string") {
    return NextResponse.json({ error: "Description must be a string." }, { status: 422 });
  }
  if (description.length > FEEDBACK_BODY_MAX) {
    return NextResponse.json(
      { error: `Description must be at most ${FEEDBACK_BODY_MAX} characters.` },
      { status: 422 },
    );
  }

  const integrationKey = process.env.MINDDY_FEEDBACK_KEY?.trim();
  if (!integrationKey) {
    return NextResponse.json(
      { error: "Product feedback integration is not configured." },
      { status: 503 },
    );
  }

  const name = authDisplayName(
    auth.user.user_metadata as AuthNameMeta,
    auth.user.email,
    "",
  );
  const user = {
    external_id: auth.user.id,
    ...(auth.user.email ? { email: auth.user.email } : {}),
    ...(name ? { name } : {}),
  };

  let upstream: Response;
  try {
    const { appUrl } = getRuntimeConfig().public;
    upstream = await fetch(new URL("/api/v1/feedback", appUrl), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${integrationKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title, body: description, user }),
      cache: "no-store",
      signal: AbortSignal.timeout(SUBMIT_TIMEOUT_MS),
    });
  } catch (error) {
    console.error("[/api/product-feedback] integration request failed:", error);
    return NextResponse.json(
      { error: "Feedback could not be shared. Please try again." },
      { status: 502 },
    );
  }

  if (!upstream.ok) {
    const retryAfter = upstream.headers.get("Retry-After");
    console.error(
      `[/api/product-feedback] integration returned ${upstream.status}`,
    );
    if (upstream.status === 429) {
      return NextResponse.json(
        { error: "Too many feedback requests. Please try again later." },
        {
          status: 429,
          ...(retryAfter ? { headers: { "Retry-After": retryAfter } } : {}),
        },
      );
    }
    return NextResponse.json(
      { error: "Feedback could not be shared. Please try again." },
      { status: upstream.status === 401 ? 503 : 502 },
    );
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}

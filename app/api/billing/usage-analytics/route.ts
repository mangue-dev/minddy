import { type NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getUsageAnalytics } from "@/lib/server/usage-analytics";

/** Only the authenticated account can read its full-window usage aggregates. */
export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  try {
    return Response.json(await getUsageAnalytics(auth.user.id));
  } catch (error) {
    console.error("[usage-analytics] load failed:", error);
    return Response.json(
      { error: "Could not load usage analytics" },
      { status: 500 },
    );
  }
}

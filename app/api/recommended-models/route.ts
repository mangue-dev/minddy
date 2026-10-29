import { NextResponse, type NextRequest } from "next/server";

import { getDeploymentEdition } from "@/lib/env";
import { readAiConfigValues } from "@/lib/server/admin-model-config";
import { buildModelConfigFile } from "@/lib/ai-model-config-file";

/**
 * GET /api/recommended-models — this instance's model configuration as the
 * versioned file of the admin export (MIN-829). Minddy Cloud publishes it so
 * the documentation can offer its configuration, always current, to any
 * instance that wants to import it: nobody writes or uploads the file.
 *
 * Only Minddy Cloud serves it, unless a self-hosted operator opts in with
 * `MINDDY_PUBLISH_MODEL_CONFIG=1`; anywhere else the route does not exist.
 * The file holds model ids, routing shortcuts and the reasoning level read
 * from the model registry's own keys — never a key, an account or usage. It
 * is public by design, so it is cached at the edge rather than recomputed per
 * request.
 *
 * `?download=1` asks the browser to save it.
 */
export const dynamic = "force-dynamic";

function modelConfigPublished(): boolean {
  return getDeploymentEdition() === "cloud" || process.env.MINDDY_PUBLISH_MODEL_CONFIG?.trim() === "1";
}

export async function GET(request: NextRequest) {
  if (!modelConfigPublished()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const file = buildModelConfigFile(await readAiConfigValues());
    const download = request.nextUrl.searchParams.get("download") === "1";
    return NextResponse.json(file, {
      headers: {
        "Cache-Control": "public, max-age=300, s-maxage=900, stale-while-revalidate=3600",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="minddy-recommended-models.json"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("[recommended-models] read failed:", (error as Error).message);
    return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  }
}

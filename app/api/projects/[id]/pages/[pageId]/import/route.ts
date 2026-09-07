import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getProjectAccess } from "@/lib/server/project-access";
import { rateLimitRefusal } from "@/lib/server/session-rate-limit";
import { importDatabase } from "@/lib/server/database-import";
import { readBoundedRequestBytes } from "@/lib/server/forge-relay/request-body";
import { MAX_IMPORT_BYTES } from "@/lib/database-import/types";

export const maxDuration = 120;
export const DATABASE_IMPORT_REQUEST_MAX_BYTES = 21 * 1024 * 1024;
const optionsSchema = z.object({
  requestId: z.uuid(),
  revision: z.number().int().nonnegative(),
  sourceId: z.string().max(1000),
  columns: z
    .array(
      z.object({
        name: z.string().min(1).max(80),
        type: z.enum([
          "title",
          "text",
          "number",
          "select",
          "multi_select",
          "date",
          "people",
          "checkbox",
        ]),
      }),
    )
    .max(100),
  people: z.record(z.string(), z.uuid()).default({}),
});
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; pageId: string }> },
) {
  const { id: projectId, pageId } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("PageDatabase");
  if (!(await getProjectAccess(auth.user.id, projectId)))
    return NextResponse.json({ error: t("importFailed") }, { status: 404 });
  const refused = rateLimitRefusal(auth.user.id, "page-database-import", {
    limit: 5,
  });
  if (refused) return refused;
  try {
    const incoming = await readBoundedRequestBytes(
      request,
      DATABASE_IMPORT_REQUEST_MAX_BYTES,
    );
    if (!incoming.ok)
      return NextResponse.json({ error: t("importTooLarge") }, { status: 413 });
    const contentType = request.headers.get("content-type");
    const form = await new Request(request.url, {
      method: "POST",
      headers: contentType ? { "content-type": contentType } : undefined,
      body: incoming.body.buffer,
    }).formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size > MAX_IMPORT_BYTES)
      throw new Error("importTooLarge");
    const options = optionsSchema.parse(
      JSON.parse(String(form.get("options"))),
    );
    const result = await importDatabase({
      ...options,
      projectId,
      pageId,
      actorId: auth.user.id,
      filename: file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
    return NextResponse.json(result);
  } catch (error) {
    const known = [
      "importInvalidArchive",
      "importTooLarge",
      "importNoDatabase",
      "importInvalidMapping",
      "importUnmatchedPeople",
      "importLongText",
      "importMissingFile",
      "importConflict",
      "importUnavailable",
      "importStorageFull",
      "importFailed",
    ] as const;
    const key =
      known.find((key) => error instanceof Error && error.message === key) ??
      "importFailed";
    return NextResponse.json(
      { error: t(key) },
      {
        status:
          key === "importConflict"
            ? 409
            : key === "importTooLarge"
              ? 413
              : key === "importUnavailable"
                ? 503
                : 400,
      },
    );
  }
}

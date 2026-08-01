import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { isValidColor } from "@/lib/category-colors";

type RouteContext = { params: Promise<{ id: string }> };

// Borne de longueur du nom (MIN-118) — même plafond que lib/server/categories.ts.
const MAX_NAME_LENGTH = 200;

/** PATCH /api/categories/[id] — rename / recolor (RLS: project access). */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: t("invalidJson") }, { status: 400 });
  }
  const input = (body ?? {}) as Record<string, unknown>;
  const updates: Record<string, unknown> = {};

  if (typeof input.name === "string") {
    const name = input.name.trim();
    if (!name) {
      return NextResponse.json({ error: t("nameRequired") }, { status: 400 });
    }
    updates.name = name.slice(0, MAX_NAME_LENGTH);
  }
  if ("color" in input) {
    if (!isValidColor(input.color)) {
      return NextResponse.json({ error: t("invalidColor") }, { status: 400 });
    }
    updates.color = input.color;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: t("noFieldsToUpdate") }, { status: 400 });
  }

  const { data, error } = await auth.supabase
    .from("categories")
    .update(updates)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) {
    console.error("[api/categories/:id] update failed:", error.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: t("categoryNotFound") }, { status: 404 });
  return NextResponse.json(data);
}

/** DELETE /api/categories/[id] — removes it (and its issue links via cascade). */
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const { data, error } = await auth.supabase
    .from("categories")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[api/categories/:id] delete failed:", error.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: t("categoryNotFound") }, { status: 404 });
  return NextResponse.json({ ok: true });
}

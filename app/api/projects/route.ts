import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { isValidKey, normalizeKey } from "@/lib/project-key";

/** GET /api/projects — list the caller's accessible (owned + member) projects. */
export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  // RLS "projects_select" already scopes this to owner ∪ member.
  const { data, error } = await auth.supabase
    .from("projects")
    .select("*")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("[api/projects] list failed:", error.message);
    return NextResponse.json({ error: "Erreur base de données" }, { status: 500 });
  }
  return NextResponse.json(data);
}

/** POST /api/projects — create a project owned by the caller. */
export async function POST(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }
  const input = (body ?? {}) as Record<string, unknown>;

  const name = typeof input.name === "string" ? input.name.trim() : "";
  const key = normalizeKey(typeof input.key === "string" ? input.key : "");
  const color = typeof input.color === "string" ? input.color : null;

  if (!name) {
    return NextResponse.json({ error: "Le nom est obligatoire." }, { status: 400 });
  }
  if (!isValidKey(key)) {
    return NextResponse.json(
      { error: "La clé doit faire 2 à 5 lettres (A–Z)." },
      { status: 400 }
    );
  }

  const { data, error } = await auth.supabase
    .from("projects")
    .insert({ owner_id: auth.user.id, name, key, color })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: `Tu as déjà un Projet avec la clé ${key}.` },
        { status: 409 }
      );
    }
    console.error("[api/projects] create failed:", error.message);
    return NextResponse.json({ error: "Erreur base de données" }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}

import { NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";

/**
 * La conversation Numo OUVERTE, côté serveur (MIN-353).
 *
 * Les messages étaient en base depuis le premier jour ; le pointeur qui dit
 * LAQUELLE est ouverte, lui, vivait dans localStorage — donc pas d'un onglet à
 * l'autre, pas d'un navigateur à l'autre, pas du web à l'app de bureau.
 *
 * Le GET rend aussi le `project_id` de la conversation : c'est lui qui fixe la
 * portée à la restauration, sans quoi le panneau retomberait sur le projet de
 * l'URL du moment — exactement le bug qu'on referme.
 */

interface ActiveConversationResponse {
  conversationId: string | null;
  projectId: string | null;
}

export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const { user, supabase } = auth;

  // La conversation est jointe pour sa portée. Sa suppression efface la ligne
  // (cascade), donc une réponse non vide désigne toujours un fil qui existe.
  const { data } = await supabase
    .from("assistant_active_conversation")
    .select("conversation_id, conversation:conversations(project_id)")
    .eq("user_id", user.id)
    .maybeSingle();

  // PostgREST rend un OBJET pour une relation « vers un », mais le client n'est
  // pas typé sur le schéma : la forme tableau est acceptée par sécurité plutôt
  // que d'écrire un cast qui mentirait si elle arrivait.
  type Embedded = { project_id: string | null };
  const embedded = data?.conversation as Embedded | Embedded[] | null | undefined;
  const conversation = Array.isArray(embedded)
    ? (embedded[0] ?? null)
    : (embedded ?? null);

  const body: ActiveConversationResponse = data
    ? {
        conversationId: data.conversation_id as string,
        projectId: conversation?.project_id ?? null,
      }
    : { conversationId: null, projectId: null };

  return Response.json(body);
}

export async function PUT(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const { user, supabase } = auth;

  let conversationId: string;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object") throw new Error("not an object");
    const raw = (parsed as { conversationId?: unknown }).conversationId;
    // Un uuid fait 36 caractères — au-delà de 100, corps forgé.
    if (typeof raw !== "string" || !raw || raw.length > 100) {
      throw new Error("bad conversationId");
    }
    conversationId = raw;
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  // Propriété vérifiée ici plutôt que laissée à la RLS seule : une conversation
  // qui n'est pas la sienne doit répondre 404, pas une violation de contrainte.
  const { data: conversation } = await supabase
    .from("conversations")
    .select("id")
    .eq("id", conversationId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!conversation) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const { error } = await supabase
    .from("assistant_active_conversation")
    .upsert(
      { user_id: user.id, conversation_id: conversationId },
      { onConflict: "user_id" },
    );

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return new Response(null, { status: 204 });
}

export async function DELETE(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const { user, supabase } = auth;

  const { error } = await supabase
    .from("assistant_active_conversation")
    .delete()
    .eq("user_id", user.id);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return new Response(null, { status: 204 });
}

import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIN-342 — ce qu'un ANONYME (ou un visiteur d'un autre board) atteint.
 *
 * Deux surfaces, deux règles, et les deux ne se voient qu'entre les fichiers :
 *
 *  - un vote se résout DANS le projet du visiteur. L'id du post vient du
 *    client ; résolu seul, il désignait n'importe quel retour de la base.
 *  - l'OTP est le seul endroit où un inconnu choisit le destinataire d'un
 *    e-mail parti du domaine vérifié de minddy. Ce qui le tient : un corps sans
 *    aucun texte de tiers, et des compteurs PERSISTANTS — celui en mémoire
 *    repart à zéro à chaque déploiement, et une victime s'arrosait via N boards.
 */

interface Row {
  [key: string]: unknown;
}

/** Les posts de la base, tous projets confondus. */
const posts: Row[] = [
  { id: "post-mine", project_id: "proj-a", merged_into_id: null, deleted_at: null },
  { id: "post-theirs", project_id: "proj-b", merged_into_id: null, deleted_at: null },
];

/** Les lignes OTP écrites, plus celles qu'on plante avant l'appel. */
let otpRows: Row[] = [];
let voteUpserts: Row[] = [];
const sentEmails: { to: string; code: string; locale: string }[] = [];

/** Un filtre `.eq()` / `.gte()` / `.is()` accumulé, appliqué à la fin. */
type Filter = (row: Row) => boolean;

function query(rows: () => Row[], onInsert?: (values: Row) => void) {
  const filters: Filter[] = [];
  let head = false;
  let desc = true;
  let orderKey: string | null = null;

  const api = {
    select: (_cols?: string, opts?: { head?: boolean; count?: string }) => {
      head = opts?.head ?? false;
      return api;
    },
    eq: (col: string, value: unknown) => {
      filters.push((r) => r[col] === value);
      return api;
    },
    gte: (col: string, value: string) => {
      filters.push((r) => String(r[col]) >= value);
      return api;
    },
    is: (col: string, value: unknown) => {
      filters.push((r) => r[col] === value);
      return api;
    },
    order: (col: string, opts?: { ascending?: boolean }) => {
      orderKey = col;
      desc = opts?.ascending === false;
      return api;
    },
    limit: () => api,
    matched: () => {
      const out = rows().filter((r) => filters.every((f) => f(r)));
      if (orderKey) {
        const key = orderKey;
        out.sort((a, b) =>
          desc
            ? String(b[key]).localeCompare(String(a[key]))
            : String(a[key]).localeCompare(String(b[key]))
        );
      }
      return out;
    },
    maybeSingle: async () => ({ data: api.matched()[0] ?? null, error: null }),
    insert: async (values: Row) => {
      onInsert?.(values);
      return { error: null };
    },
    update: () => ({ eq: async () => ({ error: null }) }),
    upsert: async (values: Row) => {
      voteUpserts.push(values);
      return { error: null };
    },
    // Un `select(..., { head: true, count: 'exact' })` s'attend directement.
    then: (
      resolve: (value: { data: Row[] | null; count: number; error: null }) => unknown
    ) => {
      const matched = api.matched();
      return Promise.resolve(
        resolve({ data: head ? null : matched, count: matched.length, error: null })
      );
    },
  };
  return api;
}

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: (name: string) => {
      if (name === "feedback_posts") return query(() => posts);
      if (name === "feedback_otp_codes") {
        return query(
          () => otpRows,
          (values) => otpRows.push({ ...values, created_at: new Date().toISOString() })
        );
      }
      return query(() => []);
    },
  }),
}));

vi.mock("@/lib/server/posthog", () => ({ captureServerEvent: () => {} }));

vi.mock("@/lib/server/feedback/otp-email", () => ({
  sendOtpEmail: async (params: { to: string; code: string; locale: string }) => {
    sentEmails.push(params);
    return true;
  },
}));

const { votePost } = await import("@/lib/server/feedback/votes");
const { requestFeedbackOtp } = await import("@/lib/server/feedback/otp");

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("EMAIL_PROVIDER", "resend");
  vi.stubEnv("RESEND_API_KEY", "resend-key");
  vi.stubEnv("FEEDBACK_EMAIL_FROM", "feedback@example.test");
  vi.stubEnv("INVITATION_EMAIL_FROM", "invites@example.test");
  otpRows = [];
  voteUpserts = [];
  sentEmails.length = 0;
});

describe("votePost", () => {
  it("accepte un post du projet du visiteur", async () => {
    expect(
      await votePost({ postId: "post-mine", userId: "u1", projectId: "proj-a" })
    ).toBe(true);
    expect(voteUpserts).toEqual([{ post_id: "post-mine", user_id: "u1" }]);
  });

  it("refuse un post d'un AUTRE board, même avec une session valide", async () => {
    expect(
      await votePost({ postId: "post-theirs", userId: "u1", projectId: "proj-a" })
    ).toBe(false);
    // Le refus vaut par l'absence d'écriture : un `false` rendu après un upsert
    // aurait laissé la voix en base.
    expect(voteUpserts).toEqual([]);
  });
});

describe("requestFeedbackOtp", () => {
  // Une IP par cas : le premier rempart reste un compteur EN MÉMOIRE, partagé
  // par tout le module de test — le réutiliser ferait passer un cas pour la
  // mauvaise raison.
  const base = { boardId: "board-1", locale: "fr" as const };

  it("s'arrête avant la base quand l'e-mail applicatif est absent", async () => {
    vi.stubEnv("EMAIL_PROVIDER", "");

    expect(
      await requestFeedbackOtp({ ...base, ip: "10.0.0.0", email: "a@example.com" }),
    ).toEqual({ ok: false, error: "notConfigured" });
    expect(otpRows).toHaveLength(0);
    expect(sentEmails).toHaveLength(0);
  });

  it("envoie un code, et le corps ne porte AUCUN texte de tiers", async () => {
    expect(
      await requestFeedbackOtp({ ...base, ip: "10.0.0.1", email: "Someone@Example.com " })
    ).toEqual({ ok: true });
    expect(sentEmails).toHaveLength(1);
    // L'adresse est normalisée, et l'appel ne prend plus de nom de projet :
    // c'est cette absence-là qui ferme le relais.
    expect(sentEmails[0].to).toBe("someone@example.com");
    expect(Object.keys(sentEmails[0]).sort()).toEqual(["code", "locale", "to"]);
  });

  it("bloque le second envoi dans la fenêtre de cooldown, sans le dire", async () => {
    const p = { ...base, ip: "10.0.0.2", email: "a@b.com" };
    await requestFeedbackOtp(p);
    expect(await requestFeedbackOtp(p)).toEqual({ ok: true });
    // Réponse identique — mais un seul e-mail est parti.
    expect(sentEmails).toHaveLength(1);
  });

  it("refuse d'arroser une adresse via PLUSIEURS boards", async () => {
    // Cinq demandes déjà passées dans l'heure, sur cinq boards différents :
    // le plafond par destinataire les compte toutes. C'est le levier du relais
    // ouvert — un compteur par board ne l'aurait jamais vu.
    otpRows = recent(5, (i) => ({ board_id: `board-${i}`, email: "victim@example.com" }));
    expect(
      await requestFeedbackOtp({
        ...base,
        boardId: "board-9",
        ip: "10.0.0.3",
        email: "victim@example.com",
      })
    ).toEqual({ ok: false, error: "rateLimited" });
    expect(sentEmails).toHaveLength(0);
  });

  it("refuse une origine qui arrose des adresses ARBITRAIRES", async () => {
    const ip = "10.0.0.4";
    // On apprend l'empreinte de l'origine en laissant passer une demande.
    await requestFeedbackOtp({ ...base, ip, email: "first@example.com" });
    const ipHash = otpRows[0].ip_hash;
    expect(ipHash).toBeTruthy();

    // Quinze destinataires distincts depuis la même origine : le compteur est
    // en base, donc il survit au déploiement qui vide celui en mémoire.
    otpRows = recent(15, (i) => ({
      board_id: "board-1",
      email: `target-${i}@example.com`,
      ip_hash: ipHash,
    }));
    sentEmails.length = 0;
    expect(await requestFeedbackOtp({ ...base, ip, email: "another@example.com" })).toEqual(
      { ok: false, error: "rateLimited" }
    );
    expect(sentEmails).toHaveLength(0);
  });
});

/** n lignes datées dans l'heure écoulée, mais hors du cooldown d'une minute. */
function recent(n: number, shape: (i: number) => Row): Row[] {
  const now = Date.now();
  return Array.from({ length: n }, (_, i) => ({
    ...shape(i),
    created_at: new Date(now - (i + 2) * 60_000).toISOString(),
  }));
}

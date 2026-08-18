import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIN-347 — storage of 2FA recovery codes.
 *
 * These are the codes that BYPASS the second factor: what is written in base
 * is worth the factor itself. Before, it was a bare, unsalted sha256 on 40-bit
 * codes — a few seconds offline scan if the table leaked, and
 * all ten account codes falling in the same pass.
 *
 * What these cases keep:
 * - which is PERSISTED is neither the code nor a quick hash ;
 * - two identical codes never carry the same hash (the salt is per
 * code, not global);
 * - a code only passes ONE time, and a line in the format before is dead.
 */

interface Row {
  id: string;
  user_id: string;
  code_hash: string;
  used_at: string | null;
}

let rows: Row[] = [];
let nextId = 0;

function table() {
  const filters: Array<(r: Row) => boolean> = [];
  const match = () => rows.filter((r) => filters.every((f) => f(r)));

  const api = {
    select: (_cols?: string) => api,
    eq: (col: keyof Row, value: unknown) => {
      filters.push((r) => r[col] === value);
      return api;
    },
    is: (col: keyof Row, value: null) => {
      filters.push((r) => r[col] === value);
      return api;
    },
    maybeSingle: async () => ({ data: match()[0] ?? null, error: null }),
    // `select().eq().is()` expects directly: the builder is thenable.
    then: (resolve: (v: { data: Row[]; error: null }) => unknown) =>
      resolve({ data: match(), error: null }),
    insert: async (values: Omit<Row, "id" | "used_at">[]) => {
      for (const v of values) {
        rows.push({ ...v, id: `code-${nextId++}`, used_at: null });
      }
      return { error: null };
    },
    update: (values: Partial<Row>) => {
      const writer = {
        eq: (col: keyof Row, value: unknown) => {
          filters.push((r) => r[col] === value);
          return writer;
        },
        is: (col: keyof Row, value: null) => {
          filters.push((r) => r[col] === value);
          return writer;
        },
        select: () => ({
          maybeSingle: async () => {
            const target = match()[0];
            if (!target) return { data: null, error: null };
            Object.assign(target, values);
            return { data: { id: target.id }, error: null };
          },
        }),
      };
      return writer;
    },
    delete: () => ({
      eq: async (col: keyof Row, value: unknown) => {
        rows = rows.filter((r) => r[col] !== value);
        return { error: null };
      },
    }),
  };
  return api;
}

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({ from: () => table() }),
}));

const { consumeRecoveryCode, issueRecoveryCodes } = await import("@/lib/server/mfa");

beforeEach(() => {
  rows = [];
  nextId = 0;
});

describe("issueRecoveryCodes", () => {
  it("ne persiste ni le code, ni une empreinte rapide", async () => {
    const codes = await issueRecoveryCodes("user-1");
    expect(codes).toHaveLength(10);
    expect(rows).toHaveLength(10);

    for (const [i, code] of codes.entries()) {
      expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
      const stored = rows[i].code_hash;
      expect(stored).not.toContain(code);
      // A bare sha256 hex is 64 characters and nothing else: the form is enough to
      // say that it is no longer one.
      expect(stored).not.toMatch(/^[0-9a-f]{64}$/);
      expect(stored).toMatch(/^scrypt\$\d+\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
    }
  });

  it("sale par code : la même valeur deux fois ne donne pas la même ligne", async () => {
    await issueRecoveryCodes("user-1");
    const salts = new Set(rows.map((r) => r.code_hash.split("$")[2]));
    expect(salts.size).toBe(rows.length);
  });

  it("efface la série précédente", async () => {
    const first = await issueRecoveryCodes("user-1");
    await issueRecoveryCodes("user-1");
    expect(rows).toHaveLength(10);
    expect(await consumeRecoveryCode("user-1", first[0])).toBe(false);
  });
});

describe("consumeRecoveryCode", () => {
  it("accepte un code une seule fois", async () => {
    const codes = await issueRecoveryCodes("user-1");
    expect(await consumeRecoveryCode("user-1", codes[3])).toBe(true);
    expect(await consumeRecoveryCode("user-1", codes[3])).toBe(false);
    // Other codes in the series survive the consumption of a single one.
    expect(await consumeRecoveryCode("user-1", codes[4])).toBe(true);
  });

  it("rattrape la casse et les tirets, refuse le reste", async () => {
    const codes = await issueRecoveryCodes("user-1");
    const typed = codes[0].toLowerCase().replace(/-/g, " ");
    expect(await consumeRecoveryCode("user-1", typed)).toBe(true);
    expect(await consumeRecoveryCode("user-1", "pas-un-code")).toBe(false);
    expect(await consumeRecoveryCode("user-1", "")).toBe(false);
  });

  it("ne sert pas le code de quelqu'un d'autre", async () => {
    const codes = await issueRecoveryCodes("user-1");
    expect(await consumeRecoveryCode("user-2", codes[0])).toBe(false);
    expect(rows.every((r) => r.used_at === null)).toBe(true);
  });

  it("ne consomme pas une ligne restée au format d'avant", async () => {
    // Defense in depth: migration erases them, but if one survives,
    // she must not reopen the door of the naked sha256.
    const { createHash } = await import("node:crypto");
    rows.push({
      id: "legacy",
      user_id: "user-1",
      code_hash: createHash("sha256").update("ABCD-2345-6789").digest("hex"),
      used_at: null,
    });
    expect(await consumeRecoveryCode("user-1", "ABCD-2345-6789")).toBe(false);
  });
});

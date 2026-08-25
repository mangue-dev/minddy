import { beforeEach, describe, expect, it, vi } from "vitest";

const storedBoard = {
  id: "board-1",
  project_id: "project-1",
  token: "board-token",
  enabled: true,
  show_views: false,
  visible_view_ids: [],
  show_pages: false,
  visible_page_ids: [],
  show_categories: false,
  allow_comments: true,
  accent_light: null,
  accent_dark: null,
  sso_secret: "encrypted-envelope",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

const project = {
  id: "project-1",
  key: "MIN",
  name: "Minddy",
  icon_url: null,
  orb_seed: null,
};

let selectedColumns: Array<{ table: string; columns: string }> = [];
const readSecret = vi.fn((_stored: unknown) => ({
  plain: "decrypted-secret",
  legacy: false,
}));

function projectColumns(row: Record<string, unknown>, columns: string) {
  return Object.fromEntries(
    columns.split(",").map((column) => column.trim()).map((column) => [column, row[column]])
  );
}

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: (table: string) => {
      let columns = "";
      const query = {
        select: (value: string) => {
          columns = value;
          selectedColumns.push({ table, columns });
          return query;
        },
        eq: () => query,
        is: () => query,
        maybeSingle: async () => ({
          data: projectColumns(table === "feedback_boards" ? storedBoard : project, columns),
          error: null,
        }),
      };
      return query;
    },
  }),
}));

vi.mock("@/lib/server/after-safe", () => ({ afterOrNow: vi.fn() }));
vi.mock("@/lib/server/feedback/sso-crypto", () => ({
  encryptBoardSsoSecret: vi.fn(),
  isSsoCryptoConfigured: () => true,
  readBoardSsoSecret: (stored: unknown) => readSecret(stored),
}));

const {
  getBoardByToken,
  getBoardWithSsoSecretByToken,
  getPublicBoardForProject,
} = await import("@/lib/server/feedback/boards");

beforeEach(() => {
  selectedColumns = [];
  readSecret.mockClear();
});

describe("public feedback board SSO-secret boundary", () => {
  it("does not select or decrypt the secret while resolving a public token", async () => {
    const context = await getBoardByToken(storedBoard.token);

    expect(selectedColumns[0]).toMatchObject({ table: "feedback_boards" });
    expect(selectedColumns[0].columns).not.toContain("sso_secret");
    expect(context?.board).not.toHaveProperty("sso_secret");
    expect(readSecret).not.toHaveBeenCalled();
  });

  it("does not select or decrypt the secret for public site navigation", async () => {
    const board = await getPublicBoardForProject(storedBoard.project_id);

    expect(selectedColumns[0].columns).not.toContain("sso_secret");
    expect(board).not.toHaveProperty("sso_secret");
    expect(readSecret).not.toHaveBeenCalled();
  });

  it("decrypts the secret only through the explicit SSO lookup", async () => {
    const context = await getBoardWithSsoSecretByToken(storedBoard.token);

    expect(selectedColumns[0].columns).toContain("sso_secret");
    expect(context?.board.sso_secret).toBe("decrypted-secret");
    expect(readSecret).toHaveBeenCalledOnce();
  });
});

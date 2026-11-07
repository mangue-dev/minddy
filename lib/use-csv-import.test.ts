// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ImportMapping } from "@/lib/import/types";

const mocks = vi.hoisted(() => ({
  fetchImportMappingApi: vi.fn(),
  mappingHasGaps: vi.fn(),
  mergeMapping: vi.fn(),
}));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/lib/use-members-query", () => ({ useMembersQuery: () => ({ members: [] }) }));
vi.mock("@/lib/use-categories-query", () => ({
  useCategoriesQuery: () => ({ categories: [] }),
}));
vi.mock("@/lib/import-api", () => ({
  fetchImportMappingApi: mocks.fetchImportMappingApi,
  importIssuesApi: vi.fn(),
}));
vi.mock("@/lib/import/mapping", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  mappingHasGaps: mocks.mappingHasGaps,
  mergeMapping: mocks.mergeMapping,
}));

import { useCsvImport } from "@/lib/use-csv-import";

let latest: ReturnType<typeof useCsvImport> | null = null;

function Harness() {
  latest = useCsvImport({ projectId: "project-1" });
  return null;
}

// jsdom's File has no `text()`: the hook only reads these three members.
function csvFile(name: string, body: string): File {
  return { name, size: body.length, text: async () => body } as unknown as File;
}

describe("useCsvImport", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (window as typeof window & { IS_REACT_ACT_ENVIRONMENT: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true;
    mocks.fetchImportMappingApi.mockReset();
    mocks.mappingHasGaps.mockReset();
    mocks.mergeMapping.mockReset();
    latest = null;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root.render(createElement(Harness)));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    delete (window as typeof window & { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT;
  });

  it("drops the previous file's proposal when a clean file replaces it", async () => {
    let resolveProposal!: (mapping: ImportMapping) => void;
    mocks.fetchImportMappingApi.mockImplementationOnce(
      () => new Promise((resolve) => { resolveProposal = resolve; })
    );
    // File A has gaps and asks the model; file B is clean and does not.
    mocks.mappingHasGaps.mockReturnValueOnce(true).mockReturnValueOnce(false);
    mocks.mergeMapping.mockImplementation(() => ({ columns: ["ignore"] }));

    await act(async () => {
      void latest!.handleFile(csvFile("a.csv", "Title,Mystery\nFirst,x\n"));
    });
    expect(latest!.aiPending).toBe(true);

    await act(async () => {
      await latest!.handleFile(csvFile("b.csv", "Title\nSecond\n"));
    });
    expect(latest!.prepared?.fileName).toBe("b.csv");
    expect(latest!.aiPending).toBe(false);
    const cleanMapping = latest!.mapping;

    await act(async () => { resolveProposal({ columns: ["title"] } as ImportMapping); });

    expect(mocks.mergeMapping).not.toHaveBeenCalled();
    expect(latest!.mapping).toBe(cleanMapping);
    expect(latest!.aiApplied).toBe(false);
    expect(latest!.mappingTouched).toBe(false);
  });
});

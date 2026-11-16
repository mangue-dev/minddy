import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { CATEGORY_WRITE_DEBOUNCE_MS, createIssueMutations } from "./use-issue-mutations";
import { applyPendingIssues, issueWrites } from "./optimistic/issue-writes";
import type { GlobalBoardResponse, Issue } from "./types";
import type { UndoRecord } from "./undo/undo-context";
import { GLOBAL_BOARD_KEY } from "./query-keys";

const mocks = vi.hoisted(() => ({
  updateIssue: vi.fn(),
  deleteIssue: vi.fn(),
  createIssue: vi.fn(),
  setCategories: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("./issues-api", () => ({
  createIssueApi: (...args: unknown[]) => mocks.createIssue(...args),
  updateIssueApi: (...args: unknown[]) => mocks.updateIssue(...args),
  deleteIssueApi: (...args: unknown[]) => mocks.deleteIssue(...args),
}));
vi.mock("./categories-api", () => ({
  setIssueCategoriesApi: (...args: unknown[]) => mocks.setCategories(...args),
}));
vi.mock("./analytics", () => ({ trackEvent: () => {} }));
vi.mock("sonner", () => ({ toast: { error: (...args: unknown[]) => mocks.toastError(...args) } }));

const issue = (overrides: Partial<Issue> = {}): Issue =>
  ({
    id: "issue",
    project_id: "project",
    number: 1,
    title: "Issue",
    status: "todo",
    priority: "none",
    assignee_id: null,
    cycle_id: null,
    category_ids: [],
    position: 1,
    ...overrides,
  }) as unknown as Issue;

let client: QueryClient;
type Recorder = Parameters<typeof createIssueMutations>[0]["record"];
let record: Mock<Recorder>;
let retract: Mock<() => void>;

function writers(scope: "project" | "global" = "project") {
  return createIssueMutations({
    queryClient: client,
    record,
    viewer: () => ({ id: "me", user_metadata: {} }),
    scope,
  });
}

const projectRows = () => client.getQueryData<Issue[]>(["issues", "project"])!;
const boardRows = () => client.getQueryData<GlobalBoardResponse>(GLOBAL_BOARD_KEY)!.issues;

beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient();
  retract = vi.fn<() => void>();
  record = vi.fn<Recorder>((action) => ({ entry: { ...action } as UndoRecord["entry"], retract }));
  client.setQueryData(["issues", "project"], [issue()]);
  client.setQueryData<GlobalBoardResponse>(GLOBAL_BOARD_KEY, {
    issues: [issue()],
    relations: [],
    objectives: {},
  } as unknown as GlobalBoardResponse);
});

afterEach(() => {
  vi.useRealTimers();
  issueWrites.reset();
  client.clear();
});

describe("category writes", () => {
  it("coalesces rapid toggles into one PUT with the final set", async () => {
    vi.useFakeTimers();
    mocks.setCategories.mockResolvedValue(undefined);
    const { setCategories } = writers("global");
    const first = setCategories("issue", ["a"]);
    const second = setCategories("issue", ["a", "b"]);
    // Every toggle shows at once, in both caches.
    expect(projectRows()[0].category_ids).toEqual(["a", "b"]);
    expect(boardRows()[0].category_ids).toEqual(["a", "b"]);
    expect(mocks.setCategories).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(CATEGORY_WRITE_DEBOUNCE_MS);
    expect(mocks.setCategories).toHaveBeenCalledTimes(1);
    expect(mocks.setCategories).toHaveBeenCalledWith("issue", ["a", "b"]);
    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
    // One undo entry for the window, ending on the final set.
    expect(record).toHaveBeenCalledTimes(1);
    expect(record.mock.results[0].value.entry).toMatchObject({ before: [], after: ["a", "b"] });
  });

  it("restores the set from before the window when the PUT fails", async () => {
    vi.useFakeTimers();
    client.setQueryData(["issues", "project"], [issue({ category_ids: ["kept"] })]);
    mocks.setCategories.mockRejectedValue(new Error("Duplicate key"));
    const { setCategories } = writers();
    const result = setCategories("issue", ["kept", "new"]);
    setCategories("issue", ["new"]);
    await vi.advanceTimersByTimeAsync(CATEGORY_WRITE_DEBOUNCE_MS);
    expect(await result).toBe(false);
    expect(projectRows()[0].category_ids).toEqual(["kept"]);
    expect(retract).toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledWith("Duplicate key", expect.anything());
  });

  it("drops the undo entry of a window that toggled back to its start", async () => {
    vi.useFakeTimers();
    mocks.setCategories.mockResolvedValue(undefined);
    const { setCategories } = writers();
    setCategories("issue", ["a"]);
    setCategories("issue", []);
    await vi.advanceTimersByTimeAsync(CATEGORY_WRITE_DEBOUNCE_MS);
    expect(retract).toHaveBeenCalledTimes(1);
  });
});

describe("issue updates", () => {
  it("rolls back only the fields it touched and resolves to null on failure", async () => {
    let fail!: (error: Error) => void;
    mocks.updateIssue.mockReturnValue(new Promise((_resolve, reject) => { fail = reject; }));
    const { updateIssue } = writers();
    const result = updateIssue("issue", { priority: "high" });
    expect(projectRows()[0].priority).toBe("high");
    // Another write lands on the same issue meanwhile.
    client.setQueryData<Issue[]>(["issues", "project"], (rows) =>
      rows!.map((row) => ({ ...row, title: "Renamed" }))
    );
    fail(new Error("Forbidden"));
    expect(await result).toBeNull();
    expect(projectRows()[0]).toMatchObject({ priority: "none", title: "Renamed" });
    expect(boardRows()[0].priority).toBe("none");
    expect(retract).toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledWith("Forbidden", expect.anything());
  });

  it("mirrors the server side effects of starting an issue and sending it to triage", async () => {
    // Both caches hold the issue in its cycle: `findIssueAnywhere` reads the
    // freshest one, and two writes in the same millisecond tie on freshness.
    client.setQueryData(["issues", "project"], [issue({ cycle_id: "cycle" })]);
    client.setQueryData<GlobalBoardResponse>(GLOBAL_BOARD_KEY, {
      issues: [issue({ cycle_id: "cycle" })],
      relations: [],
      objectives: {},
    } as unknown as GlobalBoardResponse);
    mocks.updateIssue.mockImplementation(async (id: string, patch: Partial<Issue>) => issue({ id, ...patch }));
    const { updateIssue } = writers();
    void updateIssue("issue", { status: "in_progress" });
    expect(mocks.updateIssue).toHaveBeenLastCalledWith(
      "issue",
      { status: "in_progress", assignee_id: "me" },
      expect.objectContaining({ surface: "project_board", previousStatus: "todo" })
    );
    void updateIssue("issue", { status: "triage" });
    expect(mocks.updateIssue.mock.calls[1][1]).toEqual({ status: "triage", cycle_id: null });
  });

  it("adds an issue to a cycle by assigning it to the viewer", async () => {
    mocks.updateIssue.mockResolvedValue(issue());
    await writers("global").setIssueCycle("issue", "cycle");
    expect(mocks.updateIssue).toHaveBeenCalledWith(
      "issue",
      { cycle_id: "cycle", assignee_id: "me" },
      expect.objectContaining({ surface: "global_board" })
    );
  });
});

describe("issue deletion", () => {
  it("removes the card at once and brings it back when the delete fails", async () => {
    let fail!: (error: Error) => void;
    mocks.deleteIssue.mockReturnValue(new Promise((_resolve, reject) => { fail = reject; }));
    const result = writers().deleteIssue("issue");
    expect(projectRows()).toEqual([]);
    expect(boardRows()).toEqual([]);
    // A read that left before the delete cannot bring the card back.
    expect(applyPendingIssues([issue()], Date.now() - 1)).toEqual([]);
    fail(new Error("Gone"));
    expect(await result).toBe(false);
    expect(projectRows().map((row) => row.id)).toEqual(["issue"]);
    expect(boardRows().map((row) => row.id)).toEqual(["issue"]);
  });
});

describe("issue creation", () => {
  it("shows the card in both caches and removes it when the POST fails", async () => {
    let fail!: (error: Error) => void;
    mocks.createIssue.mockReturnValue(new Promise((_resolve, reject) => { fail = reject; }));
    const card = await writers().createIssue("project", { title: "New" } as never);
    expect(card).toMatchObject({ title: "New", number: 2, project_id: "project" });
    expect(projectRows().map((row) => row.id)).toContain(card!.id);
    expect(boardRows().map((row) => row.id)).toContain(card!.id);
    fail(new Error("Quota"));
    await vi.waitFor(() => expect(mocks.toastError).toHaveBeenCalled());
    expect(projectRows().map((row) => row.id)).toEqual(["issue"]);
    expect(record).not.toHaveBeenCalled();
  });
});

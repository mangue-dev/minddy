import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: undefined }) }));

import { triageCountTotalAcross } from "./use-triage-counts-query";

describe("triageCountTotalAcross", () => {
  it("adds every listed project's triage and feedback, the current one included", () => {
    // Project A has 3 feedback items, B has 2: every back-to-Home control shows 5.
    const counts = { a: { triage: 0, feedback: 3 }, b: { triage: 0, feedback: 2 } };
    expect(triageCountTotalAcross([{ id: "a" }, { id: "b" }], counts)).toBe(5);
    // B's item handled elsewhere: the total follows without leaving A.
    expect(triageCountTotalAcross([{ id: "a" }, { id: "b" }], { ...counts, b: { triage: 0, feedback: 1 } })).toBe(4);
  });

  it("leaves out projects Home does not list, such as hidden ones", () => {
    const counts = { a: { triage: 1, feedback: 0 }, hidden: { triage: 7, feedback: 0 } };
    expect(triageCountTotalAcross([{ id: "a" }], counts)).toBe(1);
  });
});

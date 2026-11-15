import { describe, expect, it } from "vitest";
import { isValidGitBranchName } from "./branch-name";

describe("isValidGitBranchName", () => {
  it("accepts nested and plain branch names", () => {
    expect(isValidGitBranchName("numo/min-457-abcd1234")).toBe(true);
    expect(isValidGitBranchName("release/next")).toBe(true);
  });

  it("rejects ref escapes, pathspec characters, and option-like names", () => {
    for (const branch of ["", "-main", "../main", ".hidden", "main..next", "main.lock", "a//b", "a b", "a~b", "a*b", "@{"]) {
      expect(isValidGitBranchName(branch), branch).toBe(false);
    }
  });
});

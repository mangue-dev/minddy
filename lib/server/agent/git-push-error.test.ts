import { describe, expect, it } from "vitest";
import { gitPushError } from "./git-push-error";

describe("Git push failure diagnostics", () => {
  it.each([
    ["fatal: could not read Username for 'https://github.com': No such device or address", "authentication_failed"],
    ["fatal: Authentication failed for 'https://user:secret@git.example.test/acme/app.git'", "authentication_failed"],
    ["git@git.example.test: Permission denied (publickey).", "authentication_failed"],
    ["fatal: unable to access 'https://github.com/acme/app': The requested URL returned error: 401", "authentication_failed"],
    ["! [rejected] work -> work (non-fast-forward)", "non_fast_forward"],
    ["! [rejected] work -> work (fetch first)", "non_fast_forward"],
    ["remote: Permission to acme/app.git denied to user.", "permission_denied"],
    ["remote: Write access to repository not granted.", "permission_denied"],
    ["fatal: The requested URL returned error: 403", "permission_denied"],
    ["fatal: unable to access 'https://github.com/acme/app': Could not resolve host: github.com", "network_failed"],
    ["fatal: Failed to connect to gitlab.com port 443", "network_failed"],
    ["! [remote rejected] work -> work (pre-receive hook declined)", "remote_rejected"],
    ["remote: GH013: Repository rule violations found", "remote_rejected"],
    ["unrecognized failure with private file content", "unknown"],
    ["", "unknown"],
  ])("classifies %s as %s in either Git output stream", (output, reason) => {
    for (const stream of ["stderr", "stdout"] as const) {
      const result = { exitCode: 1, stdout: "", stderr: "", [stream]: output };
      expect(gitPushError(result).message).toMatch(`repository_push_failed: ${reason}:`);
    }
  });

  it.each(["Authentication failed", "unknown remote error"])("never echoes remote output containing %s", (marker) => {
    const error = gitPushError({
      exitCode: 1,
      stdout: "Authorization: Bearer private-token\nprivate file contents",
      stderr: `${marker} for https://user:secret@git.example.test/private/repo?token=private-token`,
    });
    for (const secret of ["private-token", "secret", "git.example.test", "private/repo", "private file contents"]) {
      expect(error.message).not.toContain(secret);
    }
  });
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  authorizedGitRelay,
  gitRelayConfig,
  gitRelayTarget,
} from "../deploy/self-hosted/agent-runner-git-relay.mjs";

test("GitHub credentials remain runner-side and the relay is repository-scoped", () => {
  const relay = gitRelayConfig(
    "https://x-access-token:ghs_repo_token@github.com/acme/private.git",
    "run-control-token",
  );
  assert.equal(relay.upstream.toString(), "https://github.com/acme/private.git");
  assert.equal(
    relay.authorization,
    `Basic ${Buffer.from("x-access-token:ghs_repo_token").toString("base64")}`,
  );
  assert.equal(
    gitRelayTarget(
      relay,
      "/git/acme/private.git/info/refs",
      "?service=git-upload-pack",
      "GET",
    ).toString(),
    "https://github.com/acme/private.git/info/refs?service=git-upload-pack",
  );
  assert.throws(
    () => gitRelayTarget(relay, "/git/acme/other.git/info/refs"),
    /outside the configured relay/,
  );
  assert.throws(
    () => gitRelayTarget(relay, "/git/acme/private.git/arbitrary-endpoint"),
    /outside the configured relay/,
  );
  assert.throws(
    () => gitRelayTarget(relay, "/git/acme/private.git/git-receive-pack", "", "GET"),
    /outside the configured relay/,
  );
});

test("GitLab account credentials are replaced by the run-scoped relay credential", () => {
  const relay = gitRelayConfig(
    "https://oauth2:gitlab-account-token@gitlab.com/group/private.git",
    "run-control-token",
  );
  const safeRemote = new URL("http://runner/v1/sandboxes/agent-1/git/group/private.git");
  safeRemote.username = "minddy";
  safeRemote.password = "run-control-token";

  assert.equal(relay.upstream.toString(), "https://gitlab.com/group/private.git");
  assert.equal(safeRemote.toString().includes("gitlab-account-token"), false);
  assert.equal(
    authorizedGitRelay(`Basic ${Buffer.from("minddy:run-control-token").toString("base64")}`, relay.controlToken),
    true,
  );
  assert.equal(
    authorizedGitRelay(`Basic ${Buffer.from("minddy:wrong").toString("base64")}`, relay.controlToken),
    false,
  );
});

test("the runner rejects unauthenticated and non-HTTPS forge remotes", () => {
  assert.throws(() => gitRelayConfig("https://github.com/acme/private.git", "run"), /authenticated/);
  assert.throws(
    () => gitRelayConfig("http://oauth2:token@gitlab.example/group/private.git", "run"),
    /authenticated HTTPS/,
  );
});

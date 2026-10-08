import type { ShellResult } from "./repo-host";

/** Classify Git output without returning credentials, URLs or remote-controlled text. */
export function gitPushError(result: ShellResult): Error {
  const output = `${result.stderr}\n${result.stdout}`;
  let detail = "unknown: Git rejected the push; inspect repository access and remote state";
  if (/could not read (?:Username|Password)|authentication failed|invalid username or (?:password|token)|permission denied \(publickey\)|requested URL returned error: 401/i.test(output)) {
    detail = "authentication_failed: Git credentials are missing or rejected";
  } else if (/non-fast-forward|fetch first/i.test(output)) {
    detail = "non_fast_forward: the remote branch contains commits missing locally";
  } else if (/permission to .+ denied|write access .+ not granted|requested URL returned error: 403/i.test(output)) {
    detail = "permission_denied: the forge refused repository write access";
  } else if (/could not resolve host|failed to connect|connection (?:timed out|reset|refused)|network is unreachable/i.test(output)) {
    detail = "network_failed: Git could not reach the remote repository";
  } else if (/\[remote rejected\]|pre-receive hook declined|protected branch|repository rule violations/i.test(output)) {
    detail = "remote_rejected: the forge rejected the push through a repository rule or hook";
  }
  return new Error(`repository_push_failed: ${detail}`);
}

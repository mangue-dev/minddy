/**
 * SCAN OF SECRETS BEFORE PUSH (MIN-360) — PURE and testable, like
 * [repo-path.ts](repo-path.ts), and for the same reason: a secret published to
 * the remote cannot be recovered afterwards.
 *
 * WHICH MAKES IT NECESSARY. The end of the tour publishes a pull request **without human
 * in front of the screen** — that's the whole point of the product, and it's also what makes
 * that no glance passes between the diff and the remote.
 * [delivery-gate.ts](delivery-gate.ts) is a QUALITY gate (types, tests,
 * rereading): nothing is looking for a secret. As long as the repository was a disposable clone
 *, the only secret in range was that of the repository itself; In current deposit
 * mode, the user's real `.env` is there, next to the tour files.
 *
 * ─────────────────────── ──────────────────────── ──────────────────────────────
 * THE DOCTRINE, AND IT IS THE SAME AS THAT OF THE COMMAND GUARD
 *
 * **Closed list of STRUCTURED prefixes, never entropy.** A HARD door — which
 * refuses the push — cannot afford a false positive: a blocked turn by
 * a random string of 40 characters in a fixture is a wasted turn, and a
 * guardrail that we end up removing. What we recognize are tokens which
 * announce themselves: `AKIA…`, `ghp_…`, `sk-ant-…`, `-----BEGIN … PRIVATE KEY-----`.
 *
 * TWO PATTERNS HAVE BEEN TESTED THEN REMOVED, and it's better to say why than
 * let someone add them back:
 *
 * - **the bare JWT.** The Supabase anonymous key IS ONE, it's public by
 * design and lives in the `.env.example` and README half du
 * world. We therefore only keep the JWT whose payload says `service_role` —
 * this one, no one publishes it on purpose;
 * - **the URL with identifiers** (`postgres://user:pass@host`). Almost always a
 * local dev URL, in a `docker-compose.yml` or README.
 */

/** A find. The secret itself is NEVER complete: this module writes
 * in a conversation thread, and a leak that is told remains a leak. */
export interface SecretFinding {
  /** Ce qu'on a reconnu, en clair (« GitHub token »). */
  kind: string;
  /** The file, when the diff says so. */
  file: string;
  /** The start of the token, truncated — enough to find it, not to use it. */
  sample: string;
}

/**
 * FILES WHOSE CONTENTS ARE SECRET BY NATURE — the dotenv family.
 *
 * Delivery uses this list to refuse a push that adds a secret-bearing file.
 *
 * `.env.example` (and its cousins `.sample` / `.template`) are spared: they are
 * made to be read and committed, and this is often the only place where the name of the
 * variables is written.
 */
export function isSecretFile(path: string): boolean {
  const name = (path.split("/").pop() ?? "").trim().toLowerCase();
  if (!name) return false;
  if (name.endsWith(".example") || name.endsWith(".sample") || name.endsWith(".template")) {
    return false;
  }
  return name === ".env" || name.startsWith(".env.") || name.endsWith(".env");
}

/** The tokens that are announced. The order matters: the most specific first, because
 * a `sk-ant-…` also satisfies the generic pattern of keys in `sk-`. */
const PATTERNS: ReadonlyArray<{ kind: string; re: RegExp }> = [
  { kind: "private key", re: /-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----/g },
  { kind: "AWS access key id", re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { kind: "GitHub fine-grained token", re: /\bgithub_pat_[A-Za-z0-9_]{50,}/g },
  { kind: "GitHub token", re: /\bgh[pousr]_[A-Za-z0-9]{36,}/g },
  { kind: "Slack token", re: /\bxox[abposr]-[A-Za-z0-9-]{12,}/g },
  { kind: "Stripe live key", re: /\b[sr]k_live_[A-Za-z0-9]{16,}/g },
  { kind: "OpenRouter key", re: /\bsk-or-v1-[a-f0-9]{48,}/g },
  { kind: "Anthropic key", re: /\bsk-ant-[A-Za-z0-9_-]{24,}/g },
  { kind: "OpenAI key", re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}/g },
  { kind: "Google API key", re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { kind: "npm token", re: /\bnpm_[A-Za-z0-9]{36}\b/g },
  { kind: "Vercel Blob token", re: /\bvercel_blob_rw_[A-Za-z0-9_]{20,}/g },
];

/** A JWT, of which we only retain those whose payload says `service_role`. */
const JWT = /\beyJ[A-Za-z0-9_-]{8,}\.(eyJ[A-Za-z0-9_-]{16,})\.[A-Za-z0-9_-]{16,}/g;

/** Which, IN THE VALUE ITSELF, says that it is not a real token. We don't
 * look at the whole line: an "example" comment above a
 * real key should not exempt it. */
const PLACEHOLDER = /(example|placeholder|redacted|changeme|your[_-]|xxxx|\.\.\.)/i;

/** Enough to find the line, not enough to use it. */
function sampleOf(match: string): string {
  return `${match.slice(0, 12)}…`;
}

function isServiceRoleJwt(payload: string): boolean {
  try {
    const json = Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
      "utf8",
    );
    return json.includes("service_role");
  } catch {
    return false;
  }
}

/**
 * The secrets of a TEXT (the contents of a new file, an added line).
 * `file` is just a label, so that the find can be said.
 */
export function scanSecrets(text: string, file = ""): SecretFinding[] {
  if (!text) return [];
  const found: SecretFinding[] = [];
  const seen = new Set<string>();
  const push = (kind: string, match: string) => {
    if (PLACEHOLDER.test(match)) return;
    const key = `${file}:${match.slice(0, 16)}`;
    if (seen.has(key)) return;
    seen.add(key);
    found.push({ kind, file, sample: sampleOf(match) });
  };

  for (const { kind, re } of PATTERNS) {
    // `lastIndex` is in the state carried by the module literal: we reset it to
    // zero, otherwise every second call would skip the start of the text.
    re.lastIndex = 0;
    for (const match of text.matchAll(re)) push(kind, match[0]);
  }
  JWT.lastIndex = 0;
  for (const match of text.matchAll(JWT)) {
    if (isServiceRoleJwt(match[1])) push("service-role JWT", match[0]);
  }
  return found;
}

/**
 * THE SECRETS OF A UNIFIED DIFF — the ADDED lines, and them only.
 *
 * Scanning the entire files rather than the diff would seem safer and would be in
 * unusable reality: a secret already present in the repository would then block
 * all the tricks that touch this file, forever, without the agent having
 * anything to blame. What we keep is what THIS round adds.
 */
export function scanDiff(diff: string): SecretFinding[] {
  const found: SecretFinding[] = [];
  let file = "";
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ ")) {
      const path = line.slice(4).trim();
      file = path === "/dev/null" ? "" : path.replace(/^b\//, "");
      continue;
    }
    if (line.startsWith("---") || line.startsWith("+++")) continue;
    if (!line.startsWith("+")) continue;
    found.push(...scanSecrets(line.slice(1), file));
  }
  return found;
}

/** The word to the model. It NAMEs the files — this is what makes the refusal fixable
 * — and never copies the entire token. */
export function formatSecretFindings(findings: SecretFinding[]): string {
  const lines = findings
    .slice(0, 10)
    .map((f) => `- ${f.kind} (${f.sample}) in ${f.file || "an added file"}`);
  const more = findings.length > lines.length ? `\n- …and ${findings.length - lines.length} more` : "";
  return (
    `Refused to push: this turn adds what looks like a real credential.\n${lines.join("\n")}${more}\n` +
    `Nothing was pushed and nothing was committed. Remove the value from the diff — read it from ` +
    `the environment instead, and put the variable's NAME in \`.env.example\` if it needs ` +
    `documenting. If this is a fixture, make it obviously fake (\`…-example\`, \`placeholder\`).`
  );
}

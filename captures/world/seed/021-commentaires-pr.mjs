/**
 * 021 — A pull request discussion mirrored into an Aurora ticket.
 *
 * For which captures: the ticket timeline of a ticket whose pull request
 * comments are mirrored (MIN-802) — a code review comment with its diff
 * excerpt, a reply threaded under it, and a conversation comment that was
 * edited on GitHub. The comments land on AUR-8 "Fix timezone drift on due
 * dates", which is in review and has no comment of its own.
 *
 * What is written: three ticket comments and their GitHub provenance (login,
 * thread, dates). No pull request, repository link or forge account is
 * created, so nothing can reach GitHub: replies and the Resolve action stay
 * out of the picture. Aurora has a content key, so each comment body is
 * encoded with the application's own codec (`captures/lib/encrypted-content.mjs`).
 * The comments are dated just before the capture clock (2026-09-06) so they
 * read as recent. Nothing is sent, billed or attached to a real account.
 *
 * Idempotent: a comment whose GitHub identity is already mirrored on AUR-8 is
 * left as is.
 *
 *   node captures/world/seed/021-commentaires-pr.mjs          (describes)
 *   node captures/world/seed/021-commentaires-pr.mjs --apply  (writes, after approval)
 */
import { randomUUID } from "node:crypto";
import { openDemoWorld, createPlan } from "../../lib/guards.mjs";
import { openContentCodec } from "../../lib/encrypted-content.mjs";
import { requireProject } from "./_people.mjs";

const APPLY = process.argv.includes("--apply");
const TICKET_NUMBER = 8;
const THREAD = "review_comment:1702345";

const CODE_HEADER = [
  "`lib/due-date.ts:20`",
  "",
  "```diff",
  "@@ -18,4 +18,5 @@",
  "   const [year, month, day] = value.split(\"-\").map(Number);",
  "-  return new Date(year, month - 1, day);",
  "+  // Midnight UTC, so the date never shifts with the viewer's timezone.",
  "+  return new Date(Date.UTC(year, month - 1, day));",
  "```",
].join("\n");

/** In thread order: a root before its reply. */
const COMMENTS = [
  {
    remote: THREAD,
    thread: THREAD,
    login: "tom-berger",
    association: "MEMBER",
    at: "2026-09-04T14:12:00.000Z",
    body: `${CODE_HEADER}\n\nThis fixes parsing, but \`formatDueDate\` still reads local hours: a due date set from Tokyo will render a day early in Paris.`,
  },
  {
    remote: "review_comment:1702391",
    thread: THREAD,
    replyTo: THREAD,
    login: "camille-roy",
    association: "OWNER",
    at: "2026-09-04T16:40:00.000Z",
    body: "Good catch. `formatDueDate` now formats with `timeZone: \"UTC\"` too, pushed in the latest commit.",
  },
  {
    remote: "4870211",
    thread: null,
    login: "alice-fontaine",
    association: "MEMBER",
    at: "2026-09-05T09:05:00.000Z",
    editedAt: "2026-09-05T09:18:00.000Z",
    body: "Tested on the preview from Paris and Montréal: due dates no longer move when the timezone changes.",
  },
];

async function main() {
  const world = await openDemoWorld();
  const project = requireProject(world, "AUR");
  const camille = world.demoUsers.find((user) => user.email === "captures-demo@minddy.app");
  if (!camille) throw new Error("captures: the Camille Roy demo account is missing.");

  const { data: ticket, error } = await world.admin.from("issues").select("id, number, deleted_at")
    .eq("project_id", project.id).eq("number", TICKET_NUMBER).maybeSingle();
  if (error || !ticket || ticket.deleted_at) throw new Error(`captures: AUR-${TICKET_NUMBER} not found.`);

  const { data: mirrored, error: readError } = await world.admin.from("github_issue_comment_syncs")
    .select("remote_comment_id, comment_id").eq("issue_id", ticket.id);
  if (readError) throw new Error(`captures: reading the mirrored comments — ${readError.message}`);
  const existing = new Map((mirrored ?? []).map((row) => [row.remote_comment_id, row.comment_id]));
  const missing = COMMENTS.filter((comment) => !existing.has(comment.remote));

  // A comment already mirrored keeps its identity, but its text follows this
  // script: a correction here reaches the demo world on the next run.
  const codecForRead = await openContentCodec(world);
  const stale = [];
  for (const comment of COMMENTS.filter((c) => existing.has(c.remote))) {
    const { data: stored } = await world.admin.from("comments").select("*")
      .eq("id", existing.get(comment.remote)).maybeSingle();
    if (stored && (await codecForRead.decode("comments", stored)).body !== comment.body) {
      stale.push({ comment, stored });
    }
  }

  if (!APPLY) {
    console.log("What this script would do (nothing is written):\n");
    for (const { comment } of stale) {
      console.log(`  • Rewrite the text of the comment by GitHub @${comment.login} on AUR-${TICKET_NUMBER}`);
    }
    for (const comment of missing) {
      console.log(`  • Add to AUR-${TICKET_NUMBER} a comment by GitHub @${comment.login}` +
        `${comment.replyTo ? " (reply in the code thread)" : comment.thread ? " (code comment, with its excerpt)" : " (conversation, edited)"}`);
    }
    if (!missing.length && !stale.length) console.log("  • Nothing: the demo world is already up to date.");
    return;
  }
  if (stale.length) {
    const fixes = createPlan(world);
    for (const { comment, stored } of stale) {
      const encoded = await codecForRead.encode("comments", {
        id: stored.id, issue_id: stored.issue_id, project_id: stored.project_id,
        author_id: stored.author_id, body: comment.body,
      });
      fixes.update("comments", { id: stored.id }, {
        body: encoded.body,
        ...(encoded.encrypted_content
          ? { encrypted_content: encoded.encrypted_content, encryption_version: encoded.encryption_version }
          : {}),
      }, `text of the comment by @${comment.login}`);
    }
    console.log(fixes.describe());
    await fixes.apply({ confirmed: true });
  }
  if (!missing.length) {
    console.log("No comment to add: the demo world is up to date.");
    return;
  }

  const codec = await openContentCodec(world);
  const ids = new Map([...existing]);
  for (const comment of missing) ids.set(comment.remote, randomUUID());
  // A reply may only hang under a comment of this seed (see config.mjs).
  const parentOf = (comment) => (comment.replyTo ? ids.get(comment.replyTo) : null);

  // Roots, then replies: the database checks a reply's parent when it lands.
  for (const wave of [missing.filter((c) => !c.replyTo), missing.filter((c) => c.replyTo)]) {
    if (!wave.length) continue;
    const plan = createPlan(world);
    plan.insert("comments", await Promise.all(wave.map((comment) => codec.encode("comments", {
      id: ids.get(comment.remote),
      issue_id: ticket.id,
      project_id: project.id,
      author_id: camille.id,
      parent_id: parentOf(comment),
      body: comment.body,
      created_at: comment.at,
      updated_at: comment.editedAt ?? comment.at,
    }))), "PR comment");
    console.log(plan.describe());
    await plan.apply({ confirmed: true });
  }

  const provenance = createPlan(world);
  provenance.insert("github_issue_comment_syncs", missing.map((comment) => ({
    remote_comment_id: comment.remote,
    issue_id: ticket.id,
    comment_id: ids.get(comment.remote),
    provider: "github",
    thread_key: comment.thread,
    author_login: comment.login,
    author_association: comment.association,
    html_url: null,
    created_at_remote: comment.at,
    updated_at_remote: comment.editedAt ?? comment.at,
    synced_at: comment.editedAt ?? comment.at,
  })), "GitHub provenance");
  console.log(provenance.describe());
  await provenance.apply({ confirmed: true });
}

await main();

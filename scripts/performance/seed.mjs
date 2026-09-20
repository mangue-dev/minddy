import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { loadEnv, requireEnv } from "../../captures/lib/env.mjs";

// A separate, inert account: no existing user's data or connected forge is used.
export const EMAIL = "captures-demo+min540@minddy.app";
export const MARKER = "min-540-performance-v1";
export const id = (key) => {
  const hex = createHash("sha256").update(`${MARKER}:${key}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};
const now = "2026-09-20T10:00:00.000Z";
const projectIds = Array.from({ length: 6 }, (_, i) => id(`project-${i}`));
const issueIds = new Set(projectIds.flatMap((_, project) =>
  Array.from({ length: 100 }, (_, issue) => id(`issue-${project}-${issue}`))));
const pageIds = new Set(projectIds.flatMap((_, project) =>
  Array.from({ length: 20 }, (_, page) => id(`page-${project}-${page}`))));
const repos = new Set(projectIds.map((_, i) => `minddy-performance-fixture/project-${i}`));
const paragraph = "The team needs predictable interactions as the workspace grows. Keep the existing keyboard shortcuts, preserve unsaved changes, and reconcile remote updates without interrupting ongoing work. Measure the complete interaction before introducing another cache.";

export function workload(userId) {
  const projects = projectIds.map((pid, i) => ({ id: pid, owner_id: userId, name: `Performance ${i + 1}`, key: `PF${i + 1}`, issue_seq: 100, color: ["#3b82f6", "#8b5cf6", "#ef4444", "#10b981", "#f59e0b", "#ec4899"][i], automations_enabled: false, smart_assign_enabled: false, auto_assign_enabled: false }));
  const issues = projects.flatMap((p, pi) => Array.from({ length: 100 }, (_, i) => {
    const issueId = id(`issue-${pi}-${i}`);
    return { id: issueId, project_id: p.id, number: i + 1, title: `Performance task ${pi + 1}.${i + 1}: ${["Navigation state", "Editor collaboration", "Release verification", "Search indexing", "Issue workflow"][i % 5]}`, description: Array(4).fill(paragraph).join("\n\n"), plan: `Verify the expected workflow.\n\n- [x] Inspect existing behavior\n- [ ] ${paragraph}\n- [ ] Verify keyboard and pointer interactions`, status: ["backlog", "todo", "in_progress", "in_review", "done"][i % 5], priority: ["low", "medium", "high", "urgent", "none"][i % 5], effort: ["xs", "s", "m", "l", "xl"][i % 5], created_by: userId, assignee_id: userId, position: i * 1000, created_at: now, updated_at: now };
  }));
  const pages = projects.flatMap((p, pi) => Array.from({ length: 20 }, (_, i) => {
    const pageId = id(`page-${pi}-${i}`);
    return { id: pageId, project_id: p.id, title: `Performance guide ${pi + 1}.${i + 1}`, position: `a${String(i).padStart(3, "0")}`, created_by: userId, updated_by: userId, search_text: paragraph, content: { type: "doc", content: Array.from({ length: 80 }, (_, block) => ({ type: block % 10 === 0 ? "heading" : "paragraph", attrs: { id: `perf-${pi}-${i}-${block}`, ...(block % 10 === 0 ? { level: 2 } : {}) }, content: [{ type: "text", text: block % 10 === 0 ? `Workflow ${block / 10 + 1}` : paragraph }] })) } };
  }));
  return { projects, issues, pages,
    comments: issues.flatMap((issue) => Array.from({ length: 2 }, (_, i) => ({ id: id(`comment-${issue.id}-${i}`), issue_id: issue.id, author_id: userId, body: `Review note ${i + 1}. ${paragraph}`, created_at: now }))),
    page_comments: pages.flatMap((page) => Array.from({ length: 4 }, (_, i) => ({ id: id(`page-comment-${page.id}-${i}`), page_id: page.id, project_id: page.project_id, author_id: userId, body: `Documentation discussion ${i + 1}. ${paragraph}`, block_id: null }))),
    git_connections: [{ id: id("connection"), user_id: userId, provider: "github", account_login: "minddy-performance-fixture", account_type: "Organization" }],
    project_git_links: projects.map((p, i) => ({ id: id(`link-${i}`), project_id: p.id, connection_id: id("connection"), provider: "github", external_repo_id: `min540-${i}`, repo_owner: "minddy-performance-fixture", repo_name: `project-${i}`, repo_full_name: `minddy-performance-fixture/project-${i}`, default_branch: "main", created_by: userId, issue_sync_enabled: false })),
    pull_requests: projects.flatMap((p, pi) => Array.from({ length: 30 }, (_, i) => ({ id: id(`pr-${pi}-${i}`), provider: "github", repo_full_name: `minddy-performance-fixture/project-${pi}`, number: i + 1, title: `Performance change ${pi + 1}.${i + 1}`, state: ["open", "merged", "closed"][i % 3], author_login: "performance-tester", head_branch: `fixture/change-${i}`, base_branch: "main", issue_id: id(`issue-${pi}-${i}`), opened_at: now, updated_at: now, synced_at: now }))),
  };
}

export function assertScope(table, row, userId) {
  if (row.owner_id && row.owner_id !== userId) throw new Error("Foreign owner");
  for (const field of ["user_id", "created_by", "updated_by", "author_id", "assignee_id"]) {
    if (row[field] && row[field] !== userId) throw new Error(`Foreign ${field}`);
  }
  if (row.project_id && !projectIds.includes(row.project_id)) throw new Error("Foreign project");
  if (row.issue_id && !issueIds.has(row.issue_id)) throw new Error("Foreign issue");
  if (row.page_id && !pageIds.has(row.page_id)) throw new Error("Foreign page");
  if (row.repo_full_name && !repos.has(row.repo_full_name)) throw new Error("Foreign repository");
  if (table === "projects") {
    if (row.owner_id !== userId || !projectIds.includes(row.id)) throw new Error("Project owner mismatch");
    if (row.automations_enabled !== false || row.smart_assign_enabled !== false || row.auto_assign_enabled !== false) {
      throw new Error("Fixture projects must keep automations disabled");
    }
  }
  if (table === "issues") {
    for (const field of ["automation_override", "remote_provider", "remote_repo_id", "remote_number", "integration_id"]) {
      if (row[field] != null) throw new Error(`Fixture issue must not carry ${field}`);
    }
  }
  if (table === "git_connections") {
    if (row.id !== id("connection") || row.user_id !== userId || row.provider !== "github") {
      throw new Error("Foreign fixture connection");
    }
    for (const field of ["access_token_encrypted", "refresh_token_encrypted", "installation_id"]) {
      if (row[field] != null) throw new Error("Fixture connection must have no credentials");
    }
  }
  if (table === "project_git_links") {
    const project = projectIds.indexOf(row.project_id);
    if (project < 0 || row.id !== id(`link-${project}`) || row.connection_id !== id("connection") ||
        row.provider !== "github" || row.repo_full_name !== `minddy-performance-fixture/project-${project}` ||
        row.external_repo_id !== `min540-${project}`) {
      throw new Error("Foreign fixture repository link");
    }
    if (row.installation_id != null || row.webhook_secret_encrypted != null || row.issue_sync_enabled !== false) {
      throw new Error("Fixture repository links must have no credentials or synchronization");
    }
  }
}

/** Repo sync stamps are global, so reject names also linked outside the fixture. */
export async function assertRepositoryScope(admin, userId) {
  const { data, error } = await admin.from("project_git_links")
    .select("*").eq("provider", "github").in("repo_full_name", [...repos]);
  if (error) throw error;
  for (const row of data ?? []) assertScope("project_git_links", row, userId);
}

async function seed() {
  console.log("Dedicated workload: 6 projects, 600 issues, 120 Pages (80 blocks each), 1,200 issue comments, 480 page comments, 180 stored PRs. No forge credentials, agent runs, routines, invitations or email delivery.");
  if (!process.argv.includes("--apply")) { console.log("Pass --apply to create missing fixture rows only."); return; }
  loadEnv();
  const admin = createClient(requireEnv("MINDDY_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), { auth: { autoRefreshToken: false, persistSession: false } });
  let user;
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    user = data.users.find((entry) => entry.email === EMAIL);
    if (user || data.users.length < 200) break;
  }
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({ email: EMAIL, password: requireEnv("CAPTURES_DEMO_PASSWORD"), email_confirm: true, user_metadata: { display_name: "Performance Tester", locale: "en", theme: "dark", performance_fixture: MARKER } });
    if (error) throw error;
    user = data.user;
  }
  if (user.email !== EMAIL || user.user_metadata.performance_fixture !== MARKER) throw new Error("Refusing to reuse an account without the exact fixture marker");
  await assertRepositoryScope(admin, user.id);
  const fixture = workload(user.id);
  for (const table of ["projects", "issues", "pages", "comments", "page_comments", "git_connections", "project_git_links", "pull_requests"]) {
    const rows = fixture[table];
    for (let start = 0; start < rows.length; start += 100) {
      const batch = rows.slice(start, start + 100);
      batch.forEach((row) => assertScope(table, row, user.id));
      const existing = await admin.from(table).select("*").in("id", batch.map((row) => row.id));
      if (existing.error) throw existing.error;
      existing.data.forEach((row) => assertScope(table, row, user.id));
      const known = new Set(existing.data.map((row) => row.id));
      const missing = batch.filter((row) => !known.has(row.id));
      if (missing.length) {
        const { error } = await admin.from(table).insert(missing);
        if (error) throw new Error(`${table}: ${error.message}`);
      }
    }
    console.log(`${table}: ${rows.length} fixture rows verified`);
  }
  // Scoped only to this marked test account; no Stripe subscription is created.
  const billing = await admin.from("billing_accounts").upsert({ user_id: user.id, admin_override_plan_id: "pro" }, { onConflict: "user_id" });
  if (billing.error) throw billing.error;
  // Empty credentials prevent all forge access. These stamps represent imported history.
  await assertRepositoryScope(admin, user.id);
  const syncs = await admin.from("pull_request_syncs").upsert([...repos].map((repo) => ({ provider: "github", repo_full_name: repo, synced_at: new Date().toISOString(), truncated: false })), { onConflict: "provider,repo_full_name" });
  if (syncs.error) throw syncs.error;
  await mkdir("output/playwright/performance", { recursive: true });
  await writeFile("output/playwright/performance/workload.json", JSON.stringify({ marker: MARKER, email: EMAIL, userId: user.id, projects: projectIds, firstIssue: id("issue-0-0"), firstPage: id("page-0-0"), counts: Object.fromEntries(Object.entries(fixture).map(([table, rows]) => [table, rows.length])) }, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) await seed();

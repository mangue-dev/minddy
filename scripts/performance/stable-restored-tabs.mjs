import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createServerClient } from "@supabase/ssr";
import { request } from "playwright";
import { loadEnv, requireEnv } from "../../captures/lib/env.mjs";
import { EMAIL, MARKER, id } from "./seed.mjs";
import { loadForgeWorkload, forgeLinkFingerprint } from "./measure-forge-navigation.mjs";

export const stableManifestPath = path.resolve("output/playwright/performance/min683-stable-tabs.json");

/** Authenticate only the explicitly authorized fixture, before any mutation. */
export async function openFixture() {
  loadEnv();
  const base = process.env.MINDDY_PERF_BASE_URL ?? "http://localhost:3111";
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
  assert.equal(new URL(base).origin, base);
  const fixture = JSON.parse(await readFile(path.resolve("output/playwright/performance/workload.json"), "utf8"));
  assert.equal(fixture.email, EMAIL);
  assert.equal(fixture.marker, MARKER);
  assert.deepEqual(fixture.projects, Array.from({ length: 6 }, (_, index) => id(`project-${index}`)));
  const cookies = [];
  const auth = createServerClient(requireEnv("MINDDY_PUBLIC_SUPABASE_URL"), requireEnv("MINDDY_PUBLIC_SUPABASE_ANON_KEY"), {
    cookies: { getAll: () => [], setAll: (values) => cookies.push(...values) },
  });
  const signedIn = await auth.auth.signInWithPassword({ email: EMAIL, password: requireEnv("CAPTURES_DEMO_PASSWORD") });
  if (signedIn.error) throw new Error(`Fixture sign-in failed: ${signedIn.error.code}`);
  assert.equal(signedIn.data.user.email, EMAIL);
  assert.equal(signedIn.data.user.id, fixture.userId);
  assert.equal(signedIn.data.user.user_metadata.performance_fixture, MARKER);
  // The optional local HTTP/2 proxy (h2-proxy.mjs) uses a self-signed localhost certificate.
  const client = await request.newContext({ baseURL: base, ignoreHTTPSErrors: base.startsWith("https:"),
    extraHTTPHeaders: { Cookie: cookies.map(({ name, value }) => `${name}=${value}`).join("; ") } });
  async function api(url, method = "GET", data) {
    const response = await client.fetch(url, { method, ...(data === undefined ? {} : { data }) });
    assert.ok(response.ok(), `${method} ${url}: ${response.status()}`);
    return response.json();
  }
  return { base, fixture, cookies, api, close: () => client.dispose() };
}

export function stableTabs(fixture, forgeWorkload) {
  const projectId = fixture.projects[0];
  const project = `/projects/${projectId}`;
  return [
    { key: "all", href: "/all", kind: "all" },
    { key: "project", href: project, kind: "board", projectId },
    { key: "page", href: `${project}/pages/${id("page-0-10")}`, kind: "page", projectId, pageId: id("page-0-10") },
    { key: "foreign-page", href: `/projects/${fixture.projects[1]}/pages/${id("page-1-0")}`, kind: "page", projectId: fixture.projects[1], pageId: id("page-1-0") },
    { key: "home", href: "/home", kind: "home" },
    { key: "pr", href: `/pull-requests?pr=${forgeWorkload.prs[0].prId}`, kind: "pr" },
    { key: "routines", href: "/routines", kind: "routines" },
    { key: "triage", href: `${project}/triage`, kind: "triage", projectId },
    { key: "feedback", href: `${project}/feedback`, kind: "feedback", projectId },
    { key: "objectives", href: `${project}/objectives`, kind: "objectives", projectId },
  ].map(({ key, ...spec }) => ({ id: id(`min683-stable-${key}`), custom_name: `MIN-683 stable ${key}`, ...spec }));
}

export async function assertStableTabs(api, fixture, specs) {
  const tabs = await api("/api/me/app-tabs");
  assert.equal(tabs.length, specs.length, "The fixture must not accumulate tabs");
  for (const spec of specs) {
    const tab = tabs.find((value) => value.id === spec.id);
    assert.ok(tab, `Missing stable tab: ${spec.custom_name}`);
    assert.equal(tab.user_id, fixture.userId);
    assert.equal(tab.custom_name, spec.custom_name);
    // Navigation inside a stable tab can persist its latest document or PR.
    // Each run resets these known destinations before timing, not by adding tabs.
  }
  return tabs;
}

async function normalize() {
  const session = await openFixture();
  const { api, fixture } = session;
  try {
    const forge = await loadForgeWorkload(api);
    const specs = stableTabs(fixture, forge);
    const before = await api("/api/me/app-tabs");
    assert.ok(before.every((tab) => tab.user_id === fixture.userId));
    console.log(JSON.stringify({ email: EMAIL, verifiedFixture: true, existingTabs: before.length, selectedTabs: specs.length }));
    if (!process.argv.includes("--apply")) return;
    await mkdir(path.dirname(stableManifestPath), { recursive: true });
    // Preserve every original tab field before the explicitly requested pruning.
    const backup = `${stableManifestPath}.before-${Date.now()}.json`;
    await writeFile(backup, JSON.stringify({ userId: fixture.userId, email: EMAIL, tabs: before, linkFingerprint: forge.linkFingerprint }, null, 2));
    for (const [index, spec] of specs.entries()) {
      let tab = (await api("/api/me/app-tabs")).find((entry) => entry.id === spec.id);
      if (!tab) {
        await api("/api/me/app-tabs", "POST", { id: spec.id });
        tab = (await api("/api/me/app-tabs")).find((entry) => entry.id === spec.id);
      }
      assert.equal(tab.user_id, fixture.userId);
      await api(`/api/me/app-tabs/${spec.id}`, "PATCH", { revision: tab.revision,
        patch: { href: spec.href, custom_name: spec.custom_name, pinned: true, position: index * 1000 } });
    }
    for (const tab of await api("/api/me/app-tabs")) {
      assert.equal(tab.user_id, fixture.userId);
      if (!specs.some((spec) => spec.id === tab.id)) await api(`/api/me/app-tabs/${tab.id}`, "DELETE", { revision: tab.revision });
    }
    const after = await assertStableTabs(api, fixture, specs);
    assert.ok(specs.every((spec) => after.find((tab) => tab.id === spec.id).href === spec.href));
    const { link } = await api(`/api/projects/${forge.project}/git-link`);
    assert.equal(forgeLinkFingerprint(link), forge.linkFingerprint, "Preserve the existing GitHub installation");
    await writeFile(stableManifestPath, JSON.stringify({ email: EMAIL, userId: fixture.userId, marker: MARKER,
      specs, forge, backup, establishedAt: new Date().toISOString() }, null, 2));
    console.log(JSON.stringify({ stableTabs: after.length, githubConnectionPreserved: true, backup }));
  } finally { await session.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await normalize();

// Controlled, untimed workload setup through authorized encrypted APIs.
// Capture existing issue IDs and attempt labels before writes; never replay a POST.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createServerClient } from '@supabase/ssr';
import { loadEnv, requireEnv } from '../../captures/lib/env.mjs';
import { EMAIL, MARKER } from './seed.mjs';
loadEnv();
const base = 'http://localhost:3111', file = 'output/playwright/performance/pass3f-controlled-workload.json';
const fixture = JSON.parse(await readFile('output/playwright/performance/workload.json', 'utf8'));
assert.equal(fixture.marker, MARKER); assert.equal(fixture.email, EMAIL);
const cookies = [];
const auth = createServerClient(requireEnv('MINDDY_PUBLIC_SUPABASE_URL'), requireEnv('MINDDY_PUBLIC_SUPABASE_ANON_KEY'), { cookies: { getAll: () => [], setAll: (values) => cookies.push(...values) } });
const login = await auth.auth.signInWithPassword({ email: EMAIL, password: requireEnv('CAPTURES_DEMO_PASSWORD') });
assert.equal(login.error, null); assert.equal(login.data.user.id, fixture.userId);
const api = async (path, method = 'GET', data) => {
  const response = await fetch(base + path, { method, headers: { Cookie: cookies.map(({ name, value }) => `${name}=${value}`).join('; '), ...(data ? { 'Content-Type': 'application/json' } : {}) }, ...(data ? { body: JSON.stringify(data) } : {}) });
  assert.ok(response.ok, `${method} ${path}: ${response.status}`); return response.json();
};
let state;
try { state = JSON.parse(await readFile(file, 'utf8')); } catch { state = { originalIssues: [], projects: [], attempts: [], posts: [], users: [], prepared: false, cleanup: false }; }
const save = () => writeFile(file, JSON.stringify(state, null, 2));
const mode = process.argv[2]; assert.ok(['prepare', 'restore'].includes(mode));
if (mode === 'prepare') {
  assert.equal(state.cleanup, false, 'A restored workload must not be reused');
  if (state.attempts.length && !state.prepared) throw new Error('Interrupted setup: restore before another setup; never replay writes');
  if (!state.prepared) {
    for (const index of [0, 5]) {
      const projectId = fixture.projects[index], project = await api(`/api/projects/${projectId}`);
      assert.equal(project.owner_id, fixture.userId);
      const original = await api(`/api/projects/${projectId}/feedback`);
      const originalUsers = await api(`/api/projects/${projectId}/feedback/users`);
      state.projects.push({ id: projectId, originalPosts: original.posts.map((post) => post.id), originalUsers: originalUsers.users.map((user) => user.id) }); await save();
      const issue = (await api(`/api/projects/${projectId}/issues`))[90]; assert.ok(issue);
      state.originalIssues.push({ id: issue.id, title: issue.title, status: issue.status, projectId }); await save();
      await api(`/api/issues/${issue.id}`, 'PATCH', { status: 'triage' });
      assert.equal((await api(`/api/issues/${issue.id}`)).status, 'triage');
      // Setup is not a timed write. The server chooses post IDs; attempt labels
      // allow persisted recovery even if its response is ambiguous.
      for (let i = 0; i < 3; i++) {
        const title = `MIN-614 phase 3f navigation feedback ${index}-${i}`;
        state.attempts.push({ projectId, title }); await save();
        try { await api(`/api/projects/${projectId}/feedback`, 'POST', { title, body: 'Synthetic navigation workload. Remove after the campaign.', is_public: false, user: { email: 'min614-navigation@example.test', name: 'Performance navigation' } }); }
        catch (error) { state.ambiguous = String(error); await save(); }
        const posts = (await api(`/api/projects/${projectId}/feedback`)).posts.filter((post) => post.title === title);
        assert.equal(posts.length, 1, 'Verify persistence, never replay a setup POST');
        state.posts.push({ id: posts[0].id, projectId, title }); await save();
        const users = (await api(`/api/projects/${projectId}/feedback/users?q=min614-navigation`)).users;
        for (const user of users) if (!originalUsers.users.some((row) => row.id === user.id) && !state.users.some((row) => row.id === user.id)) state.users.push({ id: user.id, projectId });
        await save();
        if (state.ambiguous) throw new Error('Ambiguous setup recovered; stop until restoration');
      }
    }
    state.prepared = true; await save();
  }
  for (const issue of state.originalIssues) assert.equal((await api(`/api/issues/${issue.id}`)).status, 'triage');
  for (const project of state.projects) assert.equal((await api(`/api/projects/${project.id}/feedback`)).posts.length, project.originalPosts.length + 3);
  console.log(JSON.stringify({ prepared: true, triage: state.originalIssues.length, feedback: state.posts.length }));
} else {
  // Recover IDs by pre-write attempt labels before deleting only owned rows.
  for (const attempt of state.attempts) {
    const posts = (await api(`/api/projects/${attempt.projectId}/feedback`)).posts.filter((row) => row.title === attempt.title);
    assert.ok(posts.length <= 1);
    for (const post of posts) if (!state.posts.some((row) => row.id === post.id)) state.posts.push({ id: post.id, projectId: attempt.projectId, title: attempt.title });
  }
  await save();
  for (const post of state.posts) {
    const exists = (await api(`/api/projects/${post.projectId}/feedback`)).posts.find((row) => row.id === post.id);
    if (exists) { assert.equal(exists.title, post.title); await api(`/api/projects/${post.projectId}/feedback/${post.id}`, 'DELETE'); }
  }
  for (const issue of state.originalIssues) {
    const current = await api(`/api/issues/${issue.id}`); assert.equal(current.title, issue.title); assert.ok(['triage', issue.status].includes(current.status));
    if (current.status !== issue.status) await api(`/api/issues/${issue.id}`, 'PATCH', { status: issue.status });
    assert.equal((await api(`/api/issues/${issue.id}`)).status, issue.status);
  }
  for (const project of state.projects) {
    const ownedUsers = (await api(`/api/projects/${project.id}/feedback/users?q=min614-navigation`)).users.filter((user) => !project.originalUsers.includes(user.id));
    for (const user of ownedUsers) await api(`/api/projects/${project.id}/feedback/users?userId=${user.id}`, 'DELETE');
    assert.deepEqual((await api(`/api/projects/${project.id}/feedback`)).posts.map((row) => row.id), project.originalPosts);
    assert.deepEqual((await api(`/api/projects/${project.id}/feedback/users`)).users.map((row) => row.id), project.originalUsers);
  }
  state.cleanup = true; await save(); console.log(JSON.stringify({ cleanup: true, preservedHistoryAndTombstones: true }));
}

/**
 * `commit_page_collaboration` (MIN-688) replayed on in-memory rows, for the
 * test suites that fake PostgREST. It keeps the SQL function's order of
 * checks — receipts first, then stream heads, then the shared envelope token —
 * and moves the projection, the journal and the heads together, which is the
 * behavior the server code relies on. It does not pretend to reproduce row
 * locks or triggers; the SQL test covers those against a real database.
 */
export function fakeCommitPageCollaboration(
  state: { rows: Record<string, unknown>[]; batches: Record<string, unknown>[] },
  args: Record<string, unknown>
): { data: Record<string, unknown>; error: null } {
  const row = state.rows.find((candidate) => candidate.id === args.p_page_id);
  if (!row || row.deleted_at) return { data: { status: "missing" }, error: null };
  const batches = args.p_batches as Record<string, unknown>[];
  for (const batch of batches) {
    const existing = state.batches.find((item) => item.page_id === row.id && item.batch_id === batch.batch_id);
    if (existing) {
      return {
        data: { status: "duplicate", body_revision: row.body_revision ?? 0, title_revision: row.title_revision ?? 0 },
        error: null,
      };
    }
  }
  const heads = { body: Number(row.body_revision ?? 0), title: Number(row.title_revision ?? 0) };
  for (const batch of batches) {
    const field = batch.field as "body" | "title";
    if (heads[field] !== batch.base_revision) {
      return { data: { status: "behind", field, head: heads[field] }, error: null };
    }
    heads[field] += Number(batch.step_count);
  }
  if (Number(row.content_revision ?? 0) !== args.p_expected_content_revision) {
    return { data: { status: "retry" }, error: null };
  }
  for (const batch of batches) state.batches.push({ page_id: row.id, project_id: row.project_id, ...batch });
  for (const [key, value] of Object.entries(args.p_values as Record<string, unknown>)) row[key] = value;
  row.body_revision = heads.body;
  row.title_revision = heads.title;
  row.content_revision = Number(row.content_revision ?? 0) + 1;
  return { data: { status: "accepted", body_revision: heads.body, title_revision: heads.title }, error: null };
}

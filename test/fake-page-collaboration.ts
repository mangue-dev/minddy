/**
 * The page collaboration SQL functions (MIN-688) replayed on in-memory rows,
 * for the test suites that fake PostgREST. They keep each function's order of
 * checks — receipts first, then stream heads, then the shared envelope token —
 * and move the projection, the journal and the heads the way the server code
 * relies on: an append journals and advances a head without touching the page
 * row; a materialization or a commit writes the projection and the
 * materialized revisions (`pages.body_revision` / `title_revision`). They do
 * not pretend to reproduce row locks or triggers; the SQL probe covers those
 * against a real database.
 */

type Row = Record<string, unknown>;
type Field = "body" | "title";

export interface FakeCollabState {
  rows: Row[];
  batches: Row[];
  heads: Row[];
  /** Project membership generations; a missing project is generation 0. */
  generations?: Map<string, number>;
}

const FIELDS: Field[] = ["body", "title"];

/** What the `pages_initialize_collaboration_heads` trigger does for a new row. */
export function fakeInsertPageHeads(state: FakeCollabState, row: Row): void {
  for (const field of FIELDS) {
    if (state.heads.some((head) => head.page_id === row.id && head.field === field)) continue;
    state.heads.push({
      page_id: row.id,
      field,
      project_id: row.project_id,
      revision: Number(row[`${field}_revision`] ?? 0),
      pending_since: null,
    });
  }
}

function headRow(state: FakeCollabState, row: Row, field: Field): Row {
  fakeInsertPageHeads(state, row);
  return state.heads.find((head) => head.page_id === row.id && head.field === field)!;
}

/** A page row as a `COLLAB_COLUMNS` select returns it: heads embedded. */
export function withEmbeddedHeads(state: FakeCollabState, row: Row): Row {
  return {
    ...row,
    page_collaboration_heads: state.heads
      .filter((head) => head.page_id === row.id)
      .map((head) => ({ field: head.field, revision: head.revision })),
  };
}

function receipt(state: FakeCollabState, row: Row, batches: Row[]) {
  for (const batch of batches) {
    const existing = state.batches.find((item) => item.page_id === row.id && item.batch_id === batch.batch_id);
    if (!existing) continue;
    if (existing.field !== batch.field || existing.base_revision !== batch.base_revision ||
        existing.step_count !== batch.step_count) {
      return { data: { status: "batch_reused" }, error: null };
    }
    return {
      data: {
        status: "duplicate",
        body_revision: headRow(state, row, "body").revision,
        title_revision: headRow(state, row, "title").revision,
      },
      error: null,
    };
  }
  return null;
}

function advance(state: FakeCollabState, row: Row, batches: Row[]) {
  const heads = { body: Number(headRow(state, row, "body").revision), title: Number(headRow(state, row, "title").revision) };
  for (const batch of batches) {
    const field = batch.field as Field;
    if (heads[field] !== batch.base_revision) {
      return { behind: { data: { status: "behind", field, head: heads[field] }, error: null } };
    }
    heads[field] += Number(batch.step_count);
  }
  return { heads };
}

function journal(state: FakeCollabState, row: Row, batches: Row[]) {
  for (const batch of batches) {
    state.batches.push({
      page_id: row.id,
      project_id: row.project_id,
      created_at: new Date().toISOString(),
      ...batch,
      author_id: batch.author_id === "" ? null : batch.author_id,
      author_api_key_id: batch.author_api_key_id === "" ? null : batch.author_api_key_id,
      authored: batch.authored !== false,
    });
  }
}

function writeProjection(state: FakeCollabState, row: Row, values: Row, revisions: Record<Field, number>) {
  for (const [key, value] of Object.entries(values)) row[key] = value;
  row.body_revision = revisions.body;
  row.title_revision = revisions.title;
  row.content_revision = Number(row.content_revision ?? 0) + 1;
  for (const field of FIELDS) {
    const head = headRow(state, row, field);
    head.pending_since = Number(head.revision) > revisions[field] ? head.pending_since : null;
  }
}

/** `append_page_collaboration`: journal and heads only. */
export function fakeAppendPageCollaboration(state: FakeCollabState, args: Row) {
  const row = state.rows.find((candidate) => candidate.id === args.p_page_id);
  if (!row || row.deleted_at || row.project_id !== args.p_project_id) {
    return { data: { status: "missing" }, error: null };
  }
  const batches = args.p_batches as Row[];
  if (batches.some((batch) => !batch.encryption_version) && Number(row.encryption_version ?? 0) > 0) {
    return { data: null, error: { code: "23514", message: "page_collaboration_plaintext_refused" } };
  }
  const generation = state.generations?.get(row.project_id as string) ?? 0;
  if (args.p_generation !== generation) return { data: { status: "revoked" }, error: null };
  const duplicate = receipt(state, row, batches);
  if (duplicate) return duplicate;
  const moved = advance(state, row, batches);
  if (moved.behind) return moved.behind;
  journal(state, row, batches);
  const now = new Date().toISOString();
  for (const field of FIELDS) {
    const head = headRow(state, row, field);
    if (head.revision !== moved.heads![field]) {
      head.revision = moved.heads![field];
      head.pending_since ??= now;
    }
  }
  const pending = moved.heads!.body - Number(row.body_revision ?? 0) +
    moved.heads!.title - Number(row.title_revision ?? 0);
  return {
    data: {
      status: "accepted",
      body_revision: moved.heads!.body,
      title_revision: moved.heads!.title,
      pending,
      pending_ms: 0,
    },
    error: null,
  };
}

/** `materialize_page_collaboration`: the projection up to the given revisions. */
export function fakeMaterializePageCollaboration(state: FakeCollabState, args: Row) {
  const row = state.rows.find((candidate) => candidate.id === args.p_page_id);
  if (!row) return { data: { status: "missing" }, error: null };
  if (Number(row.content_revision ?? 0) !== args.p_expected_content_revision) {
    return { data: { status: "retry" }, error: null };
  }
  const revisions = { body: Number(args.p_body_revision), title: Number(args.p_title_revision) };
  for (const field of FIELDS) {
    const materialized = Number(row[`${field}_revision`] ?? 0);
    if (revisions[field] < materialized || revisions[field] > Number(headRow(state, row, field).revision)) {
      return { data: { status: "retry" }, error: null };
    }
  }
  if (revisions.body === Number(row.body_revision ?? 0) && revisions.title === Number(row.title_revision ?? 0)) {
    return { data: { status: "unchanged" }, error: null };
  }
  writeProjection(state, row, args.p_values as Row, revisions);
  return { data: { status: "materialized", pending: 0 }, error: null };
}

/** `commit_page_collaboration`: journal and projection at the new heads, together. */
export function fakeCommitPageCollaboration(state: FakeCollabState, args: Row) {
  const row = state.rows.find((candidate) => candidate.id === args.p_page_id);
  if (!row || row.deleted_at) return { data: { status: "missing" }, error: null };
  const batches = args.p_batches as Row[];
  const duplicate = receipt(state, row, batches);
  if (duplicate) return duplicate;
  const moved = advance(state, row, batches);
  if (moved.behind) return moved.behind;
  if (Number(row.content_revision ?? 0) !== args.p_expected_content_revision) {
    return { data: { status: "retry" }, error: null };
  }
  const given = args.p_materialized as Record<Field, number>;
  const materialized = {
    body: batches.some((batch) => batch.field === "body") ? moved.heads!.body : Number(given.body),
    title: batches.some((batch) => batch.field === "title") ? moved.heads!.title : Number(given.title),
  };
  for (const field of FIELDS) {
    if (materialized[field] < Number(row[`${field}_revision`] ?? 0) || materialized[field] > moved.heads![field]) {
      return { data: { status: "retry" }, error: null };
    }
  }
  journal(state, row, batches);
  for (const field of FIELDS) headRow(state, row, field).revision = moved.heads![field];
  writeProjection(state, row, args.p_values as Row, materialized);
  return { data: { status: "accepted", body_revision: moved.heads!.body, title_revision: moved.heads!.title }, error: null };
}

/** `reset_page_collaboration`: both heads jump one past every accepted step. */
export function fakeResetPageCollaboration(state: FakeCollabState, args: Row) {
  const row = state.rows.find((candidate) => candidate.id === args.p_page_id);
  if (!row) return { data: null, error: null };
  for (const field of FIELDS) {
    const head = headRow(state, row, field);
    head.revision = Math.max(Number(head.revision), Number(row[`${field}_revision`] ?? 0)) + 1;
    head.pending_since = null;
    row[`${field}_revision`] = head.revision;
  }
  return { data: null, error: null };
}

/** `pending_page_collaborations`. */
export function fakePendingPageCollaborations(state: FakeCollabState) {
  const ids = [...new Set(state.heads.filter((head) => head.pending_since).map((head) => head.page_id))];
  return { data: ids, error: null };
}

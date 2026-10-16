export interface CompleteScopedRowsPage<Row> {
  data: Row[] | null;
  error: { code?: string; message: string } | null;
  count?: number | null;
}

/** Keep only a schema code for guarded legacy fallbacks, never private SQL. */
export class CompleteScopedRowsError extends Error {
  constructor(public readonly databaseError: { code?: string } | null = null) {
    super("Unable to read a complete scoped collection");
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Read an unchanged authorized scope in UUID order. Each exact count describes
 * the remaining scope after the cursor, so a lower database row cap is safe.
 * Callers retain their own projection, filters, limit and final display order.
 */
export async function readCompleteScopedRows<Row>(
  readPage: (after: string | null) => PromiseLike<CompleteScopedRowsPage<Row>>,
  key: (row: Row) => unknown,
): Promise<Row[]> {
  const rows: Row[] = [];
  const identities = new Set<string>();
  let after: string | null = null;
  try {
    for (;;) {
      const result = await readPage(after);
      if (result.error) throw new CompleteScopedRowsError({ code: result.error.code });
      if (!Array.isArray(result.data)) throw new CompleteScopedRowsError();
      const count = result.count;
      if (count != null && (!Number.isSafeInteger(count) || count < result.data.length)) throw new CompleteScopedRowsError();
      for (const row of result.data) {
        const identity = key(row);
        if (typeof identity !== "string" || !UUID.test(identity) || identities.has(identity) ||
            after !== null && identity <= after) throw new CompleteScopedRowsError();
        identities.add(identity);
        rows.push(row);
        after = identity;
      }
      if (count === result.data.length || count == null && result.data.length === 0) return rows;
      if (result.data.length === 0) throw new CompleteScopedRowsError();
    }
  } catch (error) {
    if (error instanceof CompleteScopedRowsError) throw error;
    throw new CompleteScopedRowsError();
  }
}

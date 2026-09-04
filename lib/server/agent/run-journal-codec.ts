import { createHash } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";

export const RUN_JOURNAL_ENCODING = "gzip-json-v1";

/**
 * A single journal batch must fit through the agent control plane after JSON
 * framing. The supervisor normally emits much smaller batches, but one event is
 * indivisible and may be larger than the target batch size.
 */
export const RUN_JOURNAL_BATCH_MAX_BYTES = 3_500_000;

export interface EncodedRunJournal {
  encoding: typeof RUN_JOURNAL_ENCODING;
  payload: string;
  sha256: string;
  eventCount: number;
  payloadBytes: number;
  storedBytes: number;
}

export interface StoredRunJournalRow {
  events?: unknown;
  payload?: string | null;
  payload_encoding?: string | null;
  payload_sha256?: string | null;
  payload_bytes?: number | null;
}

export interface DecodedRunJournal {
  events: Record<string, unknown>[];
  payloadBytes: number;
}

function assertEvents(value: unknown): Record<string, unknown>[] {
  if (
    !Array.isArray(value) ||
    value.some(
      (event) =>
        event === null || typeof event !== "object" || Array.isArray(event),
    )
  ) {
    throw new Error("agent journal payload is not an event array");
  }
  return value as Record<string, unknown>[];
}

/** Encode an exact event batch into deterministic, opaque database storage. */
export function encodeRunJournal(
  events: Record<string, unknown>[],
): EncodedRunJournal {
  const raw = Buffer.from(JSON.stringify(events), "utf8");
  if (raw.byteLength > RUN_JOURNAL_BATCH_MAX_BYTES) {
    throw new Error(
      `agent journal batch is too large (${raw.byteLength} > ${RUN_JOURNAL_BATCH_MAX_BYTES})`,
    );
  }
  const compressed = gzipSync(raw, { level: 6 });
  return {
    encoding: RUN_JOURNAL_ENCODING,
    payload: compressed.toString("base64"),
    sha256: createHash("sha256").update(raw).digest("hex"),
    eventCount: events.length,
    payloadBytes: raw.byteLength,
    storedBytes: compressed.byteLength,
  };
}

/** Decode both new compressed rows and legacy JSONB rows. */
export function decodeRunJournalRow(
  row: StoredRunJournalRow,
): DecodedRunJournal {
  if (typeof row.payload === "string") {
    if (row.payload_encoding !== RUN_JOURNAL_ENCODING) {
      throw new Error(
        `unsupported agent journal encoding: ${String(row.payload_encoding)}`,
      );
    }
    const compressed = Buffer.from(row.payload, "base64");
    const raw = gunzipSync(compressed, {
      maxOutputLength: RUN_JOURNAL_BATCH_MAX_BYTES,
    });
    if (
      typeof row.payload_bytes === "number" &&
      row.payload_bytes !== raw.byteLength
    ) {
      throw new Error("agent journal payload size does not match its manifest");
    }
    if (
      typeof row.payload_sha256 === "string" &&
      createHash("sha256").update(raw).digest("hex") !== row.payload_sha256
    ) {
      throw new Error("agent journal payload digest does not match its manifest");
    }
    return {
      events: assertEvents(JSON.parse(raw.toString("utf8"))),
      payloadBytes: raw.byteLength,
    };
  }

  const events = assertEvents(row.events);
  return {
    events,
    payloadBytes: Buffer.byteLength(JSON.stringify(events), "utf8"),
  };
}

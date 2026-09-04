import { describe, expect, it } from "vitest";

import {
  decodeRunJournalRow,
  encodeRunJournal,
  RUN_JOURNAL_BATCH_MAX_BYTES,
  RUN_JOURNAL_ENCODING,
} from "./run-journal-codec";

describe("agent run journal codec", () => {
  it("round-trips an exact event batch and records its manifest", () => {
    const events = [
      {
        aggregateID: "session-1",
        seq: 1,
        type: "message.part.updated",
        data: { output: "x".repeat(20_000) },
      },
    ];

    const encoded = encodeRunJournal(events);
    const decoded = decodeRunJournalRow({
      payload: encoded.payload,
      payload_encoding: encoded.encoding,
      payload_sha256: encoded.sha256,
      payload_bytes: encoded.payloadBytes,
    });

    expect(encoded.encoding).toBe(RUN_JOURNAL_ENCODING);
    expect(encoded.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(encoded.eventCount).toBe(1);
    expect(encoded.storedBytes).toBeLessThan(encoded.payloadBytes);
    expect(decoded.events).toEqual(events);
    expect(decoded.payloadBytes).toBe(encoded.payloadBytes);
  });

  it("uses a stable digest so retried batches can be deduplicated", () => {
    const events = [{ aggregateID: "session-1", seq: 7, data: { ok: true } }];
    expect(encodeRunJournal(events).sha256).toBe(
      encodeRunJournal(events).sha256,
    );
  });

  it("continues to read legacy JSONB rows", () => {
    const events = [{ aggregateID: "legacy", seq: 1 }];
    expect(decodeRunJournalRow({ events }).events).toEqual(events);
  });

  it("rejects oversized batches before they reach the database", () => {
    expect(() =>
      encodeRunJournal([
        { output: "x".repeat(RUN_JOURNAL_BATCH_MAX_BYTES + 1) },
      ]),
    ).toThrow(/too large/);
  });

  it("rejects a compressed row whose manifest size is inconsistent", () => {
    const encoded = encodeRunJournal([{ seq: 1 }]);
    expect(() =>
      decodeRunJournalRow({
        payload: encoded.payload,
        payload_encoding: encoded.encoding,
        payload_bytes: encoded.payloadBytes + 1,
      }),
    ).toThrow(/manifest/);
  });

  it("rejects a compressed row whose digest is inconsistent", () => {
    const encoded = encodeRunJournal([{ seq: 1 }]);
    expect(() =>
      decodeRunJournalRow({
        payload: encoded.payload,
        payload_encoding: encoded.encoding,
        payload_sha256: "0".repeat(64),
        payload_bytes: encoded.payloadBytes,
      }),
    ).toThrow(/digest/);
  });
});

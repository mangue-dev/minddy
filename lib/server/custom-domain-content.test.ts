import { describe, expect, it, vi } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { EncryptedStore } from "./encryption/store";

const serviceRow = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: () => {
      const query = { select: () => query, eq: () => query,
        maybeSingle: async () => ({ data: serviceRow.current, error: null }) };
      return query;
    },
  }),
}));

const material = new Map([[1, randomBytes(32)], [2, randomBytes(32)]]);
const store = new EncryptedStore({
  current: async () => ({ version: 2, bytes: Buffer.from(material.get(2)!) }),
  byVersion: async (_scope, version) => ({ version,
    bytes: Buffer.from(material.get(version)!) }),
});
vi.mock("./encryption/registry", () => ({ getEncryptedStore: () => store }));

const { encodeDomainVerification, decodeDomainVerification,
  domainVerificationVersion } = await import("./custom-domain-content");
const { getDomainForBoard, serializeDomainStatus } =
  await import("./custom-domains");

describe("custom domain DNS verification content", () => {
  it("seals the challenge for both target kinds and binds it to the row", async () => {
    const id = randomUUID();
    const records = [{ type: "TXT", domain: "board.example.test",
      value: "private-verification-token" }];
    const sealed = await encodeDomainVerification(id, records);
    expect(sealed).toMatch(/^mdye3:/);
    expect(sealed).not.toContain(records[0].value);
    expect(domainVerificationVersion(sealed)).toBe(2);
    expect(await decodeDomainVerification(id, sealed)).toEqual(records);
    await expect(decodeDomainVerification(randomUUID(), sealed))
      .rejects.toThrow();
    expect(await decodeDomainVerification(id, records)).toEqual(records);
    expect(await decodeDomainVerification(id, null)).toBeNull();
    await expect(encodeDomainVerification(id,
      [{ type: "TXT", domain: "board.example.test", value: 42 }] as never))
      .rejects.toThrow();
  });

  it("projects decrypted TXT instructions after the domain lookup", async () => {
    const id = randomUUID();
    const record = { type: "TXT", domain: "board.example.test",
      value: "private-dns-challenge" };
    serviceRow.current = { id, board_id: randomUUID(), share_id: null,
      domain: record.domain, status: "pending",
      verification: await encodeDomainVerification(id, [record]),
      content_revision: 1, cname_target: null,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    expect(JSON.stringify(serviceRow.current)).not.toContain(record.value);
    const row = await getDomainForBoard((serviceRow.current as
      { board_id: string }).board_id);
    expect(serializeDomainStatus(row!).dns).toContainEqual({ type: "TXT",
      name: record.domain, value: record.value });
  });
});

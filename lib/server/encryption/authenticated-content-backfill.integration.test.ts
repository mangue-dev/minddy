import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EncryptedStore, type EncryptionContext } from "./store";

const enabled = process.env.MINDDY_ENCRYPTION_DB_TEST === "true";
const template = process.env.MINDDY_ENCRYPTION_FINAL_TEMPLATE ??
  "minddy_min591_security_final_20260927";
const container = "supabase_db_minddy-encryption-test";
const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;

function sql(database: string, statement: string): string {
  return execFileSync("docker", ["exec", "-i", container, "psql", "-At",
    "-v", "ON_ERROR_STOP=1", "-U", "supabase_admin", "-d", database],
  { input: statement, encoding: "utf8" }).trim();
}

describe.skipIf(!enabled)("authenticated OAuth and API-key backfill proofs", () => {
  it("requires authenticated content and exact revision CAS before activation", async () => {
    const database = `minddy_min591_proof_${randomUUID().replaceAll("-", "")}`;
    const user = randomUUID();
    const apiKey = randomUUID();
    const grant = randomUUID();
    const client = `client-${randomUUID()}`;
    const code = randomBytes(32).toString("hex");
    const key = randomBytes(32);
    const store = new EncryptedStore({
      async current() { return { version: 1, bytes: Buffer.from(key) }; },
      async byVersion(_scope, version) {
        if (version !== 1) throw new Error("Historical key unavailable");
        return { version: 1, bytes: Buffer.from(key) };
      },
    });
    const wrongStore = new EncryptedStore({
      async current() { return { version: 1, bytes: randomBytes(32) }; },
      async byVersion() { return { version: 1, bytes: randomBytes(32) }; },
    });
    const missingHistoricalKey = new EncryptedStore({
      async current() { return { version: 2, bytes: randomBytes(32) }; },
      async byVersion() { throw new Error("Historical key unavailable"); },
    });
    const contexts: EncryptionContext[] = [
      { scope: { kind: "system", id: "00000000-0000-0000-0000-000000000000" },
        table: "oauth_clients", column: "content", rowId: client },
      { scope: { kind: "user", id: user }, table: "api_keys",
        column: "content", rowId: apiKey },
      { scope: { kind: "user", id: user }, table: "oauth_authorization_codes",
        column: "content", rowId: code },
    ];
    const values = [
      { client_name: "Private client", redirect_uris: ["https://example.test/cb"],
        logo_uri: null, client_uri: null },
      { name: "Private actor", agent: null },
      { redirect_uri: "https://example.test/cb", resource: null },
    ];
    try {
      expect(sql(template, "SELECT count(*) FROM public.oauth_clients;")).toBe("0");
      sql("postgres", `CREATE DATABASE ${database} TEMPLATE ${template};`);
      if (!process.env.MINDDY_ENCRYPTION_FINAL_TEMPLATE) {
        const migration = readFileSync("supabase/migrations/20270108180000_authenticated_content_backfill_proofs.sql", "utf8");
        sql(database, migration);
      }
      const ciphertext = await Promise.all(values.map((value, index) =>
        store.encrypt(value, contexts[index])));
      sql(database, `INSERT INTO auth.users(id) VALUES(${quote(user)});
        INSERT INTO public.oauth_clients(client_id,client_name,redirect_uris,
          encrypted_content,encryption_version)
          VALUES(${quote(client)},NULL,NULL,${quote(ciphertext[0])},1);
        INSERT INTO public.api_keys(id,user_id,name,agent,key_hash,key_prefix,
          encrypted_content,encryption_version)
          VALUES(${quote(apiKey)},${quote(user)},NULL,NULL,${quote("a".repeat(64))},
            'proof',${quote(ciphertext[1])},1);
        INSERT INTO public.oauth_grants(id,user_id,client_id,api_key_id)
          VALUES(${quote(grant)},${quote(user)},${quote(client)},${quote(apiKey)});
        INSERT INTO public.oauth_authorization_codes(code_hash,client_id,user_id,
          grant_id,redirect_uri,resource,code_challenge,expires_at,
          encrypted_content,encryption_version)
          VALUES(${quote(code)},${quote(client)},${quote(user)},${quote(grant)},
            NULL,NULL,${quote("x".repeat(43))},now()+interval '1 hour',
            ${quote(ciphertext[2])},1);`);
      for (const [index, family, id] of [
        [0, "oauth_client", client], [1, "api_key", apiKey],
        [2, "oauth_code", code],
      ] as const) {
        expect(await store.decrypt(ciphertext[index], contexts[index]))
          .toEqual(values[index]);
        await expect(wrongStore.decrypt(ciphertext[index], contexts[index]))
          .rejects.toThrow();
        await expect(missingHistoricalKey.decrypt(ciphertext[index],
          contexts[index])).rejects.toThrow("Historical key unavailable");
        const truncated = JSON.stringify({ format: 3, keyVersion: 1 });
        expect(() => store.fromDatabase(truncated)).toThrow();
        const tampered = JSON.parse(ciphertext[index]);
        tampered.tag = tampered.tag.replace(/^./, tampered.tag[0] === "A" ? "B" : "A");
        await expect(store.decrypt(store.fromDatabase(JSON.stringify(tampered)),
          contexts[index])).rejects.toThrow();
        expect(sql(database, `SELECT public.confirm_encrypted_content(
          ${quote(family)},${quote(id)},99,${quote(ciphertext[index])});`))
          .toBe("f");
        expect(sql(database, `SELECT public.confirm_encrypted_content(
          ${quote(family)},${quote(id)},0,${quote(ciphertext[index])});`))
          .toBe("t");
      }
      expect(sql(database, "SELECT public.activate_oauth_client_content();"))
        .toBe("t");
      expect(sql(database, "SELECT public.activate_api_key_content();"))
        .toBe("t");
      expect(sql(database, "SELECT public.activate_oauth_code_content();"))
        .toBe("t");
      const changed = await store.encrypt({ ...values[0], client_name: "Changed" },
        contexts[0]);
      sql(database, `UPDATE public.oauth_clients SET encrypted_content=${quote(changed)}
        WHERE client_id=${quote(client)};`);
      expect(sql(database, `SELECT encryption_checked_at IS NULL FROM
        public.oauth_clients WHERE client_id=${quote(client)};`)).toBe("t");
      expect(sql(database, `SELECT public.confirm_encrypted_content('oauth_client',
        ${quote(client)},0,${quote(ciphertext[0])});`)).toBe("f");
      expect(sql(database, "SELECT public.activate_oauth_client_content();"))
        .toBe("f");
    } finally {
      key.fill(0);
      sql("postgres", `DROP DATABASE IF EXISTS ${database} WITH (FORCE);`);
    }
  });
});

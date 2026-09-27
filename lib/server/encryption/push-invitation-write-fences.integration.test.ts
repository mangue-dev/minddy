import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EncryptedStore, type EncryptionScope } from "./store";

const enabled = process.env.MINDDY_ENCRYPTION_DB_TEST === "true";
const container = "supabase_db_minddy-encryption-test";
const template = "minddy_min591_push_fresh";
const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;

function sql(database: string, statement: string): string {
  return execFileSync("docker", ["exec", "-i", container, "psql", "-At",
    "-v", "ON_ERROR_STOP=1", "-U", "supabase_admin", "-d", database], {
    input: statement, encoding: "utf8", maxBuffer: 4 * 1024 * 1024,
  }).trim();
}

function rejected(statement: string, expected: string): string {
  return `DO $test$ BEGIN
    BEGIN ${statement}; RAISE EXCEPTION 'unexpected success';
    EXCEPTION WHEN check_violation THEN
      IF SQLERRM <> ${quote(expected)} THEN RAISE; END IF;
    END;
  END $test$;`;
}

describe.skipIf(!enabled)("isolated invitation and push write fences", () => {
  it("rejects old writers, advances legacy CAS and transfers across owner key versions", async () => {
    const database = `minddy_min591_write_fence_${randomUUID().replaceAll("-", "").slice(0, 20)}`;
    const first = randomUUID(), second = randomUUID(), project = randomUUID();
    const invitation = randomUUID(), legacyInvitation = randomUUID();
    const digest = "a".repeat(64), otherDigest = "b".repeat(64);
    const keys = new Map<string, Map<number, Buffer>>([
      [first, new Map([[1, randomBytes(32)], [2, randomBytes(32)]])],
      [second, new Map([[1, randomBytes(32)], [2, randomBytes(32)]])],
    ]);
    const current = new Map<string, number>([[first, 2], [second, 1]]);
    const store = new EncryptedStore({
      current: async (scope: EncryptionScope) => ({
        version: current.get(scope.id)!,
        bytes: Buffer.from(keys.get(scope.id)!.get(current.get(scope.id)!)!),
      }),
      byVersion: async (scope: EncryptionScope, version: number) => ({
        version, bytes: Buffer.from(keys.get(scope.id)!.get(version)!),
      }),
    });
    const context = (owner: string, rowId: string) => ({
      scope: { kind: "user" as const, id: owner },
      table: "push_subscriptions", column: "content", rowId,
    });
    const seal = async (owner: string, rowId: string, endpoint: string) =>
      `mdye3:${await store.encrypt({ endpoint, p256dh: "private-key",
        auth: "private-auth", native_installation_id: null,
        device_label: "Private device", user_agent: "Private browser" },
      context(owner, rowId))}`;
    try {
      expect(sql(template, "SELECT count(*) FROM public.push_subscriptions;")).toBe("0");
      sql("postgres", `CREATE DATABASE ${database} TEMPLATE ${template};`);
      const migration = readFileSync("supabase/migrations/20270108030000_invitation_push_write_fences.sql", "utf8");
      sql(database, migration);
      sql(database, `INSERT INTO auth.users(id) VALUES(${quote(first)}),(${quote(second)});
        INSERT INTO public.projects(id,owner_id,name,key)
          VALUES(${quote(project)},${quote(first)},'Fixture','F591');`);

      sql(database, `SET ROLE service_role;
        INSERT INTO public.project_invitations(id,project_id,invited_email,
          invited_by,status) VALUES(${quote(legacyInvitation)},${quote(project)},
          'legacy@example.test',${quote(first)},'pending');
        INSERT INTO public.project_invitations(id,project_id,
          invited_email_ciphertext,invited_email_blind_index,
          encryption_version,invited_by,status,token)
          VALUES(${quote(invitation)},${quote(project)},'fixture-cipher',
          ${quote(digest)},1,${quote(first)},'pending',
          ${quote(`sha256:${digest}`)});
        SELECT count(*) FROM public.invitation_email_scope;`);
      expect(sql(database, `SET ROLE service_role;
        SELECT count(*) FROM public.invitation_email_scope;`).split("\n").at(-1)).toBe("1");
      sql(database, `SET ROLE service_role; ${rejected(
        `SELECT public.create_project_invitation_guarded(${quote(project)},
          ${quote(first)},'old-writer@example.test',NULL,NULL)`,
        "invitation_email_requires_encryption")}`);
      sql(database, `SET ROLE service_role; ${rejected(
        `UPDATE public.project_invitations SET invited_email='downgrade@example.test',
          invited_email_ciphertext=NULL,invited_email_blind_index=NULL,
          encryption_version=0 WHERE id=${quote(invitation)}`,
        "invitation_email_downgrade")}`);
      expect(sql(database, `SET ROLE service_role;
        SELECT public.activate_invitation_email();`).split("\n").at(-1)).toBe("f");
      sql(database, `SET ROLE service_role;
        UPDATE public.project_invitations SET status='rejected',
          invited_email=NULL WHERE id=${quote(legacyInvitation)};`);
      expect(sql(database, `SET ROLE service_role;
        SELECT public.activate_invitation_email();`).split("\n").at(-1)).toBe("t");

      const legacy = `https://legacy.example/${database}`;
      sql(database, `SET ROLE service_role;
        INSERT INTO public.push_subscriptions(user_id,endpoint,transport,p256dh,auth)
          VALUES(${quote(first)},${quote(legacy)},'web','old-key','old-auth');
        UPDATE public.push_subscriptions SET p256dh='new-key'
          WHERE endpoint=${quote(legacy)};`);
      expect(sql(database, `SELECT content_revision FROM public.push_subscriptions
        WHERE endpoint=${quote(legacy)};`)).toBe("1");
      sql(database, `SET ROLE service_role;
        UPDATE public.push_subscriptions SET auth='new-auth'
          WHERE endpoint=${quote(legacy)};
        UPDATE public.push_subscriptions SET device_label='New device'
          WHERE endpoint=${quote(legacy)};
        UPDATE public.push_subscriptions SET user_agent='New browser'
          WHERE endpoint=${quote(legacy)};
        INSERT INTO public.push_subscriptions(user_id,endpoint,transport,
          native_installation_id) VALUES(${quote(first)},'apns:${"c".repeat(64)}',
          'apns','installation-old');
        UPDATE public.push_subscriptions SET native_installation_id='installation-new'
          WHERE endpoint='apns:${"c".repeat(64)}';`);
      expect(sql(database, `SELECT content_revision FROM public.push_subscriptions
        WHERE endpoint=${quote(legacy)};`)).toBe("4");
      expect(sql(database, `SELECT content_revision FROM public.push_subscriptions
        WHERE endpoint='apns:${"c".repeat(64)}';`)).toBe("1");
      expect(sql(database, `UPDATE public.push_subscriptions SET endpoint=NULL,
        p256dh=NULL,auth=NULL,endpoint_digest=${quote(otherDigest)},
        encrypted_content='mdye3:{"format":3,"keyVersion":1}'
        WHERE endpoint=${quote(legacy)} AND content_revision=0
        RETURNING id;`)).toBe("UPDATE 0");

      sql(database, `SET ROLE service_role;
        INSERT INTO public.push_subscriptions(user_id,endpoint,transport,p256dh,auth)
          VALUES(${quote(second)},'https://private.example/a','web',
            'old-private-key','old-private-auth');`);

      const firstCipher = await seal(first, digest, "https://private.example/a");
      sql(database, `SET ROLE service_role;
        INSERT INTO public.push_subscriptions(user_id,endpoint_digest,
          encrypted_content,transport)
          VALUES(${quote(first)},${quote(digest)},${quote(firstCipher)},'web');`);
      sql(database, `SET ROLE service_role; ${rejected(
        `UPDATE public.push_subscriptions SET user_id=${quote(second)}
          WHERE endpoint_digest=${quote(digest)}`, "push_identity_change")}`);
      current.set(first, 1);
      const staleSameOwner = await seal(first, digest, "https://private.example/a");
      sql(database, `SET ROLE service_role; ${rejected(
        `UPDATE public.push_subscriptions SET encrypted_content=${quote(staleSameOwner)}
          WHERE endpoint_digest=${quote(digest)}`, "push_identity_change")}`);
      current.set(first, 2);
      sql(database, `SET ROLE service_role; ${rejected(
        `INSERT INTO public.push_subscriptions(user_id,endpoint,transport,p256dh,auth)
          VALUES(${quote(first)},'https://clear-again.example/push','web',
            'clear-key','clear-auth')`, "push_requires_encryption")}`);
      const secondCipher = await seal(second, digest, "https://private.example/a");
      const transferred = JSON.parse(sql(database, `SET ROLE service_role;
        SELECT row_to_json(p) FROM public.register_protected_push(
          ${quote(second)},'https://private.example/a',${quote(digest)},
          NULL,NULL,NULL,NULL,${quote(secondCipher)},'web','en',true) p;`
        ).split("\n").at(-1)!);
      expect(transferred.user_id).toBe(second);
      expect(sql(database, `SELECT count(*) FROM public.push_subscriptions
        WHERE endpoint='https://private.example/a';`)).toBe("0");
      expect(sql(database, `SELECT count(*) FROM public.push_subscriptions
        WHERE endpoint_digest=${quote(digest)};`)).toBe("1");
      expect(await store.decrypt(store.fromDatabase(secondCipher.slice(6)),
        context(second, digest))).toMatchObject({ endpoint: "https://private.example/a" });
      await expect(store.decrypt(store.fromDatabase(secondCipher.slice(6)),
        context(first, digest))).rejects.toThrow();

      current.set(first, 1);
      current.set(second, 2);
      const reverse = await seal(first, digest, "https://private.example/a");
      const movedBack = JSON.parse(sql(database, `SET ROLE service_role;
        SELECT row_to_json(p) FROM public.register_protected_push(
          ${quote(first)},'https://private.example/a',${quote(digest)},
          NULL,NULL,NULL,NULL,${quote(reverse)},'web','en',true) p;`
        ).split("\n").at(-1)!);
      expect(movedBack.user_id).toBe(first);
      expect(await store.decrypt(store.fromDatabase(reverse.slice(6)),
        context(first, digest))).toMatchObject({ endpoint: "https://private.example/a" });
    } finally {
      sql("postgres", `DROP DATABASE IF EXISTS ${database} WITH (FORCE);`);
      for (const versions of keys.values())
        for (const bytes of versions.values()) bytes.fill(0);
    }
  }, 60_000);
});

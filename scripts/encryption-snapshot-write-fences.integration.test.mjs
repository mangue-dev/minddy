import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const container = "supabase_db_minddy-encryption-test";
const template = process.env.MINDDY_ENCRYPTION_FENCE_TEMPLATE ??
  "minddy_min591_final_review";
const migration = readFileSync(
  "supabase/migrations/20270108090000_encryption_snapshot_write_fences.sql", "utf8");
const quote = (value) => `'${value.replaceAll("'", "''")}'`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function sql(database, statement) {
  return execFileSync("docker", ["exec", "-i", container, "psql", "-X", "-At",
    "-v", "ON_ERROR_STOP=1", "-U", "supabase_admin", "-d", database],
  { input: statement, encoding: "utf8", maxBuffer: 4 * 1024 * 1024 }).trim();
}

class Session {
  constructor(database) {
    this.process = spawn("docker", ["exec", "-i", container, "psql", "-X", "-q",
      "-At", "-v", "ON_ERROR_STOP=1", "-U", "supabase_admin", "-d", database]);
    this.stdout = "";
    this.stderr = "";
    this.pending = null;
    this.process.stdout.on("data", (chunk) => {
      this.stdout += chunk.toString();
      this.finish();
    });
    this.process.stderr.on("data", (chunk) => {
      this.stderr += chunk.toString();
    });
    this.process.on("close", () => {
      if (this.pending) {
        const pending = this.pending;
        this.pending = null;
        pending.reject(new Error(this.stderr || "psql session closed"));
      }
    });
  }

  finish() {
    if (!this.pending) return;
    const position = this.stdout.indexOf(this.pending.marker);
    if (position < 0) return;
    const pending = this.pending;
    this.pending = null;
    const output = this.stdout.slice(0, position);
    this.stdout = this.stdout.slice(position + pending.marker.length);
    pending.resolve(output.trim());
  }

  run(statement) {
    assert.equal(this.pending, null, "one SQL command at a time per session");
    const marker = `__MIN591_DONE_${randomUUID().replaceAll("-", "")}__`;
    const result = new Promise((resolve, reject) => {
      this.pending = { marker, resolve, reject };
    });
    this.process.stdin.write(`${statement.trim()}\n\\echo ${marker}\n`);
    return result;
  }

  close() {
    this.process.stdin.end();
  }
}

async function expectBlocked(promise) {
  const outcome = await Promise.race([
    promise.then(() => "done", () => "failed"),
    sleep(250).then(() => "blocked"),
  ]);
  assert.equal(outcome, "blocked", "writer must wait for the marker transaction");
}

async function repeatableReadIssue(database, fixed, actor, project) {
  const session = new Session(database);
  const cipher = '{"format":3,"keyVersion":1,"data":"fixture"}';
  try {
    await session.run("BEGIN ISOLATION LEVEL REPEATABLE READ;");
    await session.run(`SELECT count(*) FROM public.issue_encryption_scopes
      WHERE project_id=${quote(project)};`);
    sql(database, `INSERT INTO public.issues(project_id,number,title,description,
      plan,remote_url,automation_override,encryption_version,encrypted_content)
      VALUES(${quote(project)},1,NULL,NULL,NULL,NULL,NULL,1,${quote(cipher)});`);
    if (fixed) {
      await assert.rejects(session.run(`INSERT INTO public.issues(project_id,number,title)
        VALUES(${quote(project)},2,'stale snapshot clear issue');`),
      /encryption_requires_read_committed/);
    } else {
      await session.run(`INSERT INTO public.issues(project_id,number,title)
        VALUES(${quote(project)},2,'stale snapshot clear issue');`);
      await session.run("COMMIT;");
      assert.equal(sql(database, `SELECT count(*) FROM public.issues WHERE
        project_id=${quote(project)} AND title='stale snapshot clear issue';`), "1");
    }
  } finally {
    session.close();
  }
}

async function readCommittedFeedback(database, fixed, projects) {
  const [clearFirst, keyFirst] = projects;
  const first = new Session(database);
  const second = new Session(database);
  const clear = (project, value) => `INSERT INTO public.feedback_posts(
    project_id,title,body,submitted_title,submitted_body,source)
    VALUES(${quote(project)},${quote(value)},'private body',
      ${quote(value)},'private body','internal');`;
  const key = (project) => `SELECT public.create_envelope_data_key_if_absent(
    'project',${quote(project)},'content','fixture-wrapped-key');`;
  try {
    // The clear writer validates first. Its commit must precede key activation.
    await first.run("BEGIN;");
    await first.run(clear(clearFirst, "clear first"));
    await second.run("BEGIN;");
    const pendingKey = second.run(key(clearFirst));
    if (fixed) await expectBlocked(pendingKey);
    else await pendingKey;
    await first.run("COMMIT;");
    if (fixed) await pendingKey;
    await second.run("COMMIT;");
    assert.equal(sql(database, `SELECT count(*) FROM public.feedback_posts
      WHERE project_id=${quote(clearFirst)} AND title='clear first';`), "1");

    // The key writer validates first. The old clear writer must fail after it commits.
    await first.run("BEGIN;");
    await first.run(key(keyFirst));
    await second.run("BEGIN;");
    const pendingClear = second.run(clear(keyFirst, "key first"));
    if (fixed) {
      await expectBlocked(pendingClear);
      await first.run("COMMIT;");
      await assert.rejects(pendingClear, /feedback_post_requires_encryption/);
    } else {
      await pendingClear;
      await second.run("COMMIT;");
      await first.run("COMMIT;");
      assert.equal(sql(database, `SELECT count(*) FROM public.feedback_posts
        WHERE project_id=${quote(keyFirst)} AND title='key first';`), "1");
    }
  } finally {
    first.close();
    second.close();
  }
}

async function readCommittedComment(database, fixed, actor, project) {
  const issue = randomUUID();
  sql(database, `INSERT INTO public.issues(id,project_id,number,title)
    VALUES(${quote(issue)},${quote(project)},1,'Comment parent');`);
  const first = new Session(database);
  const second = new Session(database);
  try {
    await first.run("BEGIN;");
    await first.run(`SELECT public.create_envelope_data_key_if_absent(
      'project',${quote(project)},'content','fixture-wrapped-key');`);
    await second.run("BEGIN;");
    const pending = second.run(`INSERT INTO public.comments(issue_id,author_id,body)
      VALUES(${quote(issue)},${quote(actor)},'clear comment after key');`);
    if (fixed) {
      await expectBlocked(pending);
      await first.run("COMMIT;");
      await assert.rejects(pending, /comment_requires_encryption/);
    } else {
      await pending;
      await second.run("COMMIT;");
      await first.run("COMMIT;");
      assert.equal(sql(database, `SELECT count(*) FROM public.comments
        WHERE issue_id=${quote(issue)} AND body='clear comment after key';`), "1");
    }
  } finally {
    first.close();
    second.close();
  }
}

async function directMarkerAfterOldWriter(database, fixed, project) {
  const first = new Session(database);
  const second = new Session(database);
  try {
    await first.run("BEGIN;");
    await first.run(`INSERT INTO public.views(project_id,kind,name,filters,display)
      VALUES(${quote(project)},'custom','clear view before marker',
        '{}'::jsonb,'{}'::jsonb);`);
    await second.run("BEGIN;");
    const pending = second.run(`INSERT INTO public.view_content_encryption_scope(id)
      VALUES(true);`);
    if (fixed) await expectBlocked(pending);
    else await pending;
    await first.run("COMMIT;");
    if (fixed) await pending;
    await second.run("COMMIT;");
    assert.equal(sql(database, `SELECT count(*) FROM public.views
      WHERE project_id=${quote(project)} AND name='clear view before marker';`), "1");
  } finally {
    first.close();
    second.close();
  }
}

async function repeatableReadActivation(database, fixed, kind, statement) {
  const scopes = {
    oauth: "oauth_client_content_scope",
    code: "oauth_code_content_scope",
    api: "api_key_content_scope",
    push: "push_content_scope",
  };
  const activations = {
    oauth: "activate_oauth_client_content",
    code: "activate_oauth_code_content",
    api: "activate_api_key_content",
    push: "activate_push_content",
  };
  const session = new Session(database);
  try {
    await session.run("BEGIN ISOLATION LEVEL REPEATABLE READ;");
    await session.run(`SELECT count(*) FROM public.${scopes[kind]};`);
    assert.equal(sql(database, `SELECT public.${activations[kind]}();`), "t");
    if (fixed) {
      await assert.rejects(session.run(statement),
        /encryption_requires_read_committed/);
    } else {
      await session.run(statement);
      await session.run("COMMIT;");
    }
  } finally {
    session.close();
  }
}

async function repeatableReadInvitation(database, fixed, actor, project) {
  const session = new Session(database);
  const digest = "d".repeat(64);
  try {
    await session.run("BEGIN ISOLATION LEVEL REPEATABLE READ;");
    await session.run("SELECT count(*) FROM public.invitation_email_scope;");
    sql(database, `INSERT INTO public.project_invitations(project_id,
      invited_email_ciphertext,invited_email_blind_index,encryption_version,
      invited_by,status,token)
      VALUES(${quote(project)},'fixture-cipher',${quote(digest)},1,
        ${quote(actor)},'pending',${quote(`sha256:${digest}`)});`);
    const clear = `INSERT INTO public.project_invitations(project_id,
      invited_email,invited_by,status)
      VALUES(${quote(project)},'rr-old-writer@example.test',
        ${quote(actor)},'pending');`;
    if (fixed) await assert.rejects(session.run(clear),
      /encryption_requires_read_committed/);
    else {
      await session.run(clear);
      await session.run("COMMIT;");
      assert.equal(sql(database, `SELECT count(*) FROM public.project_invitations
        WHERE invited_email='rr-old-writer@example.test';`), "1");
    }
  } finally {
    session.close();
  }
}

async function repeatableReadAttachmentObject(database, fixed, project) {
  const session = new Session(database);
  sql(database, `INSERT INTO storage.buckets(id,name) VALUES
    ('attachments','attachments') ON CONFLICT DO NOTHING;`);
  try {
    await session.run("BEGIN ISOLATION LEVEL REPEATABLE READ;");
    await session.run("SELECT count(*) FROM public.attachment_object_encryption_scope;");
    sql(database, "INSERT INTO public.attachment_object_encryption_scope(id) VALUES(true);");
    const path = `projects/${project}/${randomUUID()}/legacy.txt`;
    const clear = `INSERT INTO storage.objects(bucket_id,name,metadata)
      VALUES('attachments',${quote(path)},'{}'::jsonb);`;
    if (fixed) await assert.rejects(session.run(clear),
      /encryption_requires_read_committed/);
    else {
      await session.run(clear);
      await session.run("COMMIT;");
      assert.equal(sql(database, `SELECT count(*) FROM storage.objects
        WHERE name=${quote(path)};`), "1");
    }
  } finally {
    session.close();
  }
}

function pausedInvitationAndNull(database, actor, project, legacy) {
  assert.equal(sql(database,
    "SELECT count(*) FROM public.invitation_email_scope;"), "1");
  // The first protected write persists the fence even before activation and
  // while an application rollout flag is paused.
  assert.throws(() => sql(database, `INSERT INTO public.project_invitations(
    project_id,invited_email,invited_by,status)
    VALUES(${quote(project)},'paused-old-writer@example.test',
      ${quote(actor)},'pending');`), /invitation_email_requires_encryption/);
  sql(database, `UPDATE public.project_invitations SET invited_email=NULL,
    status='rejected' WHERE id=${quote(legacy)};`);
  assert.throws(() => sql(database, `UPDATE public.project_invitations
    SET invited_email='clear-again@example.test' WHERE id=${quote(legacy)};`),
  /invitation_email_requires_encryption/);
}

test("isolated two-session encryption markers reproduce before and close after",
  { skip: process.env.MINDDY_ENCRYPTION_DB_TEST !== "true" }, async () => {
    for (const fixed of [false, true]) {
      const database = `minddy_min591_fence_${fixed ? "after" : "before"}_${
        randomUUID().replaceAll("-", "").slice(0, 12)}`;
      const actor = randomUUID();
      const projects = Array.from({ length: 5 }, () => randomUUID());
      try {
        sql("postgres", `CREATE DATABASE ${database} TEMPLATE ${template};`);
        if (fixed) sql(database, migration);
        sql(database, `INSERT INTO auth.users(id) VALUES(${quote(actor)});
          INSERT INTO public.projects(id,owner_id,name,key) VALUES
          (${quote(projects[0])},${quote(actor)},'Issue fixture','IFS'),
          (${quote(projects[1])},${quote(actor)},'Feedback one','FF1'),
          (${quote(projects[2])},${quote(actor)},'Feedback two','FF2'),
          (${quote(projects[3])},${quote(actor)},'Invitation','INV'),
          (${quote(projects[4])},${quote(actor)},'Comment','CMT');`);
        await repeatableReadIssue(database, fixed, actor, projects[0]);
        await readCommittedFeedback(database, fixed, projects.slice(1, 3));
        await readCommittedComment(database, fixed, actor, projects[4]);
        await directMarkerAfterOldWriter(database, fixed, projects[0]);
        const pausedLegacy = randomUUID();
        if (fixed) sql(database, `INSERT INTO public.project_invitations(id,
          project_id,invited_email,invited_by,status)
          VALUES(${quote(pausedLegacy)},${quote(projects[3])},
            'legacy@example.test',${quote(actor)},'pending');`);
        await repeatableReadInvitation(database, fixed, actor, projects[3]);
        await repeatableReadActivation(database, fixed, "oauth",
          `INSERT INTO public.oauth_clients(client_id,client_name,redirect_uris)
            VALUES('stale-${fixed}','clear OAuth client',ARRAY['https://example.test/cb']);`);
        const cipher = '{"format":3,"keyVersion":1,"data":"fixture"}';
        const keyId = randomUUID();
        const grantId = randomUUID();
        sql(database, `INSERT INTO public.oauth_clients(client_id,client_name,
          redirect_uris,encrypted_content,encryption_version)
          VALUES('sealed-fixture',NULL,NULL,${quote(cipher)},1);
          INSERT INTO public.api_keys(id,user_id,name,agent,key_hash,key_prefix,
            encrypted_content,encryption_version)
          VALUES(${quote(keyId)},${quote(actor)},NULL,NULL,
            ${quote("b".repeat(64))},'oauth',${quote(cipher)},1);
          INSERT INTO public.oauth_grants(id,user_id,client_id,api_key_id)
          VALUES(${quote(grantId)},${quote(actor)},'sealed-fixture',${quote(keyId)});`);
        await repeatableReadActivation(database, fixed, "code",
          `INSERT INTO public.oauth_authorization_codes(code_hash,client_id,
            user_id,grant_id,redirect_uri,code_challenge,expires_at)
            VALUES(${quote("c".repeat(64))},'sealed-fixture',${quote(actor)},
              ${quote(grantId)},'https://example.test/cb',
              ${quote("d".repeat(43))},now()+interval '10 minutes');`);
        await repeatableReadActivation(database, fixed, "api",
          `INSERT INTO public.api_keys(user_id,name,key_hash,key_prefix)
            VALUES(${quote(actor)},'clear API key',${quote("f".repeat(64))},'oauth');`);
        await repeatableReadActivation(database, fixed, "push",
          `INSERT INTO public.push_subscriptions(user_id,endpoint,transport,p256dh,auth)
            VALUES(${quote(actor)},'https://example.test/${fixed}',
              'web','clear-p256dh','clear-auth');`);
        await repeatableReadAttachmentObject(database, fixed, projects[0]);
        if (fixed) {
          pausedInvitationAndNull(database, actor, projects[3], pausedLegacy);
          assert.throws(() => sql(database,
            "DELETE FROM public.view_content_encryption_scope WHERE id=true;"),
          /encryption_marker_immutable/);
          assert.throws(() => sql(database,
            "UPDATE public.view_content_encryption_scope SET activated_at=NULL WHERE id=true;"),
          /encryption_marker_immutable/);
          assert.equal(sql(database, `SELECT
            has_table_privilege('service_role',
              'public.view_content_encryption_scope','DELETE'),
            has_table_privilege('service_role',
              'public.view_content_encryption_scope','TRUNCATE');`), "f|f");
          const removedProject = randomUUID();
          sql(database, `INSERT INTO public.projects(id,owner_id,name,key)
            VALUES(${quote(removedProject)},${quote(actor)},
              'Cascade fixture','CAS');
            INSERT INTO public.issue_encryption_scopes(project_id)
              VALUES(${quote(removedProject)});
            DELETE FROM public.projects WHERE id=${quote(removedProject)};`);
          assert.equal(sql(database, `SELECT count(*) FROM public.issue_encryption_scopes
            WHERE project_id=${quote(removedProject)};`), "0");
          assert.throws(() => sql(database,
            "INSERT INTO public.oauth_clients(client_id,client_name,redirect_uris) VALUES('old-writer','clear',ARRAY['https://example.test/cb']);"),
          /oauth_client_requires_encryption/);
          assert.throws(() => sql(database,
            `INSERT INTO public.push_subscriptions(user_id,endpoint,transport,p256dh,auth)
              VALUES(${quote(actor)},'https://example.test/old-writer',
                'web','clear-p256dh','clear-auth');`),
          /push_requires_encryption/);
          assert.throws(() => sql(database,
            "BEGIN ISOLATION LEVEL REPEATABLE READ; SELECT public.activate_api_key_content();"),
          /encryption_requires_read_committed/);
          assert.throws(() => sql(database,
            "BEGIN ISOLATION LEVEL SERIALIZABLE; SELECT public.create_envelope_data_key_if_absent('project',gen_random_uuid(),'content','fixture');"),
          /encryption_requires_read_committed/);
        }
      } finally {
        sql("postgres", `DROP DATABASE IF EXISTS ${database} WITH (FORCE);`);
      }
    }
  });

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript-api";

export function validateEncryptionPolicy(schema, policy) {
  const errors = [];
  const reasons = new Set(["routing_identity", "timestamp", "bounded_metadata", "operational_configuration",
    "public_identity", "one_way_authentication", "encryption_metadata", "token_digest", "remove_projection"]);
  for (const [table, definition] of Object.entries(schema)) {
    const rule = policy[table];
    if (!rule) { errors.push(`${table}: missing column policy`); continue; }
    const classified = [...rule.encrypted, ...Object.values(rule.clear).flat()];
    for (const reason of Object.keys(rule.clear)) {
      if (!reasons.has(reason)) errors.push(`${table}: unknown plaintext justification ${reason}`);
    }
    for (const column of Object.keys(definition.columns)) {
      const count = classified.filter((name) => name === column).length;
      if (count !== 1) errors.push(`${table}.${column}: expected one classification, found ${count}`);
    }
    for (const column of classified) {
      if (!Object.hasOwn(definition.columns, column)) errors.push(`${table}.${column}: unknown column`);
    }
    if (rule.scope.column && !Object.hasOwn(definition.columns, rule.scope.column)) {
      errors.push(`${table}: unknown scope column`);
    }
    for (const choice of rule.scope.choices ?? []) {
      if (!Object.hasOwn(definition.columns, choice.column)) errors.push(`${table}: unknown scope choice column`);
    }
    const ancestors = rule.scope.ancestors ?? (rule.scope.ancestor ? [rule.scope.ancestor] : []);
    for (const ancestor of ancestors) {
      const [parent, column] = ancestor.split(":");
      if (!Object.hasOwn(schema, parent) || !Object.hasOwn(definition.columns, column)) {
        errors.push(`${table}: unknown scope ancestor ${ancestor}`);
      }
    }
    if (rule.scope.lookup && (!Object.hasOwn(schema, rule.scope.lookup) ||
      rule.scope.match.some((column) => !Object.hasOwn(definition.columns, column) ||
        !Object.hasOwn(schema[rule.scope.lookup].columns, column)))) {
      errors.push(`${table}: unknown scope lookup`);
    }
  }
  for (const table of Object.keys(policy)) {
    if (!Object.hasOwn(schema, table)) errors.push(`${table}: unknown table`);
  }
  return errors;
}

export function databaseCalls(source, fileName) {
  const ast = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const calls = [];
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
      ["from", "rpc"].includes(node.expression.name.text)) {
      const receiver = node.expression.expression.getText(ast);
      if (/^(Array|Buffer|Object|[A-Za-z0-9]+Array)$/.test(receiver)) {
        ts.forEachChild(node, visit);
        return;
      }
      const argument = node.arguments[0];
      const name = argument && (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument))
        ? argument.text : null;
      calls.push({
        operation: node.expression.name.text,
        resource: name,
        line: ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1,
        storage: receiver.endsWith(".storage"),
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return calls;
}

/** Ignore line movement, but require review when a database access is added or removed. */
export function compareConsumers(previous, current) {
  const signature = ({ file, operation, resource, storage }) => JSON.stringify([file, operation, resource, storage]);
  const normalize = (items) => items.map(signature).sort();
  return JSON.stringify(normalize(previous)) === JSON.stringify(normalize(current));
}

export function checkEncryptionSchema(root) {
  const readJson = (file) => JSON.parse(readFileSync(path.join(root, file), "utf8"));
  const schema = readJson("docs/security/encryption/schema.json");
  const policy = readJson("lib/server/encryption/data-policy.json");
  const reviewed = readJson("docs/security/encryption/migrations.json");
  const sql = readJson("docs/security/encryption/sql-consumers.json");
  const errors = validateEncryptionPolicy(schema, policy);
  const migrationDir = path.join(root, "supabase/migrations");
  const files = readdirSync(migrationDir).filter((file) => file.endsWith(".sql")).sort();
  for (const file of files) {
    const digest = createHash("sha256").update(readFileSync(path.join(migrationDir, file))).digest("hex");
    if (reviewed[file] !== digest) errors.push(`${file}: schema and consumer audit needs refreshing`);
  }
  for (const file of Object.keys(reviewed)) {
    if (!files.includes(file)) errors.push(`${file}: audited migration is missing`);
  }
  return { schema, policy, sql, errors };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.cwd();
  const { schema, policy, sql, errors } = checkEncryptionSchema(root);
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
  } else {
    const files = [...new Set(execFileSync("git", ["ls-files", "-co", "--exclude-standard", "-z"])
      .toString().split("\0"))].filter((file) => /\.[cm]?[jt]sx?$/.test(file) &&
        !/\.(test|spec)\.[cm]?[jt]sx?$/.test(file)).sort();
    const consumers = [];
    for (const file of files) {
      let source;
      try { source = readFileSync(file, "utf8"); } catch (error) {
        if (error.code === "ENOENT") continue;
        throw error;
      }
      for (const call of databaseCalls(source, file)) {
        if (call.operation === "rpc" || call.storage || call.resource === null ||
          Object.hasOwn(schema, call.resource) || Object.hasOwn(sql.views, call.resource)) {
          consumers.push({ file, ...call });
        }
      }
    }
    if (process.argv.includes("--write-consumers")) {
      writeFileSync("docs/security/encryption/consumers.json", `${JSON.stringify(consumers, null, 2)}\n`);
    } else {
      const previous = JSON.parse(readFileSync("docs/security/encryption/consumers.json", "utf8"));
      if (!compareConsumers(previous, consumers)) {
        console.error("Database consumers changed: review the access paths and refresh the encryption consumer inventory.");
        process.exitCode = 1;
      }
    }
    const columns = Object.values(schema).reduce((count, table) => count + Object.keys(table.columns).length, 0);
    const encrypted = Object.values(policy).reduce((count, table) => count + table.encrypted.length, 0);
    console.log(`Encryption schema policy: ${Object.keys(schema).length} tables, ${columns} classified columns, ${encrypted} encryption targets, ${consumers.length} consumer candidates.`);
  }
}

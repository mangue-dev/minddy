import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const input = process.argv[2];
if (!input) throw new Error("Pass the JSON output of scripts/encryption-schema-audit.sql from an isolated database.");
const snapshot = JSON.parse(readFileSync(input, "utf8"));
const policy = JSON.parse(readFileSync("lib/server/encryption/data-policy.json", "utf8"));
const names = [...Object.keys(snapshot.tables), ...Object.keys(snapshot.views)];
const functionNames = [...new Set(Object.keys(snapshot.functions).map((signature) => signature.split("(")[0]))];
const digest = (source) => createHash("sha256").update(source).digest("hex");
const references = (source, candidates) => candidates.filter((name) => {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`).test(source);
});
const inventory = {
  views: Object.fromEntries(Object.entries(snapshot.views).map(([name, source]) => [name, {
    sha256: digest(source), relations: references(source, names).filter((item) => item !== name),
  }])),
  functions: Object.fromEntries(Object.entries(snapshot.functions).map(([signature, definition]) => {
    const relations = references(definition.definition, names);
    return [signature, {
      sha256: digest(definition.definition), securityDefiner: definition.securityDefiner,
      configuration: definition.configuration, acl: definition.acl, relations,
      protectedRelations: relations.filter((name) => policy[name]?.encrypted.length),
      functionReferences: references(definition.definition, functionNames)
        .filter((name) => name !== signature.split("(")[0]),
    }];
  })),
  triggers: snapshot.triggers,
};
writeFileSync("docs/security/encryption/sql-consumers.json", `${JSON.stringify(inventory, null, 2)}\n`);
console.log(`Inventoried ${Object.keys(inventory.functions).length} functions, ${Object.keys(inventory.views).length} views and ${Object.keys(inventory.triggers).length} triggers. References are review candidates, not a SQL data-flow proof.`);

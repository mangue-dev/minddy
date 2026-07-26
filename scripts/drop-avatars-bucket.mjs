/**
 * Retire le bucket de stockage `avatars`, devenu inutile : les avatars sont
 * générés à partir d'une graine (migration 20260903090000_avatar_seeds).
 *
 * Pourquoi un script et pas la migration : Supabase refuse toute écriture
 * directe dans `storage.objects` / `storage.buckets` (« Direct deletion from
 * storage tables is not allowed »). Seule l'API Storage peut le faire.
 *
 * À lancer UNE fois, après la migration :
 *   node scripts/drop-avatars-bucket.mjs          (liste ce qui serait supprimé)
 *   node scripts/drop-avatars-bucket.mjs --apply  (supprime pour de bon)
 *
 * Irréversible : les photos de profil sont perdues. C'est voulu.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const BUCKET = "avatars";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Charge .env sans dépendance (les scripts tournent hors du runtime Next). */
function env(name) {
  if (!process.env[name]) {
    for (const line of readFileSync(resolve(ROOT, ".env"), "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (/^["'].*["']$/.test(value)) value = value.slice(1, -1);
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
  const value = process.env[name];
  if (!value) throw new Error(`Variable d'environnement manquante : ${name}`);
  return value;
}

const apply = process.argv.includes("--apply");
const admin = createClient(
  env("NEXT_PUBLIC_SUPABASE_URL"),
  env("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const { data: buckets, error: listError } = await admin.storage.listBuckets();
if (listError) throw new Error(`Lecture des buckets : ${listError.message}`);
if (!buckets.some((b) => b.id === BUCKET)) {
  console.log(`Le bucket « ${BUCKET} » n'existe plus. Rien à faire.`);
  process.exit(0);
}

// Un fichier par compte, rangé sous `<uid>/avatar` : on descend d'un niveau.
const { data: folders, error: rootError } = await admin.storage
  .from(BUCKET)
  .list("", { limit: 1000 });
if (rootError) throw new Error(`Lecture du bucket : ${rootError.message}`);

const paths = [];
for (const folder of folders ?? []) {
  const { data: files } = await admin.storage
    .from(BUCKET)
    .list(folder.name, { limit: 1000 });
  for (const file of files ?? []) paths.push(`${folder.name}/${file.name}`);
}

console.log(`Bucket « ${BUCKET} » : ${paths.length} fichier(s)`);
for (const path of paths) console.log(`  - ${path}`);

if (!apply) {
  console.log("\nEssai à blanc. Relance avec --apply pour supprimer.");
  process.exit(0);
}

if (paths.length > 0) {
  const { error } = await admin.storage.from(BUCKET).remove(paths);
  if (error) throw new Error(`Suppression des fichiers : ${error.message}`);
}
const { error: deleteError } = await admin.storage.deleteBucket(BUCKET);
if (deleteError) throw new Error(`Suppression du bucket : ${deleteError.message}`);

console.log(`Bucket « ${BUCKET} » supprimé.`);

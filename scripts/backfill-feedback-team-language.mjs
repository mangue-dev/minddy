/**
 * Pose la langue d'équipe des projets qui n'en ont pas (`feedback_team_language`).
 *
 * Depuis la migration `20261107090000_feedback_translation`, la langue de
 * l'équipe est semée à la CRÉATION du projet, avec la langue de l'interface du
 * créateur. C'est le seul instant où on peut la lire : l'app la tient dans un
 * cookie, jamais sur le compte, et une passe de revue qui tourne trois jours
 * plus tard n'aurait aucun moyen de la retrouver.
 *
 * Les projets créés AVANT restent donc à NULL, et la revue retombe sur la
 * locale par défaut de l'app (`en`). Ce script est là pour leur dire la vérité,
 * une fois — il n'a rien à deviner, la langue est passée en argument.
 *
 * ⚠️ Le `.env` de la racine pointe sur la PRODUCTION. Le script est donc en
 * DRY-RUN par défaut : il liste ce qu'il changerait et n'écrit rien. Relancer
 * avec `--write` pour appliquer.
 *
 * Usage (depuis la racine du repo) :
 *   node scripts/backfill-feedback-team-language.mjs fr
 *   node scripts/backfill-feedback-team-language.mjs fr --write
 *   node scripts/backfill-feedback-team-language.mjs fr --owner <uuid> --write
 *   node scripts/backfill-feedback-team-language.mjs fr --all --write
 *
 * Par défaut, seuls les projets SANS langue sont touchés : `--all` écrase aussi
 * ceux qui en ont déjà une, ce qui n'est presque jamais ce qu'on veut (un projet
 * créé après la migration porte le choix réel de son créateur).
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// Le jeu fermé de lib/feedback/languages.ts — recopié ici parce qu'un script
// .mjs ne traverse pas l'alias "@/" du bundler. S'ils divergent, c'est celui du
// module TypeScript qui fait foi.
const LANGUAGES = [
  "en", "fr", "es", "de", "it", "pt", "nl", "pl", "tr", "ru", "ar", "ja", "ko", "zh",
];

const args = process.argv.slice(2);
const write = args.includes("--write");
const all = args.includes("--all");
const ownerIndex = args.indexOf("--owner");
const owner = ownerIndex >= 0 ? args[ownerIndex + 1] : null;
const language = args.find((a) => !a.startsWith("--") && a !== owner);

if (!language || !LANGUAGES.includes(language)) {
  console.error(
    `Langue manquante ou inconnue. Attendu l'un de : ${LANGUAGES.join(", ")}\n` +
      "Usage : node scripts/backfill-feedback-team-language.mjs <langue> [--owner <uuid>] [--all] [--write]"
  );
  process.exit(1);
}

// .env de la racine — parse minimal (KEY=value, ignore commentaires/quotes).
const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split("\n")
    .map((l) => l.match(/^([A-Z0-9_]+)=("?)(.*)\2$/))
    .filter(Boolean)
    .map((m) => [m[1], m[3]])
);
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY absents du .env");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

let query = supabase
  .from("projects")
  .select("id, name, key, owner_id, feedback_team_language")
  .is("deleted_at", null)
  .order("created_at", { ascending: true });
if (!all) query = query.is("feedback_team_language", null);
if (owner) query = query.eq("owner_id", owner);

const { data: projects, error } = await query;
if (error) {
  console.error("Lecture impossible :", error.message);
  process.exit(1);
}
if (!projects?.length) {
  console.log("Rien à faire : aucun projet ne correspond.");
  process.exit(0);
}

console.log(
  `${write ? "ÉCRITURE" : "DRY-RUN"} — ${projects.length} projet(s) → « ${language} »\n`
);
for (const p of projects) {
  console.log(`  ${p.key.padEnd(8)} ${p.name}   (${p.feedback_team_language ?? "—"} → ${language})`);
}

if (!write) {
  console.log("\nRien n'a été écrit. Relancer avec --write pour appliquer.");
  process.exit(0);
}

const { error: updateError } = await supabase
  .from("projects")
  .update({ feedback_team_language: language })
  .in(
    "id",
    projects.map((p) => p.id)
  );
if (updateError) {
  console.error("\nÉcriture impossible :", updateError.message);
  process.exit(1);
}
console.log(`\n${projects.length} projet(s) mis à jour.`);

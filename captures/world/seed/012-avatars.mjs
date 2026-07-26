/**
 * Éloigne les portraits des trois membres de démo.
 *
 * Pourquoi : l'avatar de minddy est un portrait dessiné sur un aplat coloré,
 * tiré d'une graine aléatoire. À 24 px sur une carte de board, c'est le FOND qui
 * dit qui est qui — le visage, non. Or le tirage a mis les trois membres dans
 * les bleus (Camille bleu, Alice bleu, Tom indigo), ce qui rend une capture du
 * board illisible.
 *
 * Ce n'est pas un défaut du code : le tirage de DiceBear est uniforme (vérifié,
 * 15 teintes ~20 fois chacune sur 300 graines). C'est de la malchance, et le
 * remède est celui que le produit offre déjà : retirer une graine.
 *
 * Le script vise une FAMILLE de teintes par personne, et relance le tirage
 * jusqu'à tomber dedans. Idempotent : relancé, il constate que chacun est déjà
 * dans sa famille et n'écrit rien.
 *
 *   node captures/world/seed/012-avatars.mjs           (montre le plan)
 *   node captures/world/seed/012-avatars.mjs --apply   (écrit, après accord)
 */
import { randomUUID } from "node:crypto";
import { createAvatar } from "@dicebear/core";
import * as lorelei from "@dicebear/lorelei";
import { openDemoWorld, createPlan } from "../../lib/guards.mjs";
import { AVATAR_BACKGROUNDS } from "../../../lib/avatar.ts";

/** Familles de teintes, découpées dans la roue de `lib/avatar.ts`. */
const FAMILIES = {
  chaud: ["ef4444", "f97316", "f59e0b", "eab308"], // rouge → jaune
  vert: ["84cc16", "22c55e", "10b981", "14b8a6"], // lime → turquoise
  froid: ["06b6d4", "0ea5e9", "3b82f6", "6366f1"], // cyan → indigo
  pourpre: ["8b5cf6", "d946ef", "ec4899"], // violet → rose
};

/**
 * Une famille par personne, choisies aux quatre coins de la roue. Camille garde
 * le froid : c'est le compte principal, son portrait est déjà celui qu'on voit
 * dans la barre latérale de la plupart des captures.
 */
const WANTED = {
  "captures-demo@minddy.app": "froid",
  "captures-demo+alice@minddy.app": "chaud",
  "captures-demo+tom@minddy.app": "vert",
};

/** Le fond que DiceBear tire pour une graine — la seule chose qui nous importe. */
function backgroundOf(seed) {
  const svg = createAvatar(lorelei, { seed, backgroundColor: AVATAR_BACKGROUNDS })
    .toString()
    .toLowerCase();
  return AVATAR_BACKGROUNDS.find((hex) => svg.includes(hex)) ?? null;
}

/** Tire des graines jusqu'à en trouver une qui tombe dans la famille visée. */
function seedInFamily(family) {
  for (let attempt = 0; attempt < 500; attempt++) {
    const seed = randomUUID();
    if (FAMILIES[family].includes(backgroundOf(seed))) return seed;
  }
  throw new Error(`Aucune graine trouvée pour la famille « ${family} » en 500 essais.`);
}

const world = await openDemoWorld();
const plan = createPlan(world);

const { data: rows, error } = await world.admin
  .from("user_avatars")
  .select("user_id, seed")
  .in("user_id", [...world.demoUserIds]);
if (error) throw new Error(`Lecture des graines : ${error.message}`);
const seedByUser = new Map((rows ?? []).map((r) => [r.user_id, r.seed]));

for (const user of world.demoUsers) {
  const family = WANTED[user.email];
  if (!family) continue;

  const current = seedByUser.get(user.id);
  const currentBackground = current ? backgroundOf(current) : null;
  if (currentBackground && FAMILIES[family].includes(currentBackground)) {
    console.log(`${user.full_name} : déjà en « ${family} » (#${currentBackground}), on ne touche pas.`);
    continue;
  }

  const seed = seedInFamily(family);
  console.log(
    `${user.full_name} : #${currentBackground ?? "?"} → #${backgroundOf(seed)} (famille « ${family} »)`,
  );
  plan.update(
    "user_avatars",
    { user_id: user.id },
    { seed, updated_at: new Date().toISOString() },
    `portrait de ${user.full_name}`,
  );
}

const description = plan.describe();
if (!description) {
  console.log("\nRien à faire : les trois portraits sont déjà éloignés.");
  process.exit(0);
}

console.log("\n" + description);
if (!process.argv.includes("--apply")) {
  console.log("\nEssai à blanc. Relance avec --apply pour écrire.");
  process.exit(0);
}

await plan.apply({ confirmed: true });
console.log("\nPortraits mis à jour.");

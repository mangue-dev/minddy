/**
 * Move the portraits of the three demo members away.
 *
 * Why: Minddy's avatar is a portrait drawn on a colored flat surface,
 * taken from a random seed. At 24 px on a board card, it is the BACKGROUND which
 * says who is who — the face, no. But the draw put the three members in
 * the blue ones (Camille blue, Alice blue, Tom indigo), which makes a capture of the
 * board illisible.
 *
 * This is not a defect in the code: the DiceBear draw is uniform (verified,
 * 15 shades ~20 times each on 300 seeds). It's bad luck, and the
 * remedy is what the product already offers: removing a seed.
 *
 * The script targets a FAMILY of shades per person, and restarts the draw
 * until you fall in. Idempotent: relaunched, he finds that everyone is already
 * in his family and writes nothing.
 *
 * node captures/world/seed/012-avatars.mjs (shows the plan)
 * node captures/world/seed/012-avatars.mjs --apply (written, after agreement)
 */
import { randomUUID } from "node:crypto";
import { createAvatar } from "@dicebear/core";
import * as lorelei from "@dicebear/lorelei";
import { openDemoWorld, createPlan } from "../../lib/guards.mjs";
import { AVATAR_BACKGROUNDS } from "../../../lib/avatar.ts";

/** Families of shades, cut out from the `lib/avatar.ts` wheel. */
const FAMILIES = {
  chaud: ["ef4444", "f97316", "f59e0b", "eab308"], // rouge → jaune
  vert: ["84cc16", "22c55e", "10b981", "14b8a6"], // lime → turquoise
  froid: ["06b6d4", "0ea5e9", "3b82f6", "6366f1"], // cyan → indigo
  pourpre: ["8b5cf6", "d946ef", "ec4899"], // violet → rose
};

/**
 * One family per person, chosen from the four corners of the wheel. Camille guard
 * the cold: this is the main account, his portrait is already the one we see
 * in the sidebar of most captures.
 */
const WANTED = {
  "captures-demo@minddy.app": "froid",
  "captures-demo+alice@minddy.app": "chaud",
  "captures-demo+tom@minddy.app": "vert",
};

/** The bottom DiceBear shoots for a seed — the only thing we care about. */
function backgroundOf(seed) {
  const svg = createAvatar(lorelei, { seed, backgroundColor: AVATAR_BACKGROUNDS })
    .toString()
    .toLowerCase();
  return AVATAR_BACKGROUNDS.find((hex) => svg.includes(hex)) ?? null;
}

/** Draw seeds until you find one that falls into the target family. */
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

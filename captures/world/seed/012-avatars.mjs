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
 * until you fall in. Idempotent: relaunched, it finds that everyone is already
 * in their family and writes nothing.
 *
 * MIN-976: the draw also has to suit the first name. A seed picks the hair
 * and, rarely, a beard; Alice came out with a short cut and Tom with long
 * hair. Each person now also has a LOOK — a set of hairstyles (long or tied
 * back, or short) and whether a beard or earrings may appear — and a seed is
 * kept only when both its background and its look fit.
 *
 * node captures/world/seed/012-avatars.mjs (shows the plan)
 * node captures/world/seed/012-avatars.mjs --apply (written, after agreement)
 */
import { createHash } from "node:crypto";
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
 * The Lorelei hairstyles (`variantNN`), sorted by eye from a contact sheet
 * of the 48. The ones that read either way are left out of both sets.
 */
const HAIR = {
  long: [10, 13, 14, 15, 17, 18, 19, 21, 23, 26, 29, 30, 31, 33, 35, 37, 38, 41, 42, 45, 46],
  short: [1, 2, 3, 4, 9, 12, 22, 25, 27, 28, 39, 47],
};

/** A look: the allowed hairstyles, and which rare extras may be drawn. */
const LOOKS = {
  feminine: { hair: HAIR.long, beard: false, earrings: true },
  masculine: { hair: HAIR.short, beard: true, earrings: false },
};

/**
 * One family per person, chosen from the four corners of the wheel, and the
 * look of the first name. Camille keeps the cold: this is the main account,
 * whose portrait is the one seen in the sidebar of most captures.
 */
const WANTED = {
  "captures-demo@minddy.app": { family: "froid", look: "feminine" },
  "captures-demo+alice@minddy.app": { family: "chaud", look: "feminine" },
  "captures-demo+tom@minddy.app": { family: "vert", look: "masculine" },
};

/** The portrait exactly as the app draws it (lib/avatar.ts). */
function draw(seed, extra = {}) {
  return createAvatar(lorelei, { seed, backgroundColor: AVATAR_BACKGROUNDS, ...extra });
}

/** What a seed draws that we care about: background, hairstyle, extras. */
function portraitOf(seed) {
  const avatar = draw(seed);
  const svg = avatar.toString();
  const lower = svg.toLowerCase();
  const hair = Number(avatar.toJson().extra.hair.replace("variant", ""));
  return {
    background: AVATAR_BACKGROUNDS.find((hex) => lower.includes(hex)) ?? null,
    hair,
    // The JSON names a beard and earrings even when their probability did
    // not draw them; turning each off and comparing says whether it shows.
    beard: draw(seed, { beardProbability: 0 }).toString() !== svg,
    earrings: draw(seed, { earringsProbability: 0 }).toString() !== svg,
  };
}

function fits(portrait, { family, look }) {
  const wanted = LOOKS[look];
  return FAMILIES[family].includes(portrait.background)
    && wanted.hair.includes(portrait.hair)
    && (wanted.beard || !portrait.beard)
    && (wanted.earrings || !portrait.earrings);
}

function describe(portrait) {
  if (!portrait) return "aucun portrait";
  const extras = [portrait.beard && "barbe", portrait.earrings && "boucles"].filter(Boolean);
  return `#${portrait.background}, coiffure ${portrait.hair}${extras.length ? `, ${extras.join(", ")}` : ""}`;
}

/**
 * A UUID-shaped seed derived from the person and the attempt number rather
 * than drawn at random, so the dry run shows the very portraits `--apply`
 * writes.
 */
function candidateSeed(email, attempt) {
  const hex = createHash("sha256").update(`demo-avatar:${email}:${attempt}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/** The first candidate seed that fits the person's family and look. */
function seedFor(email, wanted) {
  for (let attempt = 0; attempt < 5000; attempt++) {
    const seed = candidateSeed(email, attempt);
    if (fits(portraitOf(seed), wanted)) return seed;
  }
  throw new Error(`Aucune graine trouvée pour « ${wanted.family} / ${wanted.look} » en 5000 essais.`);
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
  const wanted = WANTED[user.email];
  if (!wanted) continue;

  const current = seedByUser.get(user.id);
  const currentPortrait = current ? portraitOf(current) : null;
  if (currentPortrait && fits(currentPortrait, wanted)) {
    console.log(`${user.full_name} : déjà bon (${describe(currentPortrait)}), on ne touche pas.`);
    continue;
  }

  const seed = seedFor(user.email, wanted);
  console.log(
    `${user.full_name} : ${describe(currentPortrait)} → ${describe(portraitOf(seed))} (« ${wanted.family} », ${wanted.look})`,
  );
  // A fresh account has no row yet: the app creates it on first use.
  if (current) {
    plan.update(
      "user_avatars",
      { user_id: user.id },
      { seed, updated_at: new Date().toISOString() },
      `portrait de ${user.full_name}`,
    );
  } else {
    plan.insert("user_avatars", [{ user_id: user.id, seed }], `portrait de ${user.full_name}`);
  }
}

const description = plan.describe();
if (!description) {
  console.log("\nRien à faire : les trois portraits sont déjà bons.");
  process.exit(0);
}

console.log("\n" + description);
if (!process.argv.includes("--apply")) {
  console.log("\nEssai à blanc. Relance avec --apply pour écrire.");
  process.exit(0);
}

await plan.apply({ confirmed: true });
console.log("\nPortraits mis à jour.");

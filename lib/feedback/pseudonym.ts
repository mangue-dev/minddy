import { createHash } from "node:crypto";

/**
 * Public pseudonyms of the feedback board (MIN-37): never real name nor
 * avatar on the public side. Deterministic derivative of feedback_user id, generated ONE
 * times on creation and stored on the row — lists can evolve without
 * renaming person. Neutral unique list (no variation by locale: un
 * pseudonym is a stable identifier, not copy). Collisions are
 * acceptable, the 2-digit suffix makes them rare.
 */

const ADJECTIVES = [
  "Amber", "Ancient", "Aqua", "Arctic", "Autumn", "Azure", "Bold", "Brave",
  "Bright", "Bronze", "Calm", "Candid", "Cheery", "Civic", "Clever", "Cobalt",
  "Coral", "Cosmic", "Crimson", "Curious", "Daring", "Dapper", "Deft", "Eager",
  "Early", "Earnest", "Emerald", "Fabled", "Fair", "Fleet", "Gentle", "Gilded",
  "Glad", "Golden", "Grand", "Hardy", "Honest", "Humble", "Indigo", "Ivory",
  "Jade", "Jolly", "Keen", "Kind", "Lively", "Loyal", "Lucid", "Lunar",
  "Mellow", "Merry", "Mighty", "Nimble", "Noble", "Novel", "Olive", "Onyx",
  "Opal", "Patient", "Peppy", "Plucky", "Quiet", "Rustic", "Scarlet", "Silver",
] as const;

const ANIMALS = [
  "Albatross", "Antelope", "Badger", "Beaver", "Bison", "Bobcat", "Buffalo",
  "Capybara", "Caribou", "Cheetah", "Chinchilla", "Condor", "Cougar", "Coyote",
  "Crane", "Dolphin", "Falcon", "Fennec", "Ferret", "Finch", "Firefly", "Fox",
  "Gazelle", "Gecko", "Gibbon", "Heron", "Hedgehog", "Ibex", "Iguana", "Jackal",
  "Jaguar", "Kestrel", "Kingfisher", "Koala", "Lemur", "Lynx", "Macaw", "Manatee",
  "Marmot", "Marten", "Meerkat", "Mongoose", "Moose", "Narwhal", "Ocelot",
  "Octopus", "Osprey", "Otter", "Owl", "Panther", "Pelican", "Penguin", "Puffin",
  "Quokka", "Raccoon", "Raven", "Salamander", "Seal", "Sparrow", "Swift",
  "Tanager", "Toucan", "Walrus", "Wombat",
] as const;

/** Stable pseudonym for a given seed (the feedback_user id), e.g. “Brave Otter 42”. */
export function generatePseudonym(seed: string): string {
  const digest = createHash("sha256").update(seed).digest();
  const adjective = ADJECTIVES[digest[0] % ADJECTIVES.length];
  const animal = ANIMALS[digest[1] % ANIMALS.length];
  const suffix = (((digest[2] << 8) | digest[3]) % 90) + 10; // 10..99
  return `${adjective} ${animal} ${suffix}`;
}

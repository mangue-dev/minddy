/**
 * 007 — le board de retours d'Aurora.
 *
 * Pour quelles captures :
 *   `feedbackBoard`  — le board PUBLIC trié par votes, avec compteurs, badges
 *                      de statut, une réponse d'équipe dépliée, catégories ;
 *   `feedbackInbox`  — le même retour vu côté équipe, avec la bannière de
 *                      suggestion de fusion et les actions de promotion.
 *
 * DEUX PRÉCAUTIONS, et elles ne sont pas cosmétiques :
 *
 *  1. Chaque post porte `analyzed_at` ET `classified_at`. La passe IA horaire
 *     (app/api/cron/feedback-analysis) ne réclame que les posts dont ces
 *     colonnes sont nulles. Sans elles, le cron ferait tourner un modèle sur
 *     nos données de démo, et ce serait facturé.
 *  2. `vote_count` n'est jamais écrit à la main : un trigger l'incrémente à
 *     chaque ligne de `feedback_votes`. On crée donc de vrais votes, et le
 *     compteur affiché correspond à ce qui existe réellement.
 *
 * Idempotent : board réutilisé, votants et posts reconnus à leur identité.
 *
 *   node captures/world/seed/007-feedback.mjs --dry-run
 *   node captures/world/seed/007-feedback.mjs
 */
import { randomBytes } from "node:crypto";
import { openDemoWorld, createPlan } from "../../lib/guards.mjs";
import { resolvePeople, requireProject } from "./_people.mjs";
import { currentCycleWindow, spreadInWindow } from "./_cycle-window.mjs";

const DRY_RUN = process.argv.includes("--dry-run");

/**
 * Les votants. Ce sont des identités de bout de chaîne (`feedback_users`), pas
 * des comptes minddy : sur le board public, personne n'apparaît sous son vrai
 * nom, seulement sous un pseudonyme stable.
 */
const VOTERS = [
  "Amber Otter 41", "Brave Heron 63", "Cobalt Lynx 28", "Curious Finch 77",
  "Daring Marmot 12", "Eager Puffin 55", "Emerald Gecko 39", "Fair Kestrel 84",
  "Gentle Bison 21", "Golden Raven 66", "Humble Ibex 47", "Indigo Falcon 30",
  "Jade Wombat 58", "Keen Ferret 19", "Lively Condor 72", "Loyal Marten 35",
  "Mellow Toucan 90", "Nimble Quokka 24", "Noble Osprey 61", "Olive Caribou 43",
  "Patient Seal 16", "Quiet Jaguar 88", "Rustic Beaver 52", "Silver Crane 37",
];

/**
 * Les retours. `votes` = nombre de votants parmi VOTERS (les N premiers), ce
 * qui donne des chevauchements crédibles : les gens votent sur plusieurs
 * sujets. `at` situe la soumission dans la quinzaine courante.
 */
const POSTS = [
  {
    title: "Let me use my own domain for the status page",
    body: "We embed the status page in our docs and the minddy.app URL breaks the illusion. A CNAME would be enough.",
    status: "planned",
    votes: 24,
    at: 0.05,
    category: "Fonctionnalité",
  },
  {
    title: "Slack alerts when an incident opens",
    body: "Email is too slow for the on-call rotation. A webhook into a Slack channel would cover 90% of what we need.",
    status: "in_progress",
    votes: 18,
    at: 0.1,
    category: "Fonctionnalité",
    teamResponse:
      "This is being built right now — it ships with the next release. It will post on open, update and resolve, with one channel per service.",
  },
  {
    title: "The uptime percentage is wrong after a partial outage",
    body: "A degraded window counts as fully down in the monthly figure, so our SLA report looks worse than reality.",
    status: "in_progress",
    votes: 15,
    at: 0.15,
    category: "Bug",
  },
  {
    title: "Subscribe to a single service, not the whole page",
    body: "We only care about the API. Right now following the status page means an email for every unrelated incident.",
    status: "planned",
    votes: 11,
    at: 0.25,
    category: "Fonctionnalité",
  },
  {
    title: "Dark mode for the public status page",
    body: "Our docs are dark by default and the embedded status widget is blinding.",
    status: "open",
    votes: 9,
    at: 0.35,
    category: "Design",
  },
  {
    title: "Export incident history as CSV",
    body: "For the quarterly review we copy incidents by hand into a spreadsheet.",
    status: "open",
    votes: 7,
    at: 0.45,
    category: "Fonctionnalité",
  },
  {
    /* Le doublon : c'est lui qui porte la bannière de suggestion de fusion. */
    title: "Can we get notified in Slack?",
    body: "Would be great to have incidents pushed to a Slack channel instead of email.",
    status: "open",
    votes: 5,
    at: 0.55,
    mergeSuggestedInto: "Slack alerts when an incident opens",
    mergeConfidence: 0.91,
  },
  {
    title: "Show the timezone on incident timestamps",
    body: "Our team is spread over three timezones and nobody can tell whether a timestamp is local or UTC.",
    status: "shipped",
    votes: 4,
    at: 0.6,
    category: "Amélioration",
  },
  {
    title: "An RSS feed of incidents",
    body: "So we can pipe it into our internal dashboard without polling the API.",
    status: "open",
    votes: 2,
    at: 0.75,
    category: "Fonctionnalité",
  },
];

function describeIntent(window) {
  const lines = [
    `  • Ouvrir 1 board public de retours sur le projet Aurora`,
    `  • Créer ${VOTERS.length} votants anonymes (pseudonymes publics, aucun vrai nom)`,
    `  • Créer ${POSTS.length} retours, soumis dans la quinzaine ${window.start} → ${window.end} :`,
  ];
  for (const post of POSTS) {
    const extras = [
      `${post.votes} votes`,
      post.status,
      post.teamResponse ? "réponse d'équipe" : null,
      post.mergeSuggestedInto ? "fusion suggérée par l'IA" : null,
      post.category ? `catégorie ${post.category}` : null,
    ].filter(Boolean);
    lines.push(`      - ${post.title} (${extras.join(", ")})`);
  }
  lines.push(
    `  • Créer ${POSTS.reduce((n, p) => n + p.votes, 0)} votes, pour que les compteurs affichés soient réels`,
  );
  return lines.join("\n");
}

async function main() {
  const window = currentCycleWindow();

  if (DRY_RUN) {
    console.log("Ce que ce script créerait (rien n'est écrit) :\n");
    console.log(describeIntent(window));
    return;
  }

  const world = await openDemoWorld();
  const people = resolvePeople(world);
  const project = requireProject(world, "AUR");

  // ── 1. Le board ────────────────────────────────────────────────────────────
  const { data: boards, error: boardError } = await world.admin
    .from("feedback_boards")
    .select("id, token, enabled")
    .eq("project_id", project.id);
  if (boardError) throw new Error(`captures: lecture du board — ${boardError.message}`);

  let board = (boards || [])[0];
  if (!board) {
    const plan = createPlan(world);
    plan.insert(
      "feedback_boards",
      [{
        project_id: project.id,
        token: randomBytes(16).toString("base64url"),
        enabled: true,
        show_categories: true,
      }],
      "board public",
    );
    console.log(plan.describe());
    const inserted = await plan.apply({ confirmed: true });
    board = inserted.feedback_boards[0];
    console.log(`  → board public ouvert, URL /f/${board.token}`);
  } else {
    console.log(`  → board déjà là, URL /f/${board.token}`);
  }

  // ── 2. Les votants ─────────────────────────────────────────────────────────
  const { data: existingUsers, error: userError } = await world.admin
    .from("feedback_users")
    .select("id, pseudonym, email")
    .eq("project_id", project.id);
  if (userError) throw new Error(`captures: lecture des votants — ${userError.message}`);

  const knownVoters = new Map((existingUsers || []).map((u) => [u.pseudonym, u]));
  const missingVoters = VOTERS.filter((p) => !knownVoters.has(p)).map((pseudonym, i) => ({
    project_id: project.id,
    // Le motif de démo dans l'email : ces identités restent reconnaissables
    // comme les nôtres même en regardant la table à l'œil nu.
    email: `captures-demo+voter${String(i + 1).padStart(2, "0")}@minddy.app`,
    pseudonym,
    verified_via: "email",
    created_at: spreadInWindow(window, i / VOTERS.length, 11),
  }));

  if (missingVoters.length > 0) {
    const plan = createPlan(world);
    plan.insert("feedback_users", missingVoters, "votant");
    console.log(plan.describe());
    const inserted = await plan.apply({ confirmed: true });
    for (const row of inserted.feedback_users) knownVoters.set(row.pseudonym, row);
    console.log(`  → ${missingVoters.length} votant(s) créés`);
  }

  const voterIds = VOTERS.map((p) => knownVoters.get(p).id);

  // ── 3. Les retours ─────────────────────────────────────────────────────────
  const { data: existingPosts, error: postError } = await world.admin
    .from("feedback_posts")
    .select("id, title, vote_count, suggested_merge_into_id")
    .eq("project_id", project.id);
  if (postError) throw new Error(`captures: lecture des retours — ${postError.message}`);

  const knownPosts = new Map((existingPosts || []).map((p) => [p.title, p]));
  const now = new Date().toISOString();

  const missingPosts = POSTS.filter((p) => !knownPosts.has(p.title)).map((post, i) => ({
    project_id: project.id,
    author_id: voterIds[i % voterIds.length],
    title: post.title,
    body: post.body,
    // Le texte soumis est sacré et jamais réécrit : ici il vaut le texte curé,
    // ce qui correspond à un retour que l'équipe n'a pas eu à retoucher.
    submitted_title: post.title,
    submitted_body: post.body,
    status: post.status,
    source: "board",
    is_public: true,
    review_state: "published",
    team_response: post.teamResponse ?? null,
    team_response_at: post.teamResponse ? spreadInWindow(window, 0.9, 15) : null,
    // Les deux horodatages qui tiennent le cron IA à l'écart.
    analyzed_at: now,
    classified_at: now,
    created_at: spreadInWindow(window, post.at, 9 + (i % 9)),
    updated_at: spreadInWindow(window, post.at, 9 + (i % 9)),
  }));

  if (missingPosts.length > 0) {
    const plan = createPlan(world);
    plan.insert("feedback_posts", missingPosts, "retour");
    console.log(plan.describe());
    const inserted = await plan.apply({ confirmed: true });
    for (const row of inserted.feedback_posts) knownPosts.set(row.title, row);
    console.log(`  → ${missingPosts.length} retour(s) créés`);
  }

  // ── 4. La suggestion de fusion ─────────────────────────────────────────────
  // Posée après coup : elle pointe un autre post, qui doit donc exister.
  const duplicate = POSTS.find((p) => p.mergeSuggestedInto);
  if (duplicate) {
    const dupRow = knownPosts.get(duplicate.title);
    const targetRow = knownPosts.get(duplicate.mergeSuggestedInto);
    if (!targetRow) throw new Error(`captures: cible de fusion « ${duplicate.mergeSuggestedInto} » introuvable.`);
    if (dupRow.suggested_merge_into_id !== targetRow.id) {
      const plan = createPlan(world);
      plan.update(
        "feedback_posts",
        { id: dupRow.id },
        { suggested_merge_into_id: targetRow.id, suggested_confidence: duplicate.mergeConfidence },
        "suggestion de fusion",
      );
      console.log(plan.describe());
      await plan.apply({ confirmed: true });
      console.log("  → suggestion de fusion posée sur le doublon");
    }
  }

  // ── 5. Les votes ───────────────────────────────────────────────────────────
  const { data: existingVotes, error: voteError } = await world.admin
    .from("feedback_votes")
    .select("post_id, user_id")
    .in("post_id", [...knownPosts.values()].map((p) => p.id));
  if (voteError) throw new Error(`captures: lecture des votes — ${voteError.message}`);
  const castVotes = new Set((existingVotes || []).map((v) => `${v.post_id}:${v.user_id}`));

  const missingVotes = [];
  for (const post of POSTS) {
    const row = knownPosts.get(post.title);
    for (const userId of voterIds.slice(0, post.votes)) {
      if (castVotes.has(`${row.id}:${userId}`)) continue;
      missingVotes.push({ post_id: row.id, user_id: userId });
    }
  }

  if (missingVotes.length === 0) {
    console.log("  → les votes sont déjà là");
  } else {
    const plan = createPlan(world);
    plan.insert("feedback_votes", missingVotes, "vote");
    console.log(plan.describe());
    await plan.apply({ confirmed: true });
    console.log(`  → ${missingVotes.length} vote(s) créés`);
  }

  // ── 6. Les catégories ──────────────────────────────────────────────────────
  const { data: categories, error: catError } = await world.admin
    .from("categories")
    .select("id, name")
    .eq("project_id", project.id);
  if (catError) throw new Error(`captures: lecture des catégories — ${catError.message}`);
  const byName = new Map((categories || []).map((c) => [c.name, c]));

  const { data: existingLinks } = await world.admin
    .from("feedback_post_categories")
    .select("post_id, category_id")
    .in("post_id", [...knownPosts.values()].map((p) => p.id));
  const linked = new Set((existingLinks || []).map((l) => `${l.post_id}:${l.category_id}`));

  const missingLinks = [];
  for (const post of POSTS) {
    if (!post.category) continue;
    const category = byName.get(post.category);
    if (!category) throw new Error(`captures: catégorie « ${post.category} » absente du projet.`);
    const row = knownPosts.get(post.title);
    if (linked.has(`${row.id}:${category.id}`)) continue;
    missingLinks.push({ post_id: row.id, category_id: category.id });
  }

  if (missingLinks.length > 0) {
    const plan = createPlan(world);
    plan.insert("feedback_post_categories", missingLinks, "catégorie de retour");
    console.log(plan.describe());
    await plan.apply({ confirmed: true });
    console.log(`  → ${missingLinks.length} catégorie(s) rattachées`);
  }

  // ── 7. Contrôle ────────────────────────────────────────────────────────────
  const { data: finalPosts } = await world.admin
    .from("feedback_posts")
    .select("title, vote_count, status, analyzed_at, classified_at")
    .eq("project_id", project.id)
    .order("vote_count", { ascending: false });

  const unguarded = (finalPosts || []).filter((p) => !p.analyzed_at || !p.classified_at);
  if (unguarded.length > 0) {
    throw new Error(
      `captures: ${unguarded.length} retour(s) sans analyzed_at/classified_at — le cron IA les réclamerait.`,
    );
  }

  console.log(`\n  Board /f/${board.token} :`);
  for (const p of finalPosts || []) {
    console.log(`    ${String(p.vote_count).padStart(3)} votes · ${p.status.padEnd(12)} ${p.title}`);
  }
  console.log(`  Le compte de Camille (${people.camille.slice(0, 8)}…) reste le propriétaire du board.`);
}

await main();

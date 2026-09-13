/**
 * routines — the Routines tab with the weekly security review selected.
 *
 * See `intent.md`. The demo routines are seeded DISABLED
 * (captures/world/seed/016-routines.mjs): the capture must show the
 * “paused” badge and the switch OFF, and must never turn them on.
 *
 * node captures/shots/routines/shot.mjs          # produces the PNGs
 * node captures/shots/routines/shot.mjs --publish # + books on the landing
 */
import { openPage, settle, shoot, CAPTURE, CAPTURE_VARIANTS } from "../../lib/browser.mjs";
import { publishShot, writeManifest } from "../../lib/publish.mjs";
import { openDemoWorld } from "../../lib/guards.mjs";

const SLOT = "routines";
const OUT = "captures/shots/routines/out";
const VIEWPORT = { width: 1447, height: 1085 };

const PUBLISH = process.argv.includes("--publish");
const VARIANTS = CAPTURE_VARIANTS;

/**
 * The selected routine, by title — the title is DATA (seeded identically in
 * every locale), the cadence and status lines around it are translated.
 */
const ROUTINE = "Weekly security review";

let legacyRunsFixture;

/**
 * Read the legacy demo history when the target database has not received the
 * scheduled-conversation migration yet. This is a read-only capture adapter;
 * the application uses the real occurrence API as soon as it becomes available.
 */
async function installLegacyRunsAdapter(page) {
  const routinesResponse = await page.request.get(`${CAPTURE.baseUrl}/api/routines`);
  if (!routinesResponse.ok()) return;
  const payload = await routinesResponse.json();
  const routine = payload.routines?.find((candidate) => candidate.title === ROUTINE);
  if (!routine) return;

  const runsUrl = `${CAPTURE.baseUrl}/api/routines/${routine.id}/runs`;
  const probe = await page.request.get(runsUrl);
  if (probe.ok()) return;

  legacyRunsFixture ??= (async () => {
    const world = await openDemoWorld();
    const { data, error } = await world.admin
      .from("agent_runs")
      .select("*")
      .eq("routine_id", routine.id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(`captures: unable to read demo routine runs — ${error.message}`);
    return (data || []).map((run) => ({
      id: run.id,
      project_id: run.project_id,
      issue_id: run.issue_id ?? null,
      pull_request_id: run.pull_request_id ?? null,
      status: run.status,
      model: run.model ?? null,
      model_forced: run.model_forced ?? false,
      reasoning_level: run.reasoning_level ?? null,
      key_mode: run.key_mode ?? null,
      triggered_by: "routine",
      prompt: run.prompt,
      title: run.title ?? null,
      base_branch: run.base_branch ?? null,
      branch_name: run.branch_name ?? null,
      pr_number: run.pr_number ?? null,
      pr_url: run.pr_url ?? null,
      pr_state: run.pr_state ?? null,
      continuations: run.continuations ?? 0,
      cost_usd: Number(run.cost_usd ?? 0),
      outcome: run.outcome === "completed" ? null : run.outcome ?? null,
      error_message: run.error_message ?? null,
      started_at: run.started_at ?? null,
      completed_at: run.completed_at ?? null,
      created_at: run.created_at,
      updated_at: run.updated_at,
      awaiting_input: run.awaiting_input ?? false,
      usage_percent: (Number(run.cost_usd ?? 0) / 15) * 100,
      resumable: false,
      kind: "legacy_agent",
      numo_conversation_id: null,
      origin: null,
      numo_status: null,
    }));
  })();
  const runs = await legacyRunsFixture;

  await page.route(`**/api/routines/${routine.id}/runs`, (route) =>
    route.fulfill({ json: { runs } }),
  );
}

async function capture({ locale, theme }) {
  const { browser, page } = await openPage({ theme, locale, viewport: VIEWPORT });
  try {
    await installLegacyRunsAdapter(page);
    await page.goto(`${CAPTURE.baseUrl}/routines`, { waitUntil: "domcontentloaded" });
    await settle(page, { expect: `text=${ROUTINE}` });

    // Nothing is selected on arrival: the main pane shows the “pick a
    // routine” hint. The click is what makes the shot.
    await page.getByRole("button", { name: new RegExp(ROUTINE) }).first().click();

    // The runs table is the payload: 4 passages, header row aside.
    await page.getByRole("table").waitFor({ state: "visible", timeout: 15_000 });
    const rowCount = await page.getByRole("table").getByRole("row").count();
    if (rowCount !== 5) {
      throw new Error(
        `${locale}/${theme} — la table d'exécutions affiche ${rowCount - 1} passage(s) au lieu de 4.`,
      );
    }

    // Nothing must remain under the cursor: rows and list items have a hover.
    await page.mouse.move(600, 60);
    await page.waitForTimeout(400);

    const path = `${OUT}/${locale}-${theme}.png`;
    await shoot(page, path);
    return { path, locale, theme };
  } finally {
    await browser.close();
  }
}

const results = [];
for (const variant of VARIANTS) {
  const r = await capture(variant);
  console.log(`  ${r.locale}/${r.theme} → ${r.path}`);
  results.push(r);
}

if (PUBLISH) {
  console.log("\nLivraison sur la landing :");
  for (const { locale, theme, path } of results) {
    const published = await publishShot({ slot: SLOT, lang: locale, theme, input: path });
    console.log(`  ${published.name} — ${(published.bytes / 1024).toFixed(0)} Ko`);
  }
  const { published } = await writeManifest();
  console.log(`\nManifeste : ${published.length} variante(s) publiée(s).`);
} else {
  console.log("\nRegarde les images, puis relance avec --publish pour les livrer.");
}

import { describe, expect, it } from "vitest";
import {
  summarizeGithubChecks,
  summarizeGitlabPipelines,
  type RawCheckRun,
  type RawCommitStatus,
} from "./checks-core";

// La partie PURE des checks CI (MIN-138) — les appels réseau vivent dans pr.ts /
// mr.ts et ne sont pas testables en node (server-only).

const run = (over: Partial<RawCheckRun> & { name: string }): RawCheckRun => ({
  status: "completed",
  conclusion: "success",
  ...over,
});

describe("summarizeGithubChecks", () => {
  it("agrège en succès quand tout passe", () => {
    const s = summarizeGithubChecks([run({ name: "build" }), run({ name: "test" })], []);
    expect(s.state).toBe("success");
    expect(s.passing).toBe(2);
    expect(s.total).toBe(2);
  });

  it("un seul échec l'emporte sur tout le reste", () => {
    const s = summarizeGithubChecks(
      [run({ name: "build" }), run({ name: "lint", conclusion: "failure" })],
      [],
    );
    expect(s.state).toBe("failure");
    expect(s.passing).toBe(1);
    // Ce qui demande une action passe en tête de liste.
    expect(s.checks[0].name).toBe("lint");
  });

  it("un check en cours l'emporte sur les succès, mais pas sur un échec", () => {
    expect(
      summarizeGithubChecks([run({ name: "a" }), run({ name: "b", status: "in_progress" })], [])
        .state,
    ).toBe("pending");
    expect(
      summarizeGithubChecks(
        [run({ name: "a", conclusion: "failure" }), run({ name: "b", status: "queued" })],
        [],
      ).state,
    ).toBe("failure");
  });

  it("un run non terminé est en cours, quelle que soit sa conclusion", () => {
    const s = summarizeGithubChecks([run({ name: "a", status: "queued", conclusion: null })], []);
    expect(s.checks[0].state).toBe("pending");
  });

  it("compte `neutral` et `skipped` comme non bloquants — 5/5, pas 3/5", () => {
    const s = summarizeGithubChecks(
      [
        run({ name: "a" }),
        run({ name: "b" }),
        run({ name: "c" }),
        run({ name: "d", conclusion: "neutral" }),
        run({ name: "e", conclusion: "skipped" }),
      ],
      [],
    );
    expect(s.state).toBe("success");
    expect(s.passing).toBe(5);
    expect(s.total).toBe(5);
  });

  it("traite `cancelled` et une conclusion inconnue comme un échec, jamais comme un succès", () => {
    expect(summarizeGithubChecks([run({ name: "a", conclusion: "cancelled" })], []).state).toBe(
      "failure",
    );
    expect(
      summarizeGithubChecks([run({ name: "a", conclusion: "something_new" })], []).state,
    ).toBe("failure");
  });

  it("fusionne check runs et commit statuses, et le check run gagne sur le même nom", () => {
    const statuses: RawCommitStatus[] = [
      { context: "ci/vercel", state: "failure", target_url: "https://vercel" },
      { context: "build", state: "pending" },
    ];
    const s = summarizeGithubChecks([run({ name: "build" })], statuses);
    expect(s.total).toBe(2);
    expect(s.checks.find((c) => c.name === "build")?.state).toBe("success");
    expect(s.checks.find((c) => c.name === "ci/vercel")?.state).toBe("failure");
  });

  it("porte le logo de l'App, son nom, son résultat et sa durée", () => {
    const s = summarizeGithubChecks(
      [
        run({
          name: "build",
          app: { id: 15368, slug: "github-actions", name: "GitHub Actions" },
          output: { title: "  3 warnings  " },
          started_at: "2026-08-01T15:25:57Z",
          completed_at: "2026-08-01T15:27:09Z",
        }),
      ],
      [],
    );
    const c = s.checks[0];
    expect(c.appName).toBe("GitHub Actions");
    expect(c.appAvatarUrl).toBe("https://avatars.githubusercontent.com/in/15368?s=48");
    expect(c.description).toBe("3 warnings");
    expect(c.durationMs).toBe(72_000);
  });

  it("le logo de l'App n'est PAS l'avatar de son propriétaire (l'org `github`)", () => {
    const owned = { owner: { avatar_url: "https://avatars/u/9919" } };
    // Avec un id, c'est le logo de l'App qui gagne…
    expect(
      summarizeGithubChecks([run({ name: "a", app: { id: 15368, ...owned } })], [])
        .checks[0].appAvatarUrl,
    ).toBe("https://avatars.githubusercontent.com/in/15368?s=48");
    // …et sans id, l'avatar du propriétaire vaut mieux que rien.
    expect(
      summarizeGithubChecks([run({ name: "a", app: owned })], [])
        .checks[0].appAvatarUrl,
    ).toBe("https://avatars/u/9919");
  });

  it("une durée absente, nulle ou négative ne s'affiche pas", () => {
    const noEnd = run({ name: "a", started_at: "2026-08-01T15:25:57Z" });
    expect(summarizeGithubChecks([noEnd], []).checks[0].durationMs).toBeNull();
    // GitHub date un job sauté avec une fin ANTÉRIEURE à son début (mesuré).
    const skipped = run({
      name: "b",
      started_at: "2026-08-01T12:19:20Z",
      completed_at: "2026-08-01T12:19:19Z",
    });
    expect(summarizeGithubChecks([skipped], []).checks[0].durationMs).toBeNull();
  });

  it("un commit status porte son logo et sa description, sans nom d'app", () => {
    const s = summarizeGithubChecks(
      [],
      [
        {
          context: "Vercel – ui",
          state: "success",
          description: "Deployment has completed",
          avatar_url: "https://avatars.githubusercontent.com/in/8329?v=4",
        },
      ],
    );
    const c = s.checks[0];
    expect(c.appAvatarUrl).toBe("https://avatars.githubusercontent.com/in/8329?v=4");
    expect(c.description).toBe("Deployment has completed");
    // Le contexte nomme déjà l'intégration : pas de « vercel[bot] » en plus.
    expect(c.appName).toBeNull();
    expect(c.durationMs).toBeNull();
  });

  it("préfère html_url à details_url pour le lien du check", () => {
    const s = summarizeGithubChecks(
      [run({ name: "a", html_url: "https://gh", details_url: "https://ext" })],
      [],
    );
    expect(s.checks[0].url).toBe("https://gh");
  });

  it("« aucun check » n'est pas « tout va bien » : state null", () => {
    const s = summarizeGithubChecks([], []);
    expect(s.state).toBeNull();
    expect(s.total).toBe(0);
  });

  it("ignore les entrées sans nom exploitable", () => {
    const s = summarizeGithubChecks([run({ name: "  " })], [{ context: "", state: "success" }]);
    expect(s.total).toBe(0);
  });
});

describe("summarizeGitlabPipelines", () => {
  it("ne garde que le pipeline le plus récent — un échec déjà corrigé ne traîne pas", () => {
    const s = summarizeGitlabPipelines([
      { id: 20, status: "success", web_url: "https://gl/20" },
      { id: 19, status: "failed", web_url: "https://gl/19" },
    ]);
    expect(s.total).toBe(1);
    expect(s.state).toBe("success");
    expect(s.checks[0].name).toBe("#20");
    expect(s.checks[0].url).toBe("https://gl/20");
  });

  it("le pipeline dit son CI et ce qu'il a fait tourner — le nom, sinon la branche", () => {
    const named = summarizeGitlabPipelines([
      { id: 20, status: "success", name: "Ruby 3.3", ref: "main" },
    ]).checks[0];
    expect(named.appName).toBe("GitLab CI/CD");
    expect(named.description).toBe("Ruby 3.3");
    // Pas de logo par intégration chez GitLab : l'UI retombe sur l'icône de la forge.
    expect(named.appAvatarUrl).toBeNull();
    expect(
      summarizeGitlabPipelines([{ id: 20, status: "success", ref: "main" }]).checks[0]
        .description,
    ).toBe("main");
  });

  it("mappe les états GitLab sur le vocabulaire commun", () => {
    expect(summarizeGitlabPipelines([{ id: 1, status: "running" }]).state).toBe("pending");
    expect(summarizeGitlabPipelines([{ id: 1, status: "failed" }]).state).toBe("failure");
    expect(summarizeGitlabPipelines([{ id: 1, status: "canceled" }]).state).toBe("failure");
    // Un job manuel non déclenché attend une décision humaine : pas un échec.
    expect(summarizeGitlabPipelines([{ id: 1, status: "manual" }]).state).toBe("success");
    expect(summarizeGitlabPipelines([{ id: 1, status: "skipped" }]).checks[0].state).toBe(
      "neutral",
    );
  });

  it("aucun pipeline → state null", () => {
    expect(summarizeGitlabPipelines([]).state).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import {
  fromGithubTimeline,
  fromGitlabSystemNotes,
  groupTimelineCommits,
  groupTimelineReviews,
  resolveCommitActors,
  sortTimelineOlderFirst,
  toReviewState,
  type PrTimelineEvent,
} from "@/lib/pr-timeline";

/**
 * Les formes ci-dessous sont celles que les deux forges renvoient RÉELLEMENT
 * (relevées contre `issues/{n}/timeline` et `merge_requests/{iid}/notes`) : c'est
 * ce qui arrive sur le fil, pas une intuition de ce qu'une timeline devrait être.
 */

describe("fromGithubTimeline", () => {
  it("garde une review avec son verdict, son corps et l'id qui porte ses points", () => {
    const [event] = fromGithubTimeline([
      {
        id: 987,
        event: "reviewed",
        state: "CHANGES_REQUESTED",
        body: "  Deux points bloquants.  ",
        submitted_at: "2026-08-01T10:00:00Z",
        user: { login: "alice", avatar_url: "https://avatars/alice" },
        html_url: "https://github.com/o/r/pull/3#pullrequestreview-987",
      },
    ]);
    expect(event).toMatchObject({
      kind: "reviewed",
      reviewState: "changes_requested",
      reviewId: 987,
      body: "Deux points bloquants.",
      createdAt: "2026-08-01T10:00:00Z",
      actor: { login: "alice", avatar_url: "https://avatars/alice" },
    });
  });

  it("laisse `body` absent sur une approbation nue — l'appelant en fait une ligne", () => {
    const [event] = fromGithubTimeline([
      { id: 5, event: "reviewed", state: "APPROVED", body: "", user: { login: "bob" } },
    ]);
    expect(event.kind).toBe("reviewed");
    expect(event.reviewState).toBe("approved");
    expect(event.body).toBeUndefined();
  });

  it("prend l'auteur et la date DANS le commit, que GitHub ne rattache à aucun compte", () => {
    const [event] = fromGithubTimeline([
      {
        event: "committed",
        sha: "abc123",
        message: "fix: la première ligne\n\net le corps, qui ne se lit pas ici",
        author: { name: "Clément", date: "2026-07-30T08:00:00Z" },
        html_url: "https://github.com/o/r/commit/abc123",
      },
    ]);
    expect(event).toMatchObject({
      id: "commit:abc123",
      kind: "committed",
      actor: { login: "Clément", avatar_url: null },
      createdAt: "2026-07-30T08:00:00Z",
      body: "fix: la première ligne",
      commitCount: 1,
    });
  });

  it("remplit le détail propre à chaque fait", () => {
    const events = fromGithubTimeline([
      { id: 1, event: "labeled", label: { name: "bug", color: "d73a4a" }, actor: { login: "a" } },
      { id: 2, event: "assigned", assignee: { login: "carol" }, actor: { login: "a" } },
      {
        id: 3,
        event: "review_requested",
        requested_reviewer: { login: "dave" },
        actor: { login: "a" },
      },
      { id: 4, event: "renamed", rename: { from: "Vieux titre", to: "Nouveau titre" } },
      { id: 5, event: "milestoned", milestone: { title: "v1" } },
      {
        id: 6,
        event: "cross-referenced",
        source: { issue: { number: 42, html_url: "https://github.com/o/r/issues/42" } },
      },
    ]);
    expect(events.map((e) => e.kind)).toEqual([
      "labeled",
      "assigned",
      "review_requested",
      "renamed",
      "milestoned",
      "cross_referenced",
    ]);
    expect(events[0].label).toEqual({ name: "bug", color: "d73a4a" });
    expect(events[1].subject).toBe("carol");
    expect(events[2].subject).toBe("dave");
    expect(events[3]).toMatchObject({ from: "Vieux titre", to: "Nouveau titre" });
    expect(events[4].name).toBe("v1");
    expect(events[5].reference).toBe("#42");
  });

  it("jette le bruit que GitHub lui-même n'affiche pas, et les événements inconnus", () => {
    const events = fromGithubTimeline([
      { id: 1, event: "subscribed", actor: { login: "a" } },
      { id: 2, event: "mentioned", actor: { login: "a" } },
      // Déjà servi par le fil des messages : le rendre ici le compterait deux fois.
      { id: 3, event: "commented", actor: { login: "a" } },
      { id: 4, event: "added_to_project", actor: { login: "a" } },
      { id: 5, event: "merged", actor: { login: "a" } },
    ]);
    expect(events.map((e) => e.kind)).toEqual(["merged"]);
  });
});

describe("fromGitlabSystemNotes", () => {
  const url = (id: number) => `https://gitlab.com/g/p/-/merge_requests/1#note_${id}`;
  const note = (id: number, body: string, system = true) => ({
    id,
    body,
    system,
    author: { username: "alice", avatar_url: null },
    created_at: "2026-08-01T10:00:00Z",
  });

  it("ne lit QUE les notes système — les messages sont servis par le fil", () => {
    const events = fromGitlabSystemNotes(
      [note(1, "un vrai commentaire", false), note(2, "merged")],
      url,
    );
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe("merged");
  });

  it("traduit les phrases de GitLab dans le vocabulaire commun", () => {
    const cases: Array<[string, PrTimelineEvent["kind"]]> = [
      ["approved this merge request", "reviewed"],
      ["unapproved this merge request", "review_dismissed"],
      ["added 3 commits", "committed"],
      ["marked this merge request as **ready**", "ready_for_review"],
      ["marked this merge request as **draft**", "converted_to_draft"],
      ["merged", "merged"],
      ["closed", "closed"],
      ["reopened", "reopened"],
      ["requested review from @dave", "review_requested"],
      ["assigned to @carol", "assigned"],
      ["unassigned @carol", "unassigned"],
    ];
    for (const [body, kind] of cases) {
      const [event] = fromGitlabSystemNotes([note(1, body)], url);
      expect(event.kind, body).toBe(kind);
    }
  });

  it("extrait ce que la phrase porte : verdict, nombre de commits, logins, titres", () => {
    const [approved] = fromGitlabSystemNotes([note(1, "approved this merge request")], url);
    expect(approved.reviewState).toBe("approved");

    const [pushed] = fromGitlabSystemNotes([note(2, "added 12 commits")], url);
    expect(pushed.commitCount).toBe(12);

    const [requested] = fromGitlabSystemNotes([note(3, "requested review from @dave")], url);
    expect(requested.subject).toBe("dave");

    const [renamed] = fromGitlabSystemNotes(
      [note(4, "changed title from **{-Vieux-} titre** to **{+Nouveau+} titre**")],
      url,
    );
    expect(renamed.kind).toBe("renamed");
    expect(renamed.from).toBe("Vieux titre");
    expect(renamed.to).toBe("Nouveau titre");
  });

  it("garde en clair la phrase qu'aucun motif ne reconnaît — un fait dit vaut mieux qu'un fait perdu", () => {
    const [event] = fromGitlabSystemNotes(
      [note(9, "changed the description **from something** to [other](https://x.test)")],
      url,
    );
    expect(event.kind).toBe("system");
    expect(event.body).toBe("changed the description from something to other");
    expect(event.url).toBe(url(9));
  });
});

describe("resolveCommitActors", () => {
  /** Le cas réel : `user.name` local ≠ login GitHub, et l'avatar n'existe que
      dans la liste des commits. */
  const committed: PrTimelineEvent = {
    id: "commit:abc",
    kind: "committed",
    actor: { login: "mangue", avatar_url: null },
    createdAt: "2026-08-01T10:00:00Z",
    sha: "abc",
    commitCount: 1,
  };

  const dev = { login: "mangue-dev", name: "mangué", avatar_url: "https://avatars/mangue-dev" };
  const claude = { login: "claude", name: "Claude Opus 5", avatar_url: "https://avatars/claude" };

  it("remplace le nom git par le COMPTE de forge, avatar compris", () => {
    const [event] = resolveCommitActors([committed], [{ sha: "abc", authors: [dev] }]);
    expect(event.actor).toEqual({
      login: "mangue-dev",
      avatar_url: "https://avatars/mangue-dev",
    });
  });

  it("porte TOUS les auteurs d'un commit co-signé, principal en tête", () => {
    const [event] = resolveCommitActors([committed], [{ sha: "abc", authors: [dev, claude] }]);
    expect(event.actors).toEqual([dev, claude]);
    // `actor` reste le premier : les rendus qui n'empilent pas continuent.
    expect(event.actor?.login).toBe("mangue-dev");
  });

  it("garde le nom git quand la forge n'a rattaché aucun compte, ou le commit manque", () => {
    expect(resolveCommitActors([committed], [{ sha: "abc", authors: [] }])[0].actor).toEqual({
      login: "mangue",
      avatar_url: null,
    });
    expect(resolveCommitActors([committed], [])[0].actor?.login).toBe("mangue");
    // Liste plafonnée : un commit hors des 250 premiers reste sous son nom git.
    expect(
      resolveCommitActors([committed], [{ sha: "zzz", authors: [dev] }])[0].actor?.login,
    ).toBe("mangue");
  });

  it("sans compte, l'auteur garde son nom — jamais un « — » à la place", () => {
    const [event] = resolveCommitActors(
      [committed],
      [{ sha: "abc", authors: [{ login: null, name: "Claude", avatar_url: null }] }],
    );
    expect(event.actor).toEqual({ login: "Claude", avatar_url: null });
  });

  it("ne touche à rien d'autre que les commits", () => {
    const merged: PrTimelineEvent = {
      id: "event:1",
      kind: "merged",
      actor: { login: "alice", avatar_url: null },
      createdAt: "2026-08-01T11:00:00Z",
      sha: "abc",
    };
    const [event] = resolveCommitActors([merged], [{ sha: "abc", authors: [dev] }]);
    expect(event.actor?.login).toBe("alice");
  });

  it("laisse ensuite le regroupement se faire sur le COMPTE, pas sur deux noms git", () => {
    const second: PrTimelineEvent = { ...committed, id: "commit:def", sha: "def" };
    const resolved = resolveCommitActors(
      [committed, second],
      [
        { sha: "abc", authors: [dev] },
        { sha: "def", authors: [dev, claude] },
      ],
    );
    const [group] = groupTimelineCommits(resolved);
    expect(group.commitCount).toBe(2);
    // La poussée est signée de tous ceux qui ont écrit ses commits.
    expect(group.actors).toEqual([dev, claude]);
  });
});

describe("groupTimelineCommits", () => {
  const commit = (sha: string, login: string | null, at: string): PrTimelineEvent => ({
    id: `commit:${sha}`,
    kind: "committed",
    actor: login ? { login, avatar_url: null } : null,
    createdAt: at,
    sha,
    commitCount: 1,
  });

  it("replie les commits consécutifs du même auteur en un seul fait", () => {
    const grouped = groupTimelineCommits([
      commit("a", "clem", "2026-08-01T10:00:00Z"),
      commit("b", "clem", "2026-08-01T10:05:00Z"),
      commit("c", "clem", "2026-08-01T10:10:00Z"),
    ]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].commitCount).toBe(3);
    // Le groupe se date de sa FIN et pointe son dernier commit.
    expect(grouped[0].sha).toBe("c");
    expect(grouped[0].createdAt).toBe("2026-08-01T10:10:00Z");
  });

  it("ne replie pas deux auteurs, ni deux poussées séparées par un autre fait", () => {
    const merged: PrTimelineEvent = {
      id: "event:1",
      kind: "merged",
      actor: null,
      createdAt: "2026-08-01T10:07:00Z",
    };
    const grouped = groupTimelineCommits([
      commit("a", "clem", "2026-08-01T10:00:00Z"),
      commit("b", "alice", "2026-08-01T10:05:00Z"),
      merged,
      commit("c", "alice", "2026-08-01T10:10:00Z"),
    ]);
    expect(grouped.map((e) => e.commitCount ?? null)).toEqual([1, 1, null, 1]);
  });
});

describe("groupTimelineReviews", () => {
  const review = (
    id: number,
    login: string,
    at: string,
    body?: string,
  ): PrTimelineEvent => ({
    id: `review:${id}`,
    kind: "reviewed",
    actor: { login, avatar_url: null },
    createdAt: at,
    reviewState: "commented",
    reviewId: id,
    ...(body ? { body } : {}),
  });

  it("replie les points posés un par un — MESURÉ : trois POST = trois reviews vides", () => {
    const grouped = groupTimelineReviews([
      review(1, "minddy-app[bot]", "2026-08-01T20:13:50Z"),
      review(2, "minddy-app[bot]", "2026-08-01T20:13:50Z"),
      review(3, "minddy-app[bot]", "2026-08-01T20:13:51Z"),
    ]);
    expect(grouped).toHaveLength(1);
    // Les trois ids voyagent : c'est par eux que l'appelant ramasse les points.
    expect(grouped[0].reviewIds).toEqual([1, 2, 3]);
  });

  it("ne fond jamais une review qui a un corps : son texte disparaîtrait", () => {
    const grouped = groupTimelineReviews([
      review(1, "alice", "2026-08-01T10:00:00Z"),
      review(2, "alice", "2026-08-01T10:00:01Z", "voilà ce que j'en pense"),
      review(3, "alice", "2026-08-01T10:00:02Z"),
    ]);
    expect(grouped.map((e) => e.reviewIds)).toEqual([[1], [2], [3]]);
  });

  it("ne fond ni deux auteurs, ni deux verdicts différents", () => {
    const approved: PrTimelineEvent = {
      ...review(2, "alice", "2026-08-01T10:00:01Z"),
      reviewState: "approved",
    };
    const grouped = groupTimelineReviews([
      review(1, "alice", "2026-08-01T10:00:00Z"),
      approved,
      review(3, "bob", "2026-08-01T10:00:02Z"),
      review(4, "bob", "2026-08-01T10:00:03Z"),
    ]);
    expect(grouped.map((e) => e.reviewIds)).toEqual([[1], [2], [3, 4]]);
  });

  it("laisse passer tout ce qui n'est pas une review", () => {
    const merged: PrTimelineEvent = {
      id: "event:9",
      kind: "merged",
      actor: null,
      createdAt: "2026-08-01T11:00:00Z",
    };
    const grouped = groupTimelineReviews([
      review(1, "alice", "2026-08-01T10:00:00Z"),
      merged,
      review(2, "alice", "2026-08-01T12:00:00Z"),
    ]);
    expect(grouped.map((e) => e.kind)).toEqual(["reviewed", "merged", "reviewed"]);
  });
});

describe("sortTimelineOlderFirst", () => {
  it("range du plus ancien au plus récent, et met les faits sans date à la fin", () => {
    const sorted = sortTimelineOlderFirst([
      { id: "b", createdAt: "2026-08-01T12:00:00Z" },
      { id: "z", createdAt: null },
      { id: "a", createdAt: "2026-08-01T09:00:00Z" },
    ]);
    expect(sorted.map((e) => e.id)).toEqual(["a", "b", "z"]);
  });
});

describe("toReviewState", () => {
  it("retombe sur « commenté » pour tout verdict qui ne tranche pas", () => {
    expect(toReviewState("APPROVED")).toBe("approved");
    expect(toReviewState("CHANGES_REQUESTED")).toBe("changes_requested");
    expect(toReviewState("DISMISSED")).toBe("dismissed");
    expect(toReviewState("PENDING")).toBe("commented");
    expect(toReviewState(null)).toBe("commented");
  });
});

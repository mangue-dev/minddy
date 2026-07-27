import { describe, expect, it } from "vitest";
import {
  REMOTE_LANDING_STATUS,
  normalizeGithubIssueEvent,
  normalizeGitlabIssueEvent,
  statusForRemoteAction,
} from "./issue-sync-core";

// Les fonctions PURES de la synchro d'issues (MIN-97) — la partie qui écrit en
// base vit dans issue-sync.ts et n'est pas testable en node (server-only).

describe("statusForRemoteAction", () => {
  it("mappe la fermeture des deux vocabulaires vers done", () => {
    expect(statusForRemoteAction("closed")).toBe("done"); // GitHub
    expect(statusForRemoteAction("close")).toBe("done"); // GitLab
  });

  it("mappe la réouverture vers backlog, jamais triage", () => {
    expect(statusForRemoteAction("reopened")).toBe("backlog");
    expect(statusForRemoteAction("reopen")).toBe("backlog");
  });

  it("ne change rien pour une ouverture ou une action inconnue", () => {
    expect(statusForRemoteAction("opened")).toBeNull();
    expect(statusForRemoteAction("open")).toBeNull();
    expect(statusForRemoteAction("labeled")).toBeNull();
    expect(statusForRemoteAction("")).toBeNull();
  });

  it("fait atterrir les issues importées en triage", () => {
    expect(REMOTE_LANDING_STATUS).toBe("triage");
  });
});

describe("normalizeGithubIssueEvent", () => {
  const opened = {
    action: "opened",
    issue: {
      number: 42,
      title: "Le bouton ne répond pas",
      body: "Sur Safari uniquement.",
      html_url: "https://github.com/acme/app/issues/42",
    },
    repository: { id: 987654, full_name: "acme/app" },
    sender: { login: "octocat", type: "User" },
  };

  it("ramène un payload issues.opened à la forme neutre", () => {
    expect(normalizeGithubIssueEvent(opened)).toEqual({
      provider: "github",
      repoFullName: "acme/app",
      repoId: "987654",
      number: 42,
      title: "Le bouton ne répond pas",
      body: "Sur Safari uniquement.",
      url: "https://github.com/acme/app/issues/42",
      action: "opened",
      actorLogin: "octocat",
    });
  });

  it("rejette une pull request déguisée en issue", () => {
    const asPr = {
      ...opened,
      issue: { ...opened.issue, pull_request: { url: "https://api.github.com/..." } },
    };
    expect(normalizeGithubIssueEvent(asPr)).toBeNull();
  });

  it("rejette un payload sans dépôt ni numéro exploitable", () => {
    expect(normalizeGithubIssueEvent({ action: "opened" })).toBeNull();
    expect(
      normalizeGithubIssueEvent({ ...opened, repository: { full_name: "acme/app" } }),
    ).toBeNull();
    expect(normalizeGithubIssueEvent(null)).toBeNull();
  });
});

describe("normalizeGitlabIssueEvent", () => {
  const closed = {
    object_kind: "issue",
    user: { id: 7, username: "tanuki" },
    project: { id: 555, path_with_namespace: "acme/group/app" },
    object_attributes: {
      id: 999,
      iid: 12,
      title: "Erreur 500 au login",
      description: "Depuis la 2.3.",
      url: "https://gitlab.com/acme/group/app/-/issues/12",
      action: "close",
    },
  };

  it("lit l'iid — pas l'id — et ramène à la forme neutre", () => {
    expect(normalizeGitlabIssueEvent(closed)).toEqual({
      provider: "gitlab",
      repoFullName: "acme/group/app",
      repoId: "555",
      number: 12,
      title: "Erreur 500 au login",
      body: "Depuis la 2.3.",
      url: "https://gitlab.com/acme/group/app/-/issues/12",
      action: "close",
      actorLogin: "tanuki",
    });
  });

  it("rejette une issue confidentielle", () => {
    expect(
      normalizeGitlabIssueEvent({ ...closed, object_kind: "confidential_issue" }),
    ).toBeNull();
  });

  it("rejette un autre object_kind ou un payload incomplet", () => {
    expect(normalizeGitlabIssueEvent({ ...closed, object_kind: "merge_request" })).toBeNull();
    expect(
      normalizeGitlabIssueEvent({ ...closed, object_attributes: { action: "close" } }),
    ).toBeNull();
    expect(normalizeGitlabIssueEvent(null)).toBeNull();
  });
});

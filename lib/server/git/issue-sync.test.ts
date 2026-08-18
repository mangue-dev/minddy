import { describe, expect, it } from "vitest";
import {
  REMOTE_LANDING_STATUS,
  normalizeGithubIssueEvent,
  normalizeGitlabIssueEvent,
  remoteStateForStatus,
  statusForRemoteAction,
  statusForRemoteReconcile,
  type RemoteIssue,
} from "./issue-sync-core";
import { forgeIssueResource } from "./forge-resource";

// The PURES functions of the output sync (MIN-97) — the part that writes in
// base lives in issue-sync.ts and is not testable in node (server-only).

describe("statusForRemoteAction", () => {
  it("mappe la fermeture des deux vocabulaires vers done", () => {
    expect(statusForRemoteAction("closed")).toBe("done"); // GitHub
    expect(statusForRemoteAction("close")).toBe("done"); // GitLab
  });

  it("maps reopening to backlog, never triage", () => {
    expect(statusForRemoteAction("reopened")).toBe("backlog");
    expect(statusForRemoteAction("reopen")).toBe("backlog");
  });

  it("changes nothing for an opening or unknown action", () => {
    expect(statusForRemoteAction("opened")).toBeNull();
    expect(statusForRemoteAction("open")).toBeNull();
    expect(statusForRemoteAction("labeled")).toBeNull();
    expect(statusForRemoteAction("")).toBeNull();
  });

  it("lands imported issues in triage", () => {
    expect(REMOTE_LANDING_STATUS).toBe("triage");
  });
});

describe("statusForRemoteReconcile", () => {
  const base: RemoteIssue = {
    provider: "github",
    repoFullName: "acme/app",
    repoId: "1",
    number: 42,
    title: "t",
    body: null,
    url: null,
    action: "edited",
    actorLogin: null,
    state: null,
    labels: [],
    assigneeLogins: [],
  };
  const closed = { ...base, state: "closed" as const };
  const open = { ...base, state: "open" as const };

  it("lit l'état porté par le payload, même sur une action muette", () => {
    // This is what catches a closure whose webhook is lost: a
    // `edited` which arrives after it still carries `state: closed`.
    expect(statusForRemoteReconcile(closed, "in_progress")).toBe("done");
  });

  it("does NOT RECLASSIFY an otherwise closed ticket — the canceled trap", () => {
    // All three are worth “closed” on the forge side: as long as it says closed, it does not
    // says nothing more than what minddy already knows.
    expect(statusForRemoteReconcile(closed, "canceled")).toBeNull();
    expect(statusForRemoteReconcile(closed, "duplicate")).toBeNull();
    expect(statusForRemoteReconcile(closed, "done")).toBeNull();
  });

  it("changes nothing when both sides agree on « open »", () => {
    // Otherwise any edition of an open issue would return a ticket to the backlog
    // that we had just switched to in_progress in minddy.
    for (const status of ["triage", "backlog", "todo", "in_progress", "in_review"] as const) {
      expect(statusForRemoteReconcile(open, status), status).toBeNull();
    }
  });

  it("rouvre en backlog un ticket clos que la forge a rouvert", () => {
    expect(statusForRemoteReconcile(open, "done")).toBe("backlog");
    expect(statusForRemoteReconcile(open, "canceled")).toBe("backlog");
  });

  it("falls back to the action when the provider gave no state", () => {
    expect(statusForRemoteReconcile(base, "todo")).toBeNull();
    expect(statusForRemoteReconcile({ ...base, action: "closed" }, "todo")).toBe("done");
    expect(statusForRemoteReconcile({ ...base, action: "closed" }, "canceled")).toBeNull();
    expect(statusForRemoteReconcile({ ...base, action: "reopen" }, "done")).toBe("backlog");
  });

  it("boucle d'écho : l'aller-retour d'une fermeture s'arrête au premier retour", () => {
    // minddy passes the ticket as done → issue-push closes the issue → GitHub returns
    // `issues.closed`. The ticket is already done: nothing more to write, therefore no more
    // nothing to push back. The same goes for a cancellation, which also closes on the forge side.
    expect(remoteStateForStatus("done").open).toBe(false);
    expect(statusForRemoteReconcile({ ...closed, action: "closed" }, "done")).toBeNull();
    expect(
      statusForRemoteReconcile({ ...closed, action: "closed" }, "canceled"),
    ).toBeNull();
  });
});

describe("remoteStateForStatus", () => {
  it("laisse ouvert tout ce qui n'est pas clos", () => {
    for (const status of ["triage", "backlog", "todo", "in_progress", "in_review"] as const) {
      expect(remoteStateForStatus(status), status).toEqual({
        open: true,
        notPlanned: false,
      });
    }
  });

  it("distingue « fait » de « n'aura pas lieu » à la fermeture", () => {
    expect(remoteStateForStatus("done")).toEqual({ open: false, notPlanned: false });
    expect(remoteStateForStatus("canceled")).toEqual({ open: false, notPlanned: true });
    expect(remoteStateForStatus("duplicate")).toEqual({ open: false, notPlanned: true });
  });
});

describe("forgeIssueResource", () => {
  it("names the resource « repository#number » and includes the forge brand", () => {
    const resource = forgeIssueResource({
      provider: "github",
      repoFullName: "acme/app",
      number: 42,
      url: "https://github.com/acme/app/issues/42",
    });
    expect(resource?.kind).toBe("link");
    expect(resource?.file_name).toBe("acme/app#42");
    expect(resource?.url).toBe("https://github.com/acme/app/issues/42");
    // Embedded, therefore no network round trip per imported ticket.
    expect(resource?.icon_data_url).toMatch(/^data:image\/webp;base64,/);
  });

  it("falls back to the provider name when the repository is unknown", () => {
    expect(
      forgeIssueResource({
        provider: "gitlab",
        repoFullName: null,
        number: 7,
        url: "https://gitlab.com/x/-/issues/7",
      })?.file_name,
    ).toBe("GitLab #7");
  });

  it("creates nothing without a URL — a resource without a link is not one", () => {
    expect(
      forgeIssueResource({
        provider: "github",
        repoFullName: "acme/app",
        number: 42,
        url: null,
      }),
    ).toBeNull();
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
      state: "open",
      labels: [{ name: "bug" }, { name: "P1" }],
      assignees: [{ login: "octocat" }, { login: "hubot" }],
    },
    repository: { id: 987654, full_name: "acme/app" },
    sender: { login: "octocat", type: "User" },
  };

  it("reduces an issues.opened payload to the neutral form", () => {
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
      state: "open",
      labels: ["bug", "P1"],
      assigneeLogins: ["octocat", "hubot"],
    });
  });

  it("falls back to the historical `assignee` field when the list is empty", () => {
    const legacy = {
      ...opened,
      issue: { ...opened.issue, assignees: [], assignee: { login: "hubot" } },
    };
    expect(normalizeGithubIssueEvent(legacy)?.assigneeLogins).toEqual(["hubot"]);
  });

  it("survives an issue without labels or assignees", () => {
    const bare = {
      ...opened,
      issue: { number: 42, title: "t", state: "closed" },
    };
    const remote = normalizeGithubIssueEvent(bare);
    expect(remote?.labels).toEqual([]);
    expect(remote?.assigneeLogins).toEqual([]);
    expect(remote?.state).toBe("closed");
  });

  it("rejects a pull request disguised as an issue", () => {
    const asPr = {
      ...opened,
      issue: { ...opened.issue, pull_request: { url: "https://api.github.com/..." } },
    };
    expect(normalizeGithubIssueEvent(asPr)).toBeNull();
  });

  it("rejects a payload without a usable repository or number", () => {
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
      state: "closed",
    },
    // GitLab takes both to the ROOT of the hook, and names its labels `title`
    // where GitHub writes `name`.
    labels: [{ id: 1, title: "bug" }, { id: 2, title: "severity::2" }],
    assignees: [{ username: "tanuki" }],
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
      // `opened` of GitLab becomes the `open` of the neutral form.
      state: "closed",
      labels: ["bug", "severity::2"],
      assigneeLogins: ["tanuki"],
    });
  });

  it("normalise « opened » en « open » — un seul vocabulaire en aval", () => {
    expect(
      normalizeGitlabIssueEvent({
        ...closed,
        object_attributes: { ...closed.object_attributes, state: "opened" },
      })?.state,
    ).toBe("open");
  });

  it("falls back to labels from object_attributes when the root has none", () => {
    const { labels: _root, ...withoutRootLabels } = closed;
    expect(
      normalizeGitlabIssueEvent({
        ...withoutRootLabels,
        object_attributes: {
          ...closed.object_attributes,
          labels: [{ title: "documentation" }],
        },
      })?.labels,
    ).toEqual(["documentation"]);
  });

  it("rejects a confidential issue", () => {
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

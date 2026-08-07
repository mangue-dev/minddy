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
    // C'est ce qui rattrape une fermeture dont le webhook s'est perdu : un
    // `edited` qui arrive après elle porte quand même `state: closed`.
    expect(statusForRemoteReconcile(closed, "in_progress")).toBe("done");
  });

  it("NE REQUALIFIE PAS un ticket déjà clos autrement — le piège du canceled", () => {
    // Les trois valent « fermé » côté forge : tant qu'elle dit fermé, elle ne
    // dit rien de plus que ce que minddy sait déjà.
    expect(statusForRemoteReconcile(closed, "canceled")).toBeNull();
    expect(statusForRemoteReconcile(closed, "duplicate")).toBeNull();
    expect(statusForRemoteReconcile(closed, "done")).toBeNull();
  });

  it("ne touche à rien quand les deux côtés s'accordent sur « ouvert »", () => {
    // Sinon toute édition d'une issue ouverte ramènerait à backlog un ticket
    // qu'on venait de passer en in_progress dans minddy.
    for (const status of ["triage", "backlog", "todo", "in_progress", "in_review"] as const) {
      expect(statusForRemoteReconcile(open, status), status).toBeNull();
    }
  });

  it("rouvre en backlog un ticket clos que la forge a rouvert", () => {
    expect(statusForRemoteReconcile(open, "done")).toBe("backlog");
    expect(statusForRemoteReconcile(open, "canceled")).toBe("backlog");
  });

  it("retombe sur l'action quand le provider n'a pas donné d'état", () => {
    expect(statusForRemoteReconcile(base, "todo")).toBeNull();
    expect(statusForRemoteReconcile({ ...base, action: "closed" }, "todo")).toBe("done");
    expect(statusForRemoteReconcile({ ...base, action: "closed" }, "canceled")).toBeNull();
    expect(statusForRemoteReconcile({ ...base, action: "reopen" }, "done")).toBe("backlog");
  });

  it("boucle d'écho : l'aller-retour d'une fermeture s'arrête au premier retour", () => {
    // minddy passe le ticket en done → issue-push ferme l'issue → GitHub renvoie
    // `issues.closed`. Le ticket est déjà done : plus rien à écrire, donc plus
    // rien à repousser. Idem pour une annulation, qui ferme aussi côté forge.
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
  it("nomme la ressource « dépôt#numéro » et embarque la marque de la forge", () => {
    const resource = forgeIssueResource({
      provider: "github",
      repoFullName: "acme/app",
      number: 42,
      url: "https://github.com/acme/app/issues/42",
    });
    expect(resource?.kind).toBe("link");
    expect(resource?.file_name).toBe("acme/app#42");
    expect(resource?.url).toBe("https://github.com/acme/app/issues/42");
    // Embarquée, donc aucun aller-retour réseau par ticket importé.
    expect(resource?.icon_data_url).toMatch(/^data:image\/webp;base64,/);
  });

  it("retombe sur le nom du provider quand le dépôt est inconnu", () => {
    expect(
      forgeIssueResource({
        provider: "gitlab",
        repoFullName: null,
        number: 7,
        url: "https://gitlab.com/x/-/issues/7",
      })?.file_name,
    ).toBe("GitLab #7");
  });

  it("ne fabrique rien sans URL — une ressource sans lien n'en est pas une", () => {
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
      state: "open",
      labels: ["bug", "P1"],
      assigneeLogins: ["octocat", "hubot"],
    });
  });

  it("retombe sur le champ historique `assignee` quand la liste est vide", () => {
    const legacy = {
      ...opened,
      issue: { ...opened.issue, assignees: [], assignee: { login: "hubot" } },
    };
    expect(normalizeGithubIssueEvent(legacy)?.assigneeLogins).toEqual(["hubot"]);
  });

  it("survit à une issue sans labels ni assignés", () => {
    const bare = {
      ...opened,
      issue: { number: 42, title: "t", state: "closed" },
    };
    const remote = normalizeGithubIssueEvent(bare);
    expect(remote?.labels).toEqual([]);
    expect(remote?.assigneeLogins).toEqual([]);
    expect(remote?.state).toBe("closed");
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
      state: "closed",
    },
    // GitLab porte les deux à la RACINE du hook, et nomme ses labels `title`
    // là où GitHub écrit `name`.
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
      // `opened` de GitLab devient l'`open` de la forme neutre.
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

  it("retombe sur les labels d'object_attributes si la racine n'en porte pas", () => {
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

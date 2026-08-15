import { describe, expect, it } from "vitest";

import {
  RUN_LOG_REPORT_LINES,
  formatDiagnosticReport,
  pruneRunLogs,
  readRunLogHeader,
  runLogFileName,
  runLogHeader,
  runLogRedactor,
  tagRunLogChunk,
  tailLines,
  type RunLogFacts,
} from "./run-log";

const FACTS: RunLogFacts = {
  runId: "5f1c2a90-0000-4000-8000-abcdefabcdef",
  appVersion: "0.9.4",
  bundleVersion: "sha256:3f9a",
  opencodeVersion: "1.18.16",
  repoPath: "/Users/dev/Projets/minddy",
};

const AT = new Date("2026-08-15T09:12:33.123Z");

describe("le nom d'un journal de run", () => {
  it("porte la date en tête, donc l'ordre alphabétique est l'ordre du temps", () => {
    const earlier = runLogFileName("r-1", new Date("2026-08-15T09:12:33.123Z"));
    const later = runLogFileName("r-2", new Date("2026-08-15T09:12:34.000Z"));
    // C'est CE tri que la rotation utilise : sans lui, elle lirait des `mtime`,
    // qu'une sauvegarde ou un `rsync` réécrit.
    expect([later, earlier].sort()).toEqual([earlier, later]);
  });

  it("ne laisse dans le nom que des caractères sûrs", () => {
    const name = runLogFileName("../../etc/Passwd:1", AT);
    expect(name).toBe("2026-08-15T09-12-33-123Z-run-etc-passwd-1.log");
    expect(name).not.toContain("/");
    expect(name).not.toContain(":");
  });

  it("reste un nom même sur un identifiant vide", () => {
    expect(runLogFileName("", AT)).toBe("2026-08-15T09-12-33-123Z-run-unknown.log");
  });
});

describe("l'en-tête d'un journal", () => {
  it("fait l'aller-retour", () => {
    const header = readRunLogHeader(runLogHeader(FACTS, AT));
    expect(header).toEqual({
      runId: FACTS.runId,
      started: "2026-08-15T09:12:33.123Z",
      appVersion: "0.9.4",
      bundleVersion: "sha256:3f9a",
      opencodeVersion: "1.18.16",
      repoPath: "/Users/dev/Projets/minddy",
    });
  });

  it("s'arrête à la ligne vide et ignore la sortie qui suit", () => {
    const text = `${runLogHeader(FACTS, AT)}[out] repoPath: /tmp/piege\n[err] boom\n`;
    expect(readRunLogHeader(text).repoPath).toBe("/Users/dev/Projets/minddy");
  });

  it("ne lève pas sur un journal tronqué par un arrêt brutal", () => {
    expect(readRunLogHeader("minddy run log\nrunId: r-9\nappVer")).toEqual({ runId: "r-9" });
    expect(readRunLogHeader("")).toEqual({});
  });
});

describe("la rotation", () => {
  const file = (name: string, bytes = 10) => ({ name, bytes });

  it("coupe par le nombre, en gardant les plus récents", () => {
    const names = ["2026-08-11.log", "2026-08-12.log", "2026-08-13.log", "2026-08-14.log"].map((n) =>
      file(n),
    );
    expect(pruneRunLogs(names, { maxFiles: 2 })).toEqual(["2026-08-12.log", "2026-08-11.log"]);
  });

  it("coupe par les octets", () => {
    const names = [file("2026-08-14.log", 600), file("2026-08-13.log", 600), file("2026-08-12.log", 600)];
    expect(pruneRunLogs(names, { maxBytes: 1_000 })).toEqual(["2026-08-13.log", "2026-08-12.log"]);
  });

  it("garde TOUJOURS le plus récent, même seul au-dessus du plafond", () => {
    // Le tour qui déraille et crache 200 Mo est exactement celui qu'on veut
    // lire : une rotation qui le supprime laisse un dossier propre et rien à
    // envoyer au support.
    const names = [file("2026-08-14.log", 200_000_000), file("2026-08-13.log", 10)];
    expect(pruneRunLogs(names, { maxBytes: 1_000 })).toEqual(["2026-08-13.log"]);
  });

  it("ne touche à rien d'autre que des `.log`", () => {
    const names = [file("channel.json", 40), file("2026-08-14.log", 10)];
    expect(pruneRunLogs(names, { maxFiles: 0 })).toEqual([]);
  });

  it("ne supprime rien quand les deux plafonds tiennent", () => {
    expect(pruneRunLogs([file("2026-08-14.log", 10)])).toEqual([]);
  });
});

describe("la queue d'un journal", () => {
  it("rend les dernières lignes, sans compter la fin de ligne finale", () => {
    expect(tailLines("un\ndeux\ntrois\n", 2)).toBe("deux\ntrois");
  });

  it("rend tout quand le texte est plus court que demandé", () => {
    expect(tailLines("un\ndeux\n", 50)).toBe("un\ndeux");
  });

  it("rend une chaîne vide plutôt que de lever", () => {
    expect(tailLines("", 10)).toBe("");
    expect(tailLines("un\n", 0)).toBe("");
  });
});

describe("le marquage des morceaux de sortie", () => {
  it("nomme la source de chaque ligne", () => {
    expect(tagRunLogChunk("bundle ok\nopencode ok", "out")).toBe("[out] bundle ok\n[out] opencode ok");
    expect(tagRunLogChunk("EACCES", "err")).toBe("[err] EACCES");
  });

  it("laisse une ligne vide vide", () => {
    expect(tagRunLogChunk("a\n\nb", "out")).toBe("[out] a\n\n[out] b");
  });
});

describe("la substitution des secrets", () => {
  it("retire le jeton d'exécution locale de ce qui part sur le disque", () => {
    const token = "mdyx_9f3a7c21b5e84d06aa";
    const redact = runLogRedactor([token, null, undefined]);
    expect(redact(`[err] 403 authorization=Bearer ${token}`)).toBe(
      "[err] 403 authorization=Bearer [redacted]",
    );
  });

  it("ignore ce qui est trop court pour être un secret", () => {
    // Substituer « dev » barbouillerait tout le journal de `[redacted]`.
    const redact = runLogRedactor(["dev"]);
    expect(redact("/Users/dev/Projets")).toBe("/Users/dev/Projets");
  });
});

describe("le rapport de diagnostic", () => {
  const base = {
    appVersion: "0.9.4",
    opencodeVersion: "1.18.16",
    platform: "darwin 25.5.0",
    generatedAt: AT,
    logDir: "/Users/dev/Library/Application Support/minddy/agent-logs",
    logCount: 3,
  };

  it("porte les cinq faits que le support demandera", () => {
    const report = formatDiagnosticReport({
      ...base,
      lastRun: {
        fileName: runLogFileName(FACTS.runId, AT),
        header: readRunLogHeader(runLogHeader(FACTS, AT)),
        tail: "[err] boom",
      },
    });

    expect(report).toContain("**App:** 0.9.4");
    expect(report).toContain("**Harness bundle:** sha256:3f9a");
    expect(report).toContain("**opencode:** 1.18.16");
    expect(report).toContain("**Repository:** /Users/dev/Projets/minddy");
    expect(report).toContain("[err] boom");
    expect(report).toContain(`Last ${RUN_LOG_REPORT_LINES} lines`);
  });

  it("dit qu'aucun tour n'a joué plutôt que de rendre un rapport vide", () => {
    // « la machine n'a jamais reçu de run » et « le run a échoué au démarrage »
    // sont deux tickets de support différents.
    const report = formatDiagnosticReport({ ...base, logCount: 0, lastRun: null });
    expect(report).toContain("No agent run has ever started on this machine");
    expect(report).toContain("**Harness bundle:** —");
    expect(report).toContain("**Repository:** —");
  });
});

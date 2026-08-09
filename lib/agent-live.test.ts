import { describe, expect, it } from "vitest";

import { liveAfterEvent, liveFromStream, type AgentRunLive } from "./agent-live";

/**
 * La moitié CLIENT du direct : ce que le fil garde, ce qu'il efface, et quand.
 *
 * Les deux règles qui comptent tiennent ensemble une seule promesse — le bloc
 * « fichiers changés » apparaît à la première édition et reste jusqu'à ce que la
 * liste de git le remplace, une fois, sans doublon.
 */

const T0 = "2026-08-09T12:00:00.000Z";
const now = () => T0;

function withFiles(paths: string[]): AgentRunLive {
  return liveFromStream(
    null,
    { files: paths.map((path) => ({ path, status: "modified" })) },
    now,
  )!;
}

describe("liveFromStream", () => {
  it("compte les FICHIERS comme un signe de vie", () => {
    // Une édition n'écrit ni texte ni tool-call de plus : la charge qui la porte
    // est celle d'un round au repos. Sans ce test, elle se lisait comme un envoi à
    // vide et effaçait la queue vivante au lieu de l'ouvrir.
    const live = liveFromStream(null, {
      files: [{ path: "lib/a.ts", status: "deleted" }],
      filesTruncated: true,
    }, now);
    expect(live).toEqual({
      text: "",
      tools: 0,
      reasoningActive: false,
      reasoningMs: 0,
      files: [{ path: "lib/a.ts", status: "deleted", additions: 0, deletions: 0 }],
      filesTruncated: true,
      startedAt: T0,
    });
  });

  it("efface tout sur une charge VRAIMENT vide — c'est la purge du relais", () => {
    expect(liveFromStream(withFiles(["a.ts"]), { text: "" }, now)).toBeNull();
  });

  it("ne fusionne pas : la charge fait foi, y compris sur les fichiers", () => {
    // Le serveur renvoie la liste entière à chaque charge. Fusionner ferait
    // survivre un fichier que le tour a cessé de compter.
    const next = liveFromStream(withFiles(["a.ts", "b.ts"]), {
      text: "je continue",
      files: [{ path: "b.ts", status: "modified" }],
    }, now);
    expect(next?.files.map((f) => f.path)).toEqual(["b.ts"]);
  });

  it("garde le chrono du PREMIER signe de vie du round", () => {
    const next = liveFromStream(withFiles(["a.ts"]), { text: "suite" }, () => "2026-08-09T13:00:00.000Z");
    expect(next?.startedAt).toBe(T0);
  });
});

describe("liveAfterEvent", () => {
  it("efface le texte provisoire dès qu'un event est posé", () => {
    const next = liveAfterEvent(liveFromStream(null, { text: "brouillon" }, now), "summary");
    expect(next).toBeNull();
  });

  it("GARDE les fichiers sous un `tool_call` — la phase d'outils est celle où on les veut", () => {
    const next = liveAfterEvent(withFiles(["a.ts"]), "tool_call");
    expect(next?.files.map((f) => f.path)).toEqual(["a.ts"]);
    expect(next?.text).toBe("");
    expect(next?.tools).toBe(0);
  });

  it("les LÂCHE sur `files_changed` : l'autorité est arrivée", () => {
    // Le passage de relais se décide ici, et pas sur une charge de purge : quand la
    // boucle tourne dans la microVM, l'event est posé après que le tour a rendu son
    // rapport et personne ne diffuse plus rien. Les deux listes se superposaient
    // jusqu'à la fin du run — la même, deux fois, l'une sans ses compteurs.
    expect(liveAfterEvent(withFiles(["a.ts"]), "files_changed")).toBeNull();
  });
});

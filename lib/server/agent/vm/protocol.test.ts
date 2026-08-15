import { describe, expect, it } from "vitest";

import { cloudLayout, layoutForRoot } from "../harness-layout";
import { parseVmJob, vmBundlePath, vmJobPath, VM_PROTOCOL_VERSION } from "./protocol";

/**
 * MIN-354 — LE CONTRAT ENTRE LA FONCTION ET LE HARNESS, ET SON NUMÉRO.
 *
 * Ce que ce fichier garde n'existait pas avant : jusqu'ici le harness était
 * ÉCRIT par le déploiement qui le lançait, à chaque tour, donc le job et le
 * bundle ne pouvaient pas être d'âges différents. Ils le peuvent dès que le
 * bundle est téléchargé puis MIS EN CACHE sur une machine.
 *
 * Un bundle d'hier qui lit un job d'aujourd'hui ne lève pas : JSON.parse réussit,
 * les champs connus sont lus, les autres ignorés — et le tour part avec les
 * anciens chemins. Sur ce lot précisément : il écrirait dans `/vercel/sandbox`
 * sur un Mac, c'est-à-dire nulle part. Le refus explicite est la seule forme qui
 * transforme ce silence en quelque chose qu'on voit.
 */

const job = (over: Record<string, unknown> = {}) => ({
  protocolVersion: VM_PROTOCOL_VERSION,
  layout: cloudLayout(),
  runId: "r-1",
  workBranch: "minddy/agent-1",
  appOrigin: "https://minddy.example",
  ...over,
});

describe("parseVmJob", () => {
  it("laisse passer un job de la bonne version", () => {
    expect(parseVmJob(job()).runId).toBe("r-1");
  });

  it("REFUSE une version qu'il ne connaît pas, et dit laquelle il parle", () => {
    // Le cas réel : un harness en cache, plus vieux que la fonction qui le lance.
    expect(() => parseVmJob(job({ protocolVersion: VM_PROTOCOL_VERSION + 1 }))).toThrow(
      new RegExp(`unsupported protocol version.+${VM_PROTOCOL_VERSION}`, "s"),
    );
  });

  it("REFUSE un job sans version — c'est la forme d'avant le contrat", () => {
    expect(() => parseVmJob(job({ protocolVersion: undefined }))).toThrow(/protocol version/i);
  });

  it("refuse un job sans layout plutôt que de retomber sur `/vercel`", () => {
    // Un repli silencieux serait exactement la tolérance que la version existe
    // pour supprimer : le tour tournerait, ailleurs que là où on croit.
    expect(() => parseVmJob(job({ layout: undefined }))).toThrow(/layout/i);
  });

  it("refuse un layout que les garde-fous ne sauraient pas tenir", () => {
    const broken = { ...cloudLayout(), repoDir: "repo" };
    expect(() => parseVmJob(job({ layout: broken }))).toThrow(/absolute/i);
  });

  it("refuse ce qui n'est pas un objet", () => {
    expect(() => parseVmJob(null)).toThrow(/object/i);
    expect(() => parseVmJob("{}")).toThrow();
  });
});

describe("les chemins du harness", () => {
  it("suivent le layout du run", () => {
    const layout = layoutForRoot("/work/r-7", "/opt/oc");
    expect(vmBundlePath(layout)).toBe("/work/r-7/harness/main.js");
    expect(vmJobPath(layout)).toBe("/work/r-7/harness/job.json");
  });

  it("valent, dans le cloud, ce qu'ils ont toujours valu", () => {
    expect(vmBundlePath(cloudLayout())).toBe("/vercel/sandbox/harness/main.js");
    expect(vmJobPath(cloudLayout())).toBe("/vercel/sandbox/harness/job.json");
  });
});

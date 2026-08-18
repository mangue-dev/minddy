import { describe, expect, it } from "vitest";

import {
  HARNESS_MAX_BYTES,
  bundleDecision,
  harnessBundleFileName,
  harnessRefusalMessage,
  parseHarnessManifest,
  staleBundles,
  verifyBeforeFork,
  verifyDownload,
  type HarnessManifest,
} from "./harness-bundle";

/**
 * MIN-293 — WHAT DECIDES WHETHER TO EXECUTE THE HARNESS.
 *
 * The file kept here is the only code not signed by Apple that the app launches, and
 * it lives in a folder writable by the model. The cases that count do
 * are therefore not the passing cases: they are those where something does not match
 *, and where you have to refuse rather than try again.
 */

const SHA = "a".repeat(64);
const OTHER = "b".repeat(64);

function manifest(over: Partial<HarnessManifest> = {}): HarnessManifest {
  return { protocolVersion: 2, opencodeVersion: "1.18.16", sha256: SHA, bytes: 1000, ...over };
}

describe("parseHarnessManifest", () => {
  it("accepte un manifeste complet", () => {
    expect(parseHarnessManifest({ ...manifest() })).toEqual(manifest());
  });

  it("refuse tout ce qui n'est pas une empreinte sha256 en hexadécimal minuscule", () => {
    // A value that is not comparable to a hash should not be compared:
    // the resulting refusal would say “the harness has been modified”, which is
    // false and sends to search in the wrong place.
    for (const sha256 of [SHA.toUpperCase(), SHA.slice(0, 63), `${SHA}0`, "", "zz"]) {
      expect(parseHarnessManifest({ ...manifest(), sha256 })).toBeNull();
    }
  });

  it("refuse une taille absente, nulle, fractionnaire ou démesurée", () => {
    for (const bytes of [0, -1, 1.5, HARNESS_MAX_BYTES + 1, "1000"]) {
      expect(parseHarnessManifest({ ...manifest(), bytes })).toBeNull();
    }
  });

  it("refuse une version de protocole qui n'est pas un entier", () => {
    for (const protocolVersion of ["2", 2.5, null, undefined]) {
      expect(parseHarnessManifest({ ...manifest(), protocolVersion })).toBeNull();
    }
  });

  it("refuse une page HTML, une chaîne, un tableau — ce que rend un portail captif", () => {
    expect(parseHarnessManifest("<!doctype html>")).toBeNull();
    expect(parseHarnessManifest(null)).toBeNull();
    expect(parseHarnessManifest([manifest()])).toBeNull();
  });
});

describe("bundleDecision", () => {
  it("réutilise quand l'empreinte ET la taille du fichier du disque coïncident", () => {
    expect(bundleDecision(manifest(), { sha256: SHA, bytes: 1000 }, 2)).toEqual({
      action: "reuse",
    });
  });

  it("retélécharge quand rien n'est en cache", () => {
    expect(bundleDecision(manifest(), null, 2)).toEqual({ action: "download" });
  });

  it("retélécharge quand le fichier du disque a une autre empreinte", () => {
    // This is NOT a refusal: this is the ordinary case of a new deployment. THE
    // refusal, arrives at the pre-fork check, on a file that we have just
    // to write and verify.
    expect(bundleDecision(manifest(), { sha256: OTHER, bytes: 1000 }, 2)).toEqual({
      action: "download",
    });
  });

  it("retélécharge quand la taille diffère à empreinte égale — un cache tronqué", () => {
    expect(bundleDecision(manifest(), { sha256: SHA, bytes: 999 }, 2)).toEqual({
      action: "download",
    });
  });

  it("REFUSE un protocole que cette app ne connaît pas, avant tout téléchargement", () => {
    // The harness would also refuse it (`parseVmJob`), but after the fork: at this
    // at that point there is only one newspaper left to talk about it.
    expect(bundleDecision(manifest({ protocolVersion: 3 }), null, 2)).toEqual({
      action: "refuse",
      reason: "protocol_mismatch",
    });
  });
});

describe("verifyDownload", () => {
  it("laisse passer ce qui correspond", () => {
    expect(verifyDownload({ sha256: SHA, bytes: 1000 }, manifest())).toEqual({ ok: true });
  });

  it("distingue une réponse TRONQUÉE d'une empreinte qui diverge", () => {
    // The diagnosis is not the same, and the sentence that the user will read is not
    // more: a wifi that fails should not read “the harness has been modified”.
    expect(verifyDownload({ sha256: OTHER, bytes: 12 }, manifest())).toEqual({
      ok: false,
      reason: "download_failed",
    });
    expect(verifyDownload({ sha256: OTHER, bytes: 1000 }, manifest())).toEqual({
      ok: false,
      reason: "fingerprint_mismatch",
    });
  });
});

describe("verifyBeforeFork", () => {
  it("laisse forker ce qui correspond encore", () => {
    expect(verifyBeforeFork({ sha256: SHA, bytes: 1000 }, manifest())).toEqual({ ok: true });
  });

  it("refuse un fichier RÉÉCRIT entre le téléchargement et le fork", () => {
    // The case for which this control exists: the bundle lives under `userData`, the
    // model written there under the same UID, and a turn can rewrite the harness of the
    // next round to capture the lease, key and `authUrl`.
    expect(verifyBeforeFork({ sha256: OTHER, bytes: 1000 }, manifest())).toEqual({
      ok: false,
      reason: "fingerprint_mismatch",
    });
  });

  it("refuse un fichier disparu", () => {
    expect(verifyBeforeFork(null, manifest())).toEqual({
      ok: false,
      reason: "download_failed",
    });
  });

  it("refuse aussi sur la seule taille — une troncature n'est pas moins grave ici", () => {
    expect(verifyBeforeFork({ sha256: SHA, bytes: 4 }, manifest())).toEqual({
      ok: false,
      reason: "fingerprint_mismatch",
    });
  });
});

describe("le rangement des bundles", () => {
  it("nomme le fichier par son empreinte", () => {
    expect(harnessBundleFileName(SHA)).toBe(`main-${"a".repeat(32)}.js`);
  });

  it("ne supprime que des bundles, et jamais celui qu'on garde", () => {
    const keep = harnessBundleFileName(SHA);
    const files = [keep, harnessBundleFileName(OTHER), "job.json", "notes.txt", "main-zz.js"];
    expect(staleBundles(files, keep)).toEqual([harnessBundleFileName(OTHER)]);
  });

  it("ne supprime rien quand le dossier ne contient que le bundle courant", () => {
    const keep = harnessBundleFileName(SHA);
    expect(staleBundles([keep], keep)).toEqual([]);
  });
});

describe("ce que l'utilisateur lit dans son rapport", () => {
  it("nomme l'origine dans chaque refus — c'est la moitié du diagnostic", () => {
    const reasons = [
      "manifest_unreachable",
      "manifest_invalid",
      "protocol_mismatch",
      "download_failed",
      "fingerprint_mismatch",
    ] as const;
    for (const reason of reasons) {
      const message = harnessRefusalMessage(reason, "https://preview.minddy.app");
      expect(message).toContain("https://preview.minddy.app");
      expect(message.length).toBeGreaterThan(30);
    }
  });
});

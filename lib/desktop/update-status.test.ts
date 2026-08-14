import { describe, expect, it } from "vitest";
import {
  IDLE_UPDATE_STATUS,
  reduceUpdateStatus,
  type DesktopUpdateStatus,
} from "./update-status";

const READY: DesktopUpdateStatus = { state: "ready", version: "0.9.5" };

describe("reduceUpdateStatus", () => {
  it("annonce le téléchargement dès qu'une version est détectée", () => {
    expect(
      reduceUpdateStatus(IDLE_UPDATE_STATUS, { kind: "available", version: "0.9.5" })
    ).toEqual({ state: "downloading", version: "0.9.5" });
  });

  it("passe à prêt quand elle est sur le disque", () => {
    expect(
      reduceUpdateStatus(
        { state: "downloading", version: "0.9.5" },
        { kind: "downloaded", version: "0.9.5" }
      )
    ).toEqual(READY);
  });

  it("ne fait pas retomber en téléchargement une version déjà prête", () => {
    // La vérification des six heures réannonce ce qu'elle trouve, téléchargé ou
    // non. Sans cette garde la ligne repassait en « téléchargement… » sans plus
    // jamais en sortir.
    expect(reduceUpdateStatus(READY, { kind: "available", version: "0.9.5" })).toBe(
      READY
    );
  });

  it("suit en revanche une version ENCORE plus neuve", () => {
    expect(
      reduceUpdateStatus(READY, { kind: "available", version: "0.9.6" })
    ).toEqual({ state: "downloading", version: "0.9.6" });
  });

  it("garde ce qui est prêt quand la vérification suivante échoue", () => {
    // Le fichier est sur le disque : un réseau coupé ne l'en retire pas, et
    // retirer la ligne effacerait le seul moyen d'installer.
    expect(reduceUpdateStatus(READY, { kind: "error" })).toBe(READY);
  });

  it("revient au silence si l'erreur tombe pendant le téléchargement", () => {
    expect(
      reduceUpdateStatus({ state: "downloading", version: "0.9.5" }, { kind: "error" })
    ).toEqual(IDLE_UPDATE_STATUS);
  });
});

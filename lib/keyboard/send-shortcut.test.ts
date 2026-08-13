import { describe, expect, it } from "vitest";
import {
  DEFAULT_SEND_MODE,
  SEND_MODE_META_KEY,
  isSendShortcut,
  resolveSendMode,
} from "@/lib/keyboard/send-shortcut";

type Ev = Parameters<typeof isSendShortcut>[0];

const ev = (over: Partial<Ev> = {}): Ev => ({
  key: "Enter",
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...over,
});

describe("isSendShortcut", () => {
  describe("mode ⌘/Ctrl + Entrée (le défaut)", () => {
    it("envoie sur ⌘Entrée comme sur Ctrl+Entrée", () => {
      expect(isSendShortcut(ev({ metaKey: true }))).toBe(true);
      expect(isSendShortcut(ev({ ctrlKey: true }))).toBe(true);
    });

    it("laisse Entrée seule passer à la ligne", () => {
      expect(isSendShortcut(ev())).toBe(false);
    });

    it("ignore une autre touche, modifiée ou non", () => {
      expect(isSendShortcut(ev({ key: "k", metaKey: true }))).toBe(false);
      expect(isSendShortcut(ev({ key: "a" }))).toBe(false);
    });
  });

  describe("mode Entrée", () => {
    it("envoie sur Entrée nue", () => {
      expect(isSendShortcut(ev(), "enter")).toBe(true);
    });

    it("envoie AUSSI sur ⌘/Ctrl+Entrée — le réglage ajoute une touche", () => {
      expect(isSendShortcut(ev({ metaKey: true }), "enter")).toBe(true);
      expect(isSendShortcut(ev({ ctrlKey: true }), "enter")).toBe(true);
    });

    it("laisse ⌥Entrée à l'éditeur", () => {
      expect(isSendShortcut(ev({ altKey: true }), "enter")).toBe(false);
    });
  });

  // Le contrat qui tient les deux modes : c'est la touche du saut de ligne, et
  // c'est la seule qui reste quand l'envoi est passé sur Entrée.
  it("n'envoie JAMAIS sur Maj+Entrée, dans aucun mode", () => {
    expect(isSendShortcut(ev({ shiftKey: true }))).toBe(false);
    expect(isSendShortcut(ev({ shiftKey: true }), "enter")).toBe(false);
    expect(isSendShortcut(ev({ shiftKey: true, metaKey: true }))).toBe(false);
    expect(isSendShortcut(ev({ shiftKey: true, ctrlKey: true }), "enter")).toBe(
      false,
    );
  });

  it("tolère un événement sans shiftKey/altKey (objets de test, événements natifs partiels)", () => {
    expect(isSendShortcut({ key: "Enter", metaKey: true, ctrlKey: false })).toBe(
      true,
    );
  });
});

describe("resolveSendMode", () => {
  it("retombe sur le mode historique sans métadonnée", () => {
    expect(resolveSendMode(undefined)).toBe(DEFAULT_SEND_MODE);
    expect(resolveSendMode(null)).toBe(DEFAULT_SEND_MODE);
    expect(resolveSendMode({})).toBe(DEFAULT_SEND_MODE);
  });

  it("lit le mode choisi", () => {
    expect(resolveSendMode({ [SEND_MODE_META_KEY]: "enter" })).toBe("enter");
    expect(resolveSendMode({ [SEND_MODE_META_KEY]: "mod-enter" })).toBe(
      "mod-enter",
    );
  });

  it("ignore une valeur qui n'est pas un mode", () => {
    expect(resolveSendMode({ [SEND_MODE_META_KEY]: "shift-enter" })).toBe(
      DEFAULT_SEND_MODE,
    );
    expect(resolveSendMode({ [SEND_MODE_META_KEY]: true })).toBe(
      DEFAULT_SEND_MODE,
    );
  });
});

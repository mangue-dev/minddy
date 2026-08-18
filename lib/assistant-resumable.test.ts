import { describe, expect, it } from "vitest";
import {
  hasResumableConversation,
  type ResumableConversationInput,
} from "./assistant-resumable";

const CONV = "cccccccc-0000-4000-8000-000000000003";

/** Rien nulle part : l'accueil au premier chargement d'un compte neuf. */
const EMPTY: ResumableConversationInput = {
  conversationId: null,
  messageCount: 0,
  busy: false,
  probedConversationId: null,
  restored: false,
};

describe("hasResumableConversation", () => {
  it("n'a rien à reprendre quand rien ne vit et que le pointeur est vide", () => {
    expect(hasResumableConversation(EMPTY)).toBe(false);
  });

  it("reconnaît la conversation vivante du provider", () => {
    expect(
      hasResumableConversation({ ...EMPTY, conversationId: CONV }),
    ).toBe(true);
  });

  it("compte l'envoi qui n'a pas encore son id de conversation", () => {
    // A message from the reception is on the screen well before the server
    // named the thread: the FAB must already bring it back to it.
    expect(hasResumableConversation({ ...EMPTY, messageCount: 1 })).toBe(true);
  });

  it("compte le tour en cours, même sans message rendu", () => {
    expect(hasResumableConversation({ ...EMPTY, busy: true })).toBe(true);
  });

  it("suit le pointeur relu au chargement, avant toute ouverture du panneau", () => {
    // Yesterday's thread: the resumption of the panel did not take place, only this
    // lecture peut dire qu'il existe.
    expect(
      hasResumableConversation({ ...EMPTY, probedConversationId: CONV }),
    ).toBe(true);
  });

  it("cesse de croire le pointeur une fois le panneau repris", () => {
    // “New conversation” deletes the live thread and the base pointer;
    // the reading made when loading, says the old man again.
    expect(
      hasResumableConversation({
        ...EMPTY,
        probedConversationId: CONV,
        restored: true,
      }),
    ).toBe(false);
  });

  it("garde la conversation vivante après la reprise", () => {
    expect(
      hasResumableConversation({
        ...EMPTY,
        conversationId: CONV,
        probedConversationId: null,
        restored: true,
      }),
    ).toBe(true);
  });
});

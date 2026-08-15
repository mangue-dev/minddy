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
    // Un message parti de l'accueil est à l'écran bien avant que le serveur
    // ait nommé le fil : le FAB doit déjà ramener dessus.
    expect(hasResumableConversation({ ...EMPTY, messageCount: 1 })).toBe(true);
  });

  it("compte le tour en cours, même sans message rendu", () => {
    expect(hasResumableConversation({ ...EMPTY, busy: true })).toBe(true);
  });

  it("suit le pointeur relu au chargement, avant toute ouverture du panneau", () => {
    // Le fil d'hier : la reprise du panneau n'a pas eu lieu, seule cette
    // lecture peut dire qu'il existe.
    expect(
      hasResumableConversation({ ...EMPTY, probedConversationId: CONV }),
    ).toBe(true);
  });

  it("cesse de croire le pointeur une fois le panneau repris", () => {
    // « Nouvelle conversation » efface le fil vivant et le pointeur en base ;
    // la lecture faite au chargement, elle, dit encore l'ancien.
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

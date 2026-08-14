import { describe, expect, it } from "vitest";
import { resolveAssistantScope } from "./assistant-scope";

const PROJECT_A = "aaaaaaaa-0000-4000-8000-000000000001";
const PROJECT_B = "bbbbbbbb-0000-4000-8000-000000000002";
const CONV = "cccccccc-0000-4000-8000-000000000003";

describe("resolveAssistantScope", () => {
  describe("sans conversation vivante", () => {
    it("suit le projet de la route", () => {
      expect(
        resolveAssistantScope({
          conversationId: null,
          conversationProjectId: null,
          routeProjectId: PROJECT_A,
        }),
      ).toEqual({ scopeProjectId: PROJECT_A, startsNewConversation: false });
    });

    it("est globale hors d'un projet", () => {
      expect(
        resolveAssistantScope({
          conversationId: null,
          conversationProjectId: null,
          routeProjectId: null,
        }).scopeProjectId,
      ).toBeNull();
    });

    it("obéit à la portée imposée par l'ouverture", () => {
      expect(
        resolveAssistantScope({
          conversationId: null,
          conversationProjectId: null,
          routeProjectId: PROJECT_A,
          overrideProjectId: PROJECT_B,
        }).scopeProjectId,
      ).toBe(PROJECT_B);
    });

    it("distingue « pas d'override » d'un override global explicite", () => {
      expect(
        resolveAssistantScope({
          conversationId: null,
          conversationProjectId: null,
          routeProjectId: PROJECT_A,
          overrideProjectId: null,
        }).scopeProjectId,
      ).toBeNull();
    });
  });

  describe("avec une conversation vivante", () => {
    // Le cœur de MIN-353 : la conversation garde SA portée quoi qu'il arrive à
    // l'URL. C'est ce qui l'empêche d'être jetée à la première navigation.
    it("ignore la route qui change (le bug d'origine)", () => {
      expect(
        resolveAssistantScope({
          conversationId: CONV,
          conversationProjectId: PROJECT_A,
          routeProjectId: PROJECT_B,
        }),
      ).toEqual({ scopeProjectId: PROJECT_A, startsNewConversation: false });
    });

    it("reste sur son projet en naviguant vers une page hors projet", () => {
      expect(
        resolveAssistantScope({
          conversationId: CONV,
          conversationProjectId: PROJECT_A,
          routeProjectId: null,
        }),
      ).toEqual({ scopeProjectId: PROJECT_A, startsNewConversation: false });
    });

    it("reste globale en naviguant dans un projet", () => {
      expect(
        resolveAssistantScope({
          conversationId: CONV,
          conversationProjectId: null,
          routeProjectId: PROJECT_A,
        }),
      ).toEqual({ scopeProjectId: null, startsNewConversation: false });
    });

    it("ouvre un fil neuf quand l'ouverture impose un AUTRE projet", () => {
      expect(
        resolveAssistantScope({
          conversationId: CONV,
          conversationProjectId: PROJECT_A,
          routeProjectId: PROJECT_B,
          overrideProjectId: PROJECT_B,
        }),
      ).toEqual({ scopeProjectId: PROJECT_B, startsNewConversation: true });
    });

    it("ouvre un fil neuf quand l'ouverture impose le mode global", () => {
      expect(
        resolveAssistantScope({
          conversationId: CONV,
          conversationProjectId: PROJECT_A,
          routeProjectId: PROJECT_A,
          overrideProjectId: null,
        }),
      ).toEqual({ scopeProjectId: null, startsNewConversation: true });
    });

    it("garde le fil quand l'ouverture impose SA propre portée", () => {
      expect(
        resolveAssistantScope({
          conversationId: CONV,
          conversationProjectId: PROJECT_A,
          routeProjectId: PROJECT_A,
          overrideProjectId: PROJECT_A,
        }),
      ).toEqual({ scopeProjectId: PROJECT_A, startsNewConversation: false });
    });

    // Une réponse en cours atterrit dans la conversation qui l'a demandée : la
    // portée est gelée le temps du tour. La bascule, elle, est ANNONCÉE — c'est
    // ce qui fait patienter l'envoi de l'ouverture au lieu de le mal adresser.
    it("annonce la bascule sans déplacer la portée pendant un tour", () => {
      expect(
        resolveAssistantScope({
          conversationId: CONV,
          conversationProjectId: PROJECT_A,
          routeProjectId: PROJECT_B,
          overrideProjectId: PROJECT_B,
          busy: true,
        }),
      ).toEqual({ scopeProjectId: PROJECT_A, startsNewConversation: true });
    });

    it("ne bascule pas pendant un tour si l'ouverture impose SA portée", () => {
      expect(
        resolveAssistantScope({
          conversationId: CONV,
          conversationProjectId: PROJECT_A,
          routeProjectId: PROJECT_B,
          overrideProjectId: PROJECT_A,
          busy: true,
        }),
      ).toEqual({ scopeProjectId: PROJECT_A, startsNewConversation: false });
    });

    // Une navigation n'impose rien : pendant un tour comme au repos, elle ne
    // déclenche aucune bascule.
    it("ne bascule jamais sur une simple navigation", () => {
      expect(
        resolveAssistantScope({
          conversationId: CONV,
          conversationProjectId: PROJECT_A,
          routeProjectId: PROJECT_B,
          busy: true,
        }),
      ).toEqual({ scopeProjectId: PROJECT_A, startsNewConversation: false });
    });
  });
});

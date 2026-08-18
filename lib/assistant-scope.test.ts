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
    // The heart of MIN-353: the conversation keeps ITS scope whatever happens to
    // the URL. This is what prevents it from being thrown away on first navigation.
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

    // A response in progress lands in the conversation that requested it: the
    // range is frozen for the duration of the turn. The shift is ANNOUNCED — it’s
    // which makes you wait to send the opening instead of misdirecting it.
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

    // Navigation imposes nothing: during a tour or at rest, it does not
    // trigger no toggle.
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

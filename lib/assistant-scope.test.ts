import { describe, expect, it } from "vitest";
import { resolveAssistantScope } from "./assistant-scope";

describe("conversation-independent message context", () => {
  it.each([null, "conversation"])("follows navigation without replacing %s", (conversationId) => {
    for (const routeProjectId of ["project-a", "project-b", null]) {
      expect(resolveAssistantScope({ conversationId, conversationProjectId: "project-a", routeProjectId }))
        .toEqual({ scopeProjectId: routeProjectId, startsNewConversation: false });
    }
  });

  it.each([false, true])("keeps identity when an opening changes context during busy=%s", (busy) => {
    for (const overrideProjectId of ["project-b", null]) {
      expect(resolveAssistantScope({ conversationId: "conversation", conversationProjectId: "project-a", routeProjectId: "project-a", overrideProjectId, busy }))
        .toEqual({ scopeProjectId: overrideProjectId, startsNewConversation: false });
    }
  });
});

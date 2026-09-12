/** Resolve the project attached to the next message, independently of history. */
export interface AssistantScopeInput {
  conversationId: string | null;
  /** Legacy conversation metadata; never an action target. */
  conversationProjectId: string | null;
  routeProjectId: string | null;
  overrideProjectId?: string | null;
  busy?: boolean;
}

export interface AssistantScopeResolution {
  scopeProjectId: string | null;
  startsNewConversation: boolean;
}

export function resolveAssistantScope({
  routeProjectId,
  overrideProjectId,
}: AssistantScopeInput): AssistantScopeResolution {
  return {
    scopeProjectId: overrideProjectId !== undefined ? overrideProjectId : routeProjectId,
    startsNewConversation: false,
  };
}

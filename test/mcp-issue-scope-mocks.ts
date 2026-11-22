/**
 * Derives the issue-scope helpers (MIN-952) from a test's own
 * `requireProject` and `resolveIssueRef` mocks. Inside the real
 * `lib/server/mcp/tool-helpers` module they call those two directly, which a
 * `vi.mock` of the module does not replace, so a suite that stubs the pair
 * must stub the helpers built on them too. The mocks return loose fixtures,
 * so the derived helpers are typed as loosely as they are.
 */
type Result = Record<string, unknown>;
type Loose = (...args: never[]) => unknown;

interface ScopeMocks {
  requireProject: Loose;
  resolveIssueRef: Loose;
}

export function withIssueScopeMocks<T extends ScopeMocks>(mocks: T) {
  const requireProject = mocks.requireProject as unknown as (...args: unknown[]) => Promise<Result>;
  const resolveIssueRef = mocks.resolveIssueRef as unknown as (...args: unknown[]) => Promise<Result>;
  return {
    ...mocks,
    requireProjectForIssues: (extra: unknown, projectId: unknown, _refs: unknown, capability?: unknown) =>
      requireProject(extra, projectId, capability),
    requireIssueScope: async (
      extra: unknown,
      args: { project_id?: unknown; issue: unknown },
      capability?: unknown,
    ) => {
      const scope = await requireProject(extra, args.project_id, capability);
      if ("error" in scope) return scope;
      const ref = await resolveIssueRef(scope.access, args.issue);
      if ("error" in ref) return ref;
      return { ...scope, issue: ref.issue };
    },
  };
}

import { isValidElement, Suspense, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const resolveProjectSegment = vi.fn<(segment: string) => Promise<string | null>>();
vi.mock("@/lib/server/route-refs", () => ({ resolveProjectSegment: (segment: string) => resolveProjectSegment(segment) }));
vi.mock("@/lib/server/project-meta", () => ({ projectName: async () => null }));
vi.mock("@/lib/app-metadata", () => ({ appPageMetadata: async () => ({}) }));
const notFound = vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); });
vi.mock("next/navigation", () => ({ notFound: () => notFound(), usePathname: () => "/projects/min-3f2a9c81" }));

const { default: ProjectLayout } = await import("@/app/(app)/projects/[id]/layout");
const { ProjectRouteLoading } = await import("@/components/project-route-loading");
const { ProjectRouteProvider } = await import("@/lib/project-route-context");

type Props = { children: ReactNode; params: Promise<{ id: string }> };

/** The streamed part of the layout, rendered the way the server does. */
async function resolved(segment: string) {
  const page = <main>board</main>;
  const element = ProjectLayout({ children: page, params: Promise.resolve({ id: segment }) }) as ReactElement<{ fallback: ReactNode; children: ReactElement<Props> }>;
  const inner = element.props.children;
  const render = inner.type as (props: Props) => Promise<ReactElement>;
  return { element, page, result: render(inner.props) };
}

describe("project layout (MIN-875)", () => {
  it("streams the segment read behind the page's own skeleton", async () => {
    resolveProjectSegment.mockResolvedValue("3f2a9c81-0000-4000-8000-000000000000");
    const { element } = await resolved("min-3f2a9c81");
    // Returned synchronously: nothing above the boundary waits for the read.
    expect(element.type).toBe(Suspense);
    expect(isValidElement(element.props.fallback) && element.props.fallback.type).toBe(ProjectRouteLoading);
  });

  it("provides the resolved id to the page", async () => {
    resolveProjectSegment.mockResolvedValue("3f2a9c81-0000-4000-8000-000000000000");
    const { page, result } = await resolved("min-3f2a9c81");
    const provider = await result as ReactElement<{ segment: string; projectId: string; children: ReactNode }>;
    expect(provider.type).toBe(ProjectRouteProvider);
    expect(provider.props).toMatchObject({ segment: "min-3f2a9c81", projectId: "3f2a9c81-0000-4000-8000-000000000000" });
    expect(provider.props.children).toBe(page);
  });

  it("renders the not-found page for a code that designates no visible project", async () => {
    resolveProjectSegment.mockResolvedValue(null);
    const { result } = await resolved("min-00000000");
    await expect(result).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

import { QueryClient } from "@tanstack/react-query";
import { expect, it } from "vitest";
import { adjacentProjectDestination } from "./project-navigation-working-set";

it("chooses one authorized neighbor around recent project context, including Pages", () => {
  const client = new QueryClient();
  try {
    client.setQueryData(["projects"], [{ id: "first" }, { id: "second" }, { id: "third" }]);
    expect(adjacentProjectDestination(client, "/all", [], ["/projects/first/pages/document"])).toBe("/projects/second");
    expect(adjacentProjectDestination(client, "/home", ["/projects/first", "/projects/second/pages/document"], ["/projects/first"])).toBe("/projects/third");
    expect(adjacentProjectDestination(client, "/projects/third", [], [])).toBe("/projects/second");
  } finally { client.clear(); }
});

it("requires a successful authorized source and cannot derive a project from a stale stored URL", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  try {
    expect(adjacentProjectDestination(client, "/projects/unknown", [], [])).toBeUndefined();
    client.setQueryData(["projects"], [{ id: "first" }, { id: "second" }]);
    expect(adjacentProjectDestination(client, "/projects/unknown", [], [])).toBeUndefined();
    await client.invalidateQueries({ queryKey: ["projects"], exact: true });
    expect(adjacentProjectDestination(client, "/projects/first", [], [])).toBeUndefined();
    await client.fetchQuery({ queryKey: ["projects"], queryFn: async () => { throw new Error("Forbidden"); } }).catch(() => {});
    expect(adjacentProjectDestination(client, "/projects/first", [], [])).toBeUndefined();
  } finally { client.clear(); }
});

it("does not cross account clients or create work for a one-project account", () => {
  const first = new QueryClient(), second = new QueryClient();
  try {
    first.setQueryData(["projects"], [{ id: "first" }, { id: "second" }]);
    second.setQueryData(["projects"], [{ id: "first" }]);
    expect(adjacentProjectDestination(first, "/projects/first", [], [])).toBe("/projects/second");
    expect(adjacentProjectDestination(second, "/projects/first", [], [])).toBeUndefined();
  } finally { first.clear(); second.clear(); }
});

import { describe, expect, it } from "vitest";
import { plainMarkdown, plainMarkdownParts } from "./plain-markdown";

describe("plainMarkdown", () => {
  it("removes formatting while keeping readable text", () => {
    expect(plainMarkdown("## **Hello** [world](https://example.test) `code`")).toBe(
      "Hello world code"
    );
  });

  it("removes images, list markers, and fenced code", () => {
    expect(plainMarkdown("- first\n- ![image](image.png)\n```ts\nconst x = 1;\n```\nlast")).toBe(
      "first last"
    );
  });
});

describe("plain previews with typed mentions (MIN-734)", () => {
  const PROJECT = "11111111-1111-4111-8111-111111111111";

  it("keeps each mention apart, so its stored label is never printed", () => {
    const parts = plainMarkdownParts(`Ask **[@Secret project](mention:project/${PROJECT})** about it`);
    expect(parts).toEqual(["Ask ", { type: "project", id: PROJECT, label: "Secret project" }, " about it"]);
    expect(parts.filter((part) => typeof part === "string").join("")).not.toContain("Secret");
  });

  it("drops a mention the slice cut in half", () => {
    expect(plainMarkdownParts("Ask [@Secret pro")).toEqual(["Ask @…"]);
    expect(plainMarkdownParts(`Ask [@Secret](mention:project/${PROJECT.slice(0, 8)}`)).toEqual(["Ask @…"]);
  });
});

import { describe, expect, it } from "vitest";
import { plainMarkdown } from "./plain-markdown";

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

// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { DocumentationInlineText } from "./documentation-inline-text";

function render(text: string) {
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(<DocumentationInlineText>{text}</DocumentationInlineText>);
  return host;
}

it("highlights commands and identifiers without changing surrounding text", () => {
  const host = render("Run `npm test`, then inspect `MINDDY_API_KEY`.");
  expect([...host.querySelectorAll("code")].map(element => element.textContent)).toEqual(["npm test", "MINDDY_API_KEY"]);
  expect(host.textContent).toBe("Run npm test, then inspect MINDDY_API_KEY.");
});

it("preserves literal placeholders, HTML and Markdown outside code spans", () => {
  const host = render("POST /f/<board-token>?sso=<jwt>; `<script>` and **plain text**.");
  expect(host.textContent).toBe("POST /f/<board-token>?sso=<jwt>; <script> and **plain text**.");
  expect(host.querySelector("script")).toBeNull();
  expect(host.querySelector("strong")).toBeNull();
});

it("leaves unmatched backticks and line breaks intact", () => {
  const text = "One `unfinished reference\nNext line";
  expect(render(text).textContent).toBe(text);
  expect(render(text).querySelector("code")).toBeNull();
});

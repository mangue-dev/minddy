import { describe, expect, it } from "vitest";
import { resolveDocumentationHelpLink } from "./documentation-help-links";

describe("documentation help citations", () => {
  const appUrl = "http://localhost:3000";

  it.each(["https://minddy.app", "https://minddy.example", "https://minddy.example.com", appUrl])(
    "opens guides from %s within the docs with their article identity", origin => {
      expect(resolveDocumentationHelpLink(`${origin}/fr/documentation/issues?source=numo#create-an-issue`, appUrl))
        .toEqual({ articleId: "issues", href: "/fr/documentation/issues?source=numo#create-an-issue" });
    },
  );

  it("resolves legacy citations to the current article and stable section", () => {
    expect(resolveDocumentationHelpLink("/docs/page-editor#editor-save", appUrl))
      .toEqual({ articleId: "pages", href: "/docs/pages#editor-save" });
  });

  it.each(["https://other.example/docs/issues", "https://minddy.app/settings", "javascript:alert(1)",
    "https://user:password@minddy.app/docs/issues", "https://minddy.app.evil.example/docs/issues"])(
    "leaves non-guide links to the regular renderer: %s", href => {
      expect(resolveDocumentationHelpLink(href, appUrl)).toBeNull();
    },
  );
});

import { describe, expect, it } from "vitest";
import { isAllowedRedirectUri } from "@/lib/server/oauth/clients";

/**
 * The dynamic registration redirect_uris filter (RFC 7591). It carries
 * two opposing requirements, hence the test: accept the private schema of a desktop app
 * - without it Cursor does not authenticate - without ever letting
 * pass an executable schema, since the callback ends in a `Location:`
 * and in the `href` of the success interstitial.
 */

describe("isAllowedRedirectUri", () => {
  it("accepte https, et http sur le loopback seulement", () => {
    expect(isAllowedRedirectUri("https://claude.ai/api/mcp/auth_callback")).toBe(true);
    expect(isAllowedRedirectUri("http://localhost:8765/callback")).toBe(true);
    expect(isAllowedRedirectUri("http://127.0.0.1:8765/callback")).toBe(true);
    expect(isAllowedRedirectUri("http://[::1]:8765/callback")).toBe(true);
    expect(isAllowedRedirectUri("http://evil.example.com/callback")).toBe(false);
  });

  it("accepte le schéma privé d'une app native (RFC 8252 §7.1)", () => {
    expect(isAllowedRedirectUri("cursor://anysphere.cursor-mcp/oauth/callback")).toBe(true);
    expect(isAllowedRedirectUri("vscode://ms-vscode.mcp/callback")).toBe(true);
    expect(isAllowedRedirectUri("com.example.app:/oauth2redirect")).toBe(true);
  });

  it("refuse tout schéma exécutable, même bien formé", () => {
    for (const uri of [
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      "file:///etc/passwd",
      "blob:https://minddy.app/abc",
      "about:blank",
      "filesystem:https://minddy.app/temporary/x",
    ]) {
      expect(isAllowedRedirectUri(uri), uri).toBe(false);
    }
  });

  it("refuse le fragment, le non-URI et le trop long", () => {
    expect(isAllowedRedirectUri("https://app.example.com/cb#frag")).toBe(false);
    expect(isAllowedRedirectUri("cursor://host/cb#frag")).toBe(false);
    expect(isAllowedRedirectUri("pas une uri")).toBe(false);
    expect(isAllowedRedirectUri(null)).toBe(false);
    expect(isAllowedRedirectUri(`https://a.example.com/${"x".repeat(2000)}`)).toBe(false);
  });
});

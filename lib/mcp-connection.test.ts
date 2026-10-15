import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import ts from "typescript-api";
import { describe, expect, it } from "vitest";
import { mcpConnectionNeedsAuth, mcpSettingsHref } from "./mcp-connection";

const ROOT = resolve(import.meta.dirname, "..");
const MCP_CLIENT = join(ROOT, "lib/mcp-client");

function sourceFiles(directory: string): string[] {
  return (readdirSync(join(ROOT, directory), { recursive: true }) as string[])
    .filter((path) => /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path))
    .map((path) => join(directory, path));
}

function parse(path: string): ts.SourceFile {
  return ts.createSourceFile(
    path,
    readFileSync(join(ROOT, path), "utf8"),
    ts.ScriptTarget.Latest,
    true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

function resolvesToMcpClient(path: string, specifier: string): boolean {
  const target = specifier.startsWith("@/")
    ? join(ROOT, specifier.slice(2))
    : specifier.startsWith(".")
      ? resolve(ROOT, dirname(path), specifier)
      : null;
  return target?.replace(/\.tsx?$/, "") === MCP_CLIENT;
}

/** Imports that evaluate lib/mcp-client.ts at runtime (type-only ones are erased). */
function runtimeMcpClientImports(path: string): string[] {
  const source = parse(path);
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      resolvesToMcpClient(path, node.moduleSpecifier.text)
    ) {
      const clause = node.importClause;
      const bindings = clause?.namedBindings;
      const typeOnly =
        clause?.isTypeOnly === true ||
        (clause !== undefined &&
          !clause.name &&
          bindings !== undefined &&
          ts.isNamedImports(bindings) &&
          bindings.elements.every((element) => element.isTypeOnly));
      if (!typeOnly) found.push(node.getText(source));
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      resolvesToMcpClient(path, node.moduleSpecifier.text)
    ) {
      const clause = node.exportClause;
      const typeOnly =
        node.isTypeOnly ||
        (clause !== undefined &&
          ts.isNamedExports(clause) &&
          clause.elements.every((element) => element.isTypeOnly));
      if (!typeOnly) found.push(node.getText(source));
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0]) &&
      resolvesToMcpClient(path, node.arguments[0].text)
    ) {
      found.push(node.getText(source));
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

function isServerModule(path: string): boolean {
  return (
    path.startsWith("lib/server/") ||
    path.startsWith("app/api/") ||
    /^import\s+["']server-only["'];?\s*$/m.test(readFileSync(join(ROOT, path), "utf8"))
  );
}

describe("MCP connection helpers", () => {
  it("asks for authentication only when the selected mode lacks a credential", () => {
    expect(mcpConnectionNeedsAuth({ auth_mode: "oauth", oauth_connected: false })).toBe(true);
    expect(mcpConnectionNeedsAuth({ auth_mode: "oauth", oauth_connected: true })).toBe(false);
    expect(
      mcpConnectionNeedsAuth({ auth_mode: "bearer", oauth_connected: false, has_token: false }),
    ).toBe(true);
    expect(
      mcpConnectionNeedsAuth({ auth_mode: "bearer", oauth_connected: false, has_token: true }),
    ).toBe(false);
    expect(mcpConnectionNeedsAuth({ auth_mode: "none", oauth_connected: false })).toBe(false);
  });

  it("links to the MCP settings tab and an optional connection", () => {
    expect(mcpSettingsHref()).toBe("/settings?tab=mcp-clients");
    expect(mcpSettingsHref("connection-1")).toBe(
      "/settings?tab=mcp-clients&mcp_connection=connection-1",
    );
  });

  it("keeps the zod-backed MCP schemas out of browser modules", () => {
    const helpers = parse("lib/mcp-connection.ts");
    expect(helpers.statements.filter(ts.isImportDeclaration)).toEqual([]);

    const browserImports = ["app", "components", "lib"]
      .flatMap(sourceFiles)
      .filter((path) => !isServerModule(path))
      .flatMap((path) => runtimeMcpClientImports(path).map((statement) => ({ path, statement })));
    expect(browserImports).toEqual([]);
  });
});

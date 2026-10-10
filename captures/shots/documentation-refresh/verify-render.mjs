/** Verify the shared renderers using a scoped static preview, without starting Next or Docker. */
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { chromium } from "playwright";

const root = process.cwd();
const output = resolve(root, "output/documentation-cleanup-preview");
const screenshots = resolve(root, "docs/screenshots/pr-documentation-cleanup");
await mkdir(output, { recursive: true });
await mkdir(screenshots, { recursive: true });
const sources = ["components/documentation/documentation-table.tsx", "components/documentation/documentation-diagram.tsx", "components/marketing/card-tones.ts", "components/marketing/feature-table-styles.ts"];
const css = await postcss([tailwind({ base: root })]).process(`@import "tailwindcss" source(none);\n@import "mangue-ui/tokens.css";\n${sources.map(source => `@source "${resolve(root, source)}";`).join("\n")}\nbody { font-family: system-ui, sans-serif; padding: 24px; background: var(--background); color: var(--foreground); } main { max-width: 740px; margin: auto; } h1 { font-size: 28px; font-weight: 600; } h2 { font-size: 20px; margin-top: 32px; }`, { from: resolve(root, "documentation-scoped-preview.css") });
const entry = `import React from "react"; import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown"; import remarkGfm from "remark-gfm";
import { DocumentationTable } from "./components/documentation/documentation-table";
import { DocumentationDiagram } from "./components/documentation/documentation-diagram";
export function render(markdown, figures) { return renderToStaticMarkup(<main><h1>Documentation tables and diagrams</h1><h2>Operating responsibilities</h2><ReactMarkdown remarkPlugins={[remarkGfm]} components={{table:({children})=><DocumentationTable label="Operating responsibilities">{children}</DocumentationTable>}}>{markdown}</ReactMarkdown>{figures.map(figure=><DocumentationDiagram key={figure.id} figure={figure}/>)}</main>); }`;
const bundle = resolve(output, "renderer.mjs");
await build({ stdin: { contents: entry, resolveDir: root, loader: "tsx" }, bundle: true, platform: "node", format: "esm", jsx: "automatic", outfile: bundle,
  external: ["react", "react-dom/server", "react/jsx-runtime", "react-markdown", "remark-gfm"],
  plugins: [{ name: "scoped-design-utility", setup(builder) { builder.onResolve({ filter: /^mangue-ui(?:\/lib\/utils)?$/ }, () => ({ path: resolve(root, "node_modules/mangue-ui/src/lib/utils.ts") })); } }],
});
const { render } = await import(pathToFileURL(bundle).href);
const article = JSON.parse((await readFile("content/documentation/en/choose-an-instance.md", "utf8")).split("---")[1]);
const content = (await readFile("content/documentation/en/choose-an-instance.md", "utf8")).split("---").slice(2).join("---");
const table = content.slice(content.indexOf("|"), content.indexOf("\n\n", content.indexOf("|")));
const guides = await Promise.all(["architecture-and-data-flows", "git", "numo"].map(async id => JSON.parse((await readFile(`content/documentation/en/${id}.md`, "utf8")).split("---")[1])));
const figures = guides.map(guide => guide.figures.find(figure => figure.diagram));
if (figures.some(figure => !figure)) throw new Error("The preview needs collection, sequence and matrix figures.");
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>${css.css}</style></head><body>${render(table, figures)}</body></html>`;
const browser = await chromium.launch({ args: ["--force-color-profile=srgb", "--disable-lcd-text"] });
const checks = [];
try {
  const context = await browser.newContext({ deviceScaleFactor: 2, reducedMotion: "reduce" });
  const page = await context.newPage();
  for (const [name, width, theme] of [["desktop-light", 1100, "light"], ["mobile-light", 390, "light"], ["desktop-dark", 1100, "dark"]]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.setContent(html);
    await page.evaluate(theme => document.documentElement.classList.toggle("dark", theme === "dark"), theme);
    await page.emulateMedia({ colorScheme: theme });
    await page.evaluate(() => document.fonts.ready);
    const result = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > innerWidth,
      tables: document.querySelectorAll("table").length,
      captions: document.querySelectorAll("table > caption").length,
      invalidNesting: document.querySelectorAll("p table, p div").length,
      horizontalScroll: [...document.querySelectorAll('[role="region"]')].some(el => el.scrollWidth > el.clientWidth),
    }));
    if (result.overflow || result.invalidNesting || result.tables !== 2 || result.captions !== 2 || (width === 390 && !result.horizontalScroll)) throw new Error(`Invalid ${name} preview: ${JSON.stringify(result)}`);
    if (width === 390) {
      const region = page.getByRole("region").first();
      await region.focus(); await page.keyboard.press("ArrowRight");
      await page.waitForTimeout(100);
      if (await region.evaluate(el => el.scrollLeft) === 0) throw new Error("The mobile table did not scroll from the keyboard.");
      await region.evaluate(el => { el.scrollLeft = 0; });
    }
    await page.screenshot({ path: resolve(screenshots, `${name}.png`), fullPage: true, scale: "device" });
    checks.push({ name, ...result });
  }
  await writeFile(resolve(screenshots, "checks.json"), JSON.stringify({ date: "2026-10-09", method: "Actual shared React renderers and explicitly scoped Tailwind sources; static preview rather than a complete app navigation.", article: article.id, checks }, null, 2) + "\n");
} finally { await browser.close(); await rm(bundle, { force: true }); }
console.log("Three static renderer previews passed; browser closed.");

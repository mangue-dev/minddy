/** Isolated evidence of the actual MIN-680 reader; no account or business writes. */
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { chromium } from "playwright";
import { captureDocumentationControl, settleDocumentationPage } from "../../lib/documentation-frame.mjs";

const root = process.cwd();
const locale = process.argv[2] ?? "en";
const formatsOnly = process.argv[3] === "formats";
assert(["en", "fr", "de", "es", "it", "pt-BR"].includes(locale));
const output = resolve(root, "output/playwright/file-preview");
await mkdir(output, { recursive: true });
const messages = JSON.parse(await readFile(`messages/${locale}.json`, "utf8"));
const examples = {
  en: ["Project files", "Launch checklist", "Task,Owner,Status\nReview design,Alice,Done\nCheck keyboard access,Sam,In progress"],
  fr: ["Fichiers du projet", "Liste de lancement", "Tâche,Responsable,Statut\nRelire le design,Alice,Terminé\nVérifier le clavier,Sam,En cours"],
  de: ["Projektdateien", "Checkliste zum Start", "Aufgabe,Verantwortlich,Status\nDesign prüfen,Alice,Erledigt\nTastaturbedienung prüfen,Sam,In Bearbeitung"],
  es: ["Archivos del proyecto", "Lista de lanzamiento", "Tarea,Responsable,Estado\nRevisar diseño,Alice,Finalizado\nComprobar el teclado,Sam,En curso"],
  it: ["File del progetto", "Lista di lancio", "Attività,Responsabile,Stato\nRivedere il design,Alice,Completato\nVerificare la tastiera,Sam,In corso"],
  "pt-BR": ["Arquivos do projeto", "Lista de lançamento", "Tarefa,Responsável,Status\nRevisar o design,Alice,Concluído\nVerificar o teclado,Sam,Em andamento"],
};
const [heading, name, csv] = examples[locale];
const entry = `import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { ThemeProvider } from "mangue-ui";
import { FileViewer } from "./components/file-viewer";
function Demo() {
 const [open,setOpen] = useState(false);
 const mode = new URLSearchParams(location.search).get("mode") || "csv";
 const file = mode === "image" ? "diagram.png" : mode === "text" ? "notes.text" : mode === "markdown" ? "guide.md" : ${JSON.stringify(name + '.csv')};
 return <NextIntlClientProvider locale=${JSON.stringify(locale)} messages={${JSON.stringify({Common: messages.Common, Resources:messages.Resources})}}>
 <ThemeProvider defaultTheme={new URLSearchParams(location.search).get("theme") === "dark" ? "dark" : "light"}>
 <main style={{transform:"translateZ(0)", width:"70%", marginLeft:"30%", padding:32}}><h1>${heading}</h1>
 <button id="open" onClick={()=>setOpen(true)}>${messages.Resources.preview}: {file}</button>
 <FileViewer src={"/"+mode} downloadHref={mode === "image" ? location.origin.replace("127.0.0.1","localhost")+"/download" : "/download"} fileName={file} mimeType={mode === "image" ? "image/png" : mode === "csv" ? "text/csv" : "application/octet-stream"} open={open} onOpenChange={setOpen} onRemove={()=>{document.body.dataset.removed="true";}} />
 </main></ThemeProvider></NextIntlClientProvider>;
}
createRoot(document.getElementById("root")).render(<Demo/>);`;
// esbuild's tsconfig resolves the application alias to source modules.
await build({ stdin: {contents:entry, resolveDir:root, loader:"tsx"}, bundle:true, platform:"browser", format:"esm", jsx:"automatic", outfile:resolve(output,"reader.js"),
 define:{"process.env.NODE_ENV":'"production"'}, logLevel:"warning",
 plugins:[{name:"design-utility",setup(builder){builder.onResolve({filter:/^mangue-ui\/lib\/utils$/},()=>({path:resolve(root,"node_modules/mangue-ui/src/lib/utils.ts")}));}}] });
await build({ entryPoints:["lib/server/csv-preview.ts"], bundle:true, platform:"node", format:"esm", outfile:resolve(output,"csv.mjs"), external:["papaparse"],
 plugins:[{name:"server-only-stub",setup(builder){builder.onResolve({filter:/^server-only$/},()=>({path:resolve(root,"test/server-only-stub.ts")}));}}] });
const { renderCsvPreview } = await import(pathToFileURL(resolve(output,"csv.mjs")).href);
const css = await postcss([tailwind({base:root})]).process(`@import "tailwindcss" source(none);\n@import "mangue-ui/tokens.css";\n@source "${resolve(root,"components/image-viewer.tsx")}";\n@source "${resolve(root,"components/file-viewer.tsx")}";\n@source "${resolve(root,"node_modules/mangue-ui/src/components/ui/button.tsx")}";\nbody {font-family:system-ui,sans-serif;background:var(--background);color:var(--foreground);} h1 {font-size:24px;margin-bottom:24px;}`, {from:resolve(root,"file-preview-scoped.css")});
const html = `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css.css}</style></head><body><div id="root"></div><script type="module" src="/reader.js"></script></body></html>`;
const server = createServer(async (req,res)=>{
 const path = new URL(req.url,"http://localhost").pathname;
 if(path === "/reader.js") {res.setHeader("Content-Type","text/javascript");res.end(await readFile(resolve(output,"reader.js")));return;}
 if(path === "/csv") {
  const theme = new URL(req.url,"http://localhost").searchParams.get("theme") === "dark" ? "dark" : "light";
  res.setHeader("Content-Type","text/html; charset=utf-8");
  res.end(renderCsvPreview(new TextEncoder().encode(csv),["text/csv"],{fileName:name+".csv",locale,theme,emptyMessage:messages.Resources.csvPreviewEmpty,truncatedMessage:messages.Resources.csvPreviewTruncated}));return;
 }
 if(path === "/image") {res.setHeader("Content-Type","image/png");res.end(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWZkAAAAASUVORK5CYII=","base64"));return;}
 if(path === "/text" || path === "/markdown") {res.setHeader("Content-Type","text/plain");res.end(path === "/text" ? "<script>this stays text</script>\n"+name : "# "+name+"\n\n- "+heading+"\n\n<script>this must not run</script>");return;}
 if(path === "/download") {res.setHeader("Access-Control-Allow-Origin","*");res.setHeader("Content-Disposition","attachment; filename=checklist.csv");res.end(csv);return;}
 res.setHeader("Content-Type","text/html; charset=utf-8");res.end(html);
});
await new Promise(done=>server.listen(0,"127.0.0.1",done));
const url = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({args:["--force-color-profile=srgb","--disable-lcd-text"]});
const checks = [];
try {
 const context = await browser.newContext({viewport:{width:1120,height:760},deviceScaleFactor:2,reducedMotion:"reduce"});
 const page = await context.newPage();
 const failures=[];page.on("pageerror",error=>failures.push(error.message));
 if (formatsOnly) {
  await page.goto(url+"?mode=markdown");
  await page.locator("#open").click();
  await page.locator("dialog h1").waitFor();
  assert.equal(await page.locator("dialog script").count(),0);
  await page.locator("dialog h1").click();
  assert.equal(await page.locator("dialog").evaluate(node=>node.open),true);
  await page.getByRole("button",{name:messages.Common.close,exact:true}).click();
  await page.locator("dialog[open]").waitFor({state:"hidden"});
  checks.push({mode:"markdown",sanitized:true,contentClickKeepsOpen:true});
  await page.goto(url+"?mode=image");
  await page.locator("#open").click();
  const image = page.locator("dialog img");
  await image.waitFor();
  await page.waitForFunction(()=>document.querySelector("dialog img")?.complete);
  assert.equal(await image.evaluate(node=>node.naturalWidth),1);
  assert.deepEqual(await page.locator("dialog").boundingBox(),{x:0,y:0,width:1120,height:760});
  await image.click();
  await page.locator("dialog[open]").waitFor({state:"hidden"});
  await page.waitForFunction(()=>document.activeElement?.id === "open");
  checks.push({mode:"image",imageClickCloses:true,focusRestored:true});
  await page.locator("#open").click();
  await page.getByRole("button",{name:messages.Resources.actions,exact:true}).click();
  const downloaded = page.waitForEvent("download");
  await page.keyboard.press("Enter");
  const file = await downloaded;
  assert.equal(file.suggestedFilename(),"diagram.png");
  assert.equal(await page.locator("dialog").evaluate(node=>node.open),true);
  checks.push({mode:"cross-origin-image-download",suggestedFilename:file.suggestedFilename(),keepsReaderOpen:true});
  assert.deepEqual(failures,[]);
  await context.close();
  await writeFile(resolve(output,`${locale}-format-checks.json`),JSON.stringify({locale,checks},null,2)+"\n");
 } else {
 await page.goto(url);
 await settleDocumentationPage(page,locale);
 await page.locator("#open").click();
 await page.frameLocator("iframe").locator("table").waitFor();
 await page.evaluate(()=>document.fonts.ready);
 assert.equal(await page.locator("dialog").evaluate(node=>node.parentElement === document.body),true);
 const bounds = await page.locator("dialog").boundingBox();
 assert.deepEqual(bounds,{x:0,y:0,width:1120,height:760});
 assert.equal(await page.locator("[data-preview-close]").evaluate(node=>node === document.activeElement),true);
 await page.getByRole("button",{name:messages.Resources.actions,exact:true}).click();
 assert.equal(await page.getByRole("menu").evaluate(node=>Boolean(node.closest("dialog"))),true);
 await page.getByRole("menuitem",{name:messages.Resources.download,exact:true}).focus();
 await page.keyboard.press("ArrowDown");
 assert.equal(await page.getByRole("menuitem",{name:messages.Resources.remove,exact:true}).evaluate(node=>node === document.activeElement),true);
 const destination=resolve(root,`public/documentation/${locale}/file-preview.png`);
 const frame = await captureDocumentationControl(page,page.locator("dialog"),destination);
 checks.push({mode:"desktop-light-csv-menu",bounds,...frame,screenshot:`public/documentation/${locale}/file-preview.png`});
 await page.getByRole("menuitem",{name:messages.Resources.download,exact:true}).focus();
 await page.keyboard.press("Escape");
 assert.equal(await page.getByRole("menu").count(),0);
 assert.equal(await page.locator("dialog").evaluate(node=>node.open),true);
 await page.keyboard.press("Escape");
 await page.locator("dialog[open]").waitFor({state:"hidden"});
 await page.waitForFunction(()=>document.activeElement?.id === "open");
 assert.equal(await page.locator("#open").evaluate(node=>node === document.activeElement),true);
 if(locale === "en") {
  await page.setViewportSize({width:390,height:844});
  await page.locator("#open").click();
  await page.getByRole("button",{name:messages.Resources.actions,exact:true}).click();
  const box = await page.getByRole("menu").boundingBox();
  assert(box.x>=0 && box.x+box.width<=390 && box.y>=0);
  await page.screenshot({path:resolve(output,"phone.png")});
  checks.push({mode:"phone-light-csv-menu",bounds:await page.locator("dialog").boundingBox(),menu:box});
  await page.keyboard.press("Escape");await page.keyboard.press("Escape");
  await page.evaluate(()=>localStorage.removeItem("mangue-ui-theme"));
  await page.goto(url+"?mode=text&theme=dark");
  await page.locator("html.dark").waitFor();
  await page.locator("#open").click();
  await page.locator("pre").waitFor();
  assert((await page.locator("pre").textContent()).includes("<script>"));
  assert.equal(await page.locator("dialog script").count(),0);
  await page.screenshot({path:resolve(output,"phone-dark-text.png")});
  checks.push({mode:"phone-dark-text",bounds:await page.locator("dialog").boundingBox()});
 }
 assert.deepEqual(failures,[]);
 await context.close();
 await writeFile(resolve(output,`${locale}-checks.json`),JSON.stringify({locale,method:"Actual React viewer and sandboxed CSV renderer in an isolated fixture; page-file access verified separately by route tests.",checks},null,2)+"\n");
 }
} finally {await browser.close();await new Promise(done=>server.close(done));}
console.log(`${locale}: ${formatsOnly ? "format checks passed" : "reader checks passed; screenshot saved"}; browser closed.`);

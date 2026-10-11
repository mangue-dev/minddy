/** Capture and exercise the actual trigger editor with local, read-only query fixtures. */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import sharp from "sharp";
import { promisify } from "node:util";
import { createServer } from "node:http";

const root = process.cwd(), out = resolve("output/playwright/min-677-trigger-preview");
await mkdir(out, { recursive: true });
const locales = ["en","fr","de","es","it","pt-BR"];
const catalogs = Object.fromEntries(await Promise.all(locales.map(async locale => [locale, JSON.parse(await readFile(`messages/${locale}.json`, "utf8"))])));
const project = "11111111-1111-4111-8111-111111111111", member = "22222222-2222-4222-8222-222222222222", category = "33333333-3333-4333-8333-333333333333", database = "44444444-4444-4444-8444-444444444444", property = "55555555-5555-4555-8555-555555555555";
const entry = `import React, {useState} from "react"; import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl"; import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RoutineTriggerFields } from "./components/routines/routine-trigger-fields";
const qc = new QueryClient({defaultOptions:{queries:{staleTime:Infinity,retry:false}}});
const schema=[{id:${JSON.stringify(property)},name:"Score",type:"number"}];
qc.setQueryData(["members",${JSON.stringify(project)}],{members:[{user_id:${JSON.stringify(member)},full_name:"Camille",email:"camille@example.test"}],invitations:[],isOwner:true});
qc.setQueryData(["categories",${JSON.stringify(project)}],[{id:${JSON.stringify(category)},name:"Backend"}]);
qc.setQueryData(["pages",${JSON.stringify(project)}],[{id:${JSON.stringify(database)},title:"Requests",database_schema:schema}]);
qc.setQueryData(["page",${JSON.stringify(database)}],{id:${JSON.stringify(database)},title:"Requests",database_schema:schema});
qc.setQueryData(["routine-followed-issues",${JSON.stringify(project)}],[{id:${JSON.stringify(property)},title:"Example request"}]);
function App(){const [demo,setDemo]=useState({locale:"en",mode:"event"});window.setRoutineDemo=setDemo;
const initial={type:"event",event:"issue.status_changed",status:"triage",conditions:{operator:"and",children:[{field:"category",operator:"contains",value:${JSON.stringify(category)}},{operator:"or",children:[{field:"assignee",operator:"present"},{field:"priority",operator:"eq",value:"high"}]}]}};
return <NextIntlClientProvider locale={demo.locale} messages={window.catalogs[demo.locale]}><QueryClientProvider client={qc}><Editor key={demo.locale+demo.mode} initial={demo.mode==="database"?{type:"database",databaseId:${JSON.stringify(database)},conditions:{field:"property",propertyId:${JSON.stringify(property)},operator:"gte",value:5}}:initial}/></QueryClientProvider></NextIntlClientProvider>}
function Editor({initial}){const [value,setValue]=useState(initial);window.readRoutineTrigger=()=>value;return <main id="control"><RoutineTriggerFields projectId=${JSON.stringify(project)} value={value} onChange={setValue}/></main>}
createRoot(document.getElementById("root")).render(<App/>);`;
const bundle = await build({ stdin: { contents: entry, resolveDir: root, loader: "tsx" }, bundle: true, platform: "browser", format: "iife", jsx: "automatic", write: false, define: { "process.env.NODE_ENV": '"production"', "process.env": '{}' } });
const sources = ["components/routines/routine-trigger-fields.tsx", "node_modules/mangue-ui/src/components/ui/button.tsx", "node_modules/mangue-ui/src/components/ui/input.tsx"];
const css = await postcss([tailwind({ base: root })]).process(`@import "tailwindcss" source(none); @import "mangue-ui/tokens.css"; ${sources.map(source => `@source "${resolve(source)}";`).join("\n")} body{font-family:system-ui,sans-serif;background:var(--background);color:var(--foreground);padding:24px}main{max-width:740px;margin:auto;border:1px solid var(--border);border-radius:12px;padding:24px;background:var(--background)}input,select{min-width:0}`, { from: resolve(out, "preview.css") });
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>${css.css}</style></head><body><div id="root"></div><script>window.catalogs=${JSON.stringify(catalogs)};</script><script>${bundle.outputFiles[0].text.replaceAll("</script", "<\\/script")}</script></body></html>`;
await writeFile(resolve(out,"index.html"),html);
const server = createServer((_request, response) => { response.setHeader("Content-Type", "text/html; charset=utf-8"); response.end(html); });
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const cli = process.env.PLAYWRIGHT_CLI || resolve(process.env.HOME,".codex/skills/playwright/scripts/playwright_cli.sh");
const invoke = async args => (await promisify(execFile)(cli,["-s=min677",...args],{encoding:"utf8",maxBuffer:8*1024*1024})).stdout;
await invoke(["open","about:blank"]);
try {
  const checks = JSON.parse((await invoke(["run-code",`async (page) => {
    const context=await page.context().browser().newContext({deviceScaleFactor:2,reducedMotion:"reduce"});
    const preview=await context.newPage();const errors=[];preview.on("pageerror",e=>errors.push(e.message));
    await preview.route("**/*",route=>route.request().url().startsWith(${JSON.stringify(origin)})?route.continue():route.abort());
    await preview.goto(${JSON.stringify(origin)});
    try { await preview.locator("#control select").first().waitFor({timeout:5000}); } catch { throw new Error("Editor failed: "+errors.join("; ")); }const records=[];
    for(const locale of ${JSON.stringify(locales)}) {
      await preview.setViewportSize({width:1100,height:1600});
      await preview.evaluate(locale=>{document.documentElement.lang=locale;window.setRoutineDemo({locale,mode:"event"})},locale);
      await preview.getByLabel(${JSON.stringify(catalogs.en.Routines.triggerLabel)}).count();
      await preview.waitForFunction(locale=>document.querySelector("label")?.textContent.includes(window.catalogs[locale].Routines.triggerLabel),locale);
      await preview.evaluate(()=>document.fonts.ready);
      const bounds=await preview.locator("#control").boundingBox();
      await preview.locator("#control").screenshot({path:${JSON.stringify(out)}+"/"+locale+".png",scale:"device"});
      records.push({locale,viewport:[Math.round(bounds.width)+48,Math.round(bounds.height)+48]});
    }
    await preview.evaluate(()=>window.setRoutineDemo({locale:"en",mode:"database"}));
    await preview.getByLabel("Trigger").selectOption("database");
    await preview.getByLabel("Database",{exact:true}).selectOption(${JSON.stringify(database)});
    await preview.getByRole("button",{name:"Add condition",exact:true}).click();
    await preview.getByLabel("Comparison",{exact:true}).selectOption("gte");
    await preview.getByLabel("Value",{exact:true}).fill("7");
    const trigger=await preview.evaluate(()=>window.readRoutineTrigger());
    if(trigger.conditions.children[0].value!==7)throw new Error("Number was not retained as a typed condition");
    const mobileContext = await page.context().browser().newContext({deviceScaleFactor:2,viewport:{width:390,height:1600},reducedMotion:"reduce"});
    const mobile = await mobileContext.newPage();
    await mobile.route("**/*",route=>route.request().url().startsWith(${JSON.stringify(origin)})?route.continue():route.abort());
    await mobile.goto(${JSON.stringify(origin)});
    await mobile.locator("#control select").first().waitFor();
    await mobile.evaluate(()=>window.setRoutineDemo({locale:"en",mode:"database"}));
    await mobile.getByLabel("Value",{exact:true}).fill("7");
    if(await mobile.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw new Error("Mobile editor overflows");
    await mobile.locator("#control").screenshot({path:${JSON.stringify(out)}+"/mobile-database.png",scale:"device"});
    await mobileContext.close();
    if(errors.length)throw new Error(errors.join("\\n"));
    await context.close();return JSON.stringify({records,mobileOverflow:false,typedNumber:trigger.conditions.children[0].value,errors});
  }`])).match(/### Result\s*\n([\s\S]*?)(?=\n###|$)/)?.[1]?.trim().replace(/^"|"$/g,"").replaceAll('\\"','"'));
  for(const record of checks.records) {
    await mkdir(`public/documentation/${record.locale}`,{recursive:true});
    await sharp(resolve(out,`${record.locale}.png`)).extend({left:48,top:48,right:48,bottom:48,background:{r:0,g:0,b:0,alpha:0}}).withIccProfile("srgb").png().toFile(`public/documentation/${record.locale}/scheduled-routines-workflow.png`);
  }
  await writeFile("content/documentation/reviews/min-677-editor-captures.json",JSON.stringify({date:new Date().toISOString(),method:"Actual RoutineTriggerFields React component, local query-cache demonstrations only, external requests blocked, no business writes, native 2x pixels.",...checks},null,2)+"\n");
  console.log(JSON.stringify(checks));
} finally { await invoke(["close"]); server.close(); }

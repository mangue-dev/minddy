/** Actual reader-fixture results on the disposable local instance. No business writes. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { openPage, settle, CAPTURE, CAPTURE_LOCALES } from '../../lib/browser.mjs';
import { catalog } from '../../lib/messages.mjs';
const baseUrl=CAPTURE.baseUrl;
if(new URL(baseUrl).hostname!=='localhost'||new URL(baseUrl).port!=='3001')throw new Error('Reader captures require the disposable candidate on localhost:3001.');
const {projectId}=JSON.parse(await readFile('/tmp/min664-reader-project.json','utf8'));
const auth=JSON.parse(await readFile('/tmp/min664-reader-auth-owner.json','utf8'));
const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const recordPath='content/documentation/reviews/reader-fixture-captures-2026-10-08.json';let records=[];try{records=JSON.parse(await readFile(recordPath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
const requested=process.env.DOC_CAPTURE_SCREENS?.split(',');
const objective='291500d1-2f9d-4725-a972-f38ce57570fd';
function translate(v,m){if(typeof v==='string')return m[v]??v;if(Array.isArray(v))return v.map(x=>translate(x,m));if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,translate(x,m)]));return v;}
const root=`/projects/${projectId}`;
const screens=[
 ['statistics','/statistics',async(p,m)=>{await p.getByRole('region',{name:m.Stats.yearStory,exact:true}).first().waitFor();},p=>p.locator('main')],
 ['first-project',root,async(p,_m)=>{await p.getByText('DOC-1',{exact:true}).first().click();await p.getByRole('dialog').first().getByRole('tab').first().click();},p=>p.getByRole('dialog').first()],
 ['objectives',`${root}/objectives`,async(p,m,fixture)=>{await p.getByRole('button',{name:m.Objectives.newObjective,exact:true}).first().click();await p.getByPlaceholder(m.Objectives.namePlaceholder,{exact:true}).fill(fixture.mapping['Make the website usable without a mouse']);},p=>p.getByRole('dialog')],
 ['objective-momentum',`${root}/objectives?open=${objective}`,async(p,m)=>{await p.getByText(m.Objectives.momentumTitle,{exact:true}).waitFor();},p=>p.locator('main')],
 ['cycle','/all?view=cycle',async p=>{await p.getByText('DOC-2',{exact:true}).first().waitFor();},p=>p.locator('main')],
 ['trash','/trash',async(p,m,fixture)=>{await p.getByText(fixture.mapping['Check the mobile navigation'],{exact:true}).waitFor();},p=>p.locator('main')],
];
for(const locale of(process.env.CAPTURE_LOCALES?.split(',')??CAPTURE_LOCALES)){
 const m=await catalog(locale);const fixture=JSON.parse(await readFile(new URL(`./${locale}/reader-fixture.json`,import.meta.url),'utf8'));for(const name of ['Toutes','All','Alle','Todos','Tutti'])fixture.mapping[name]=m.Board.defaultViewName;
 for(const [screen,path,action,target]of screens){if(requested&&!requested.includes(screen))continue;const {browser,context,page}=await openPage({authed:false,locale,theme:'light',frozenNow:'2026-10-08T18:00:00Z',viewport:{width:1280,height:1080}});page.setDefaultTimeout(60000);await context.addCookies(auth.cookies.filter(c=>c.name!=='NEXT_LOCALE'));const changed=[],blockedWrites=[];
 try{await context.route('**/api/**',async route=>{const r=route.request(),url=new URL(r.url());if(r.method()!=='GET'){if(url.pathname.startsWith('/api/me/app-tabs'))return route.fallback();blockedWrites.push(url.pathname);return route.abort('blockedbyclient');}const response=await route.fetch().catch(()=>null);if(!response)return;if(!response.ok())return route.fulfill({response});let body;try{body=await response.json();}catch{return route.fulfill({response});}const localized=translate(body,fixture.mapping);if(JSON.stringify(body)!==JSON.stringify(localized))changed.push(url.pathname);return route.fulfill({response,json:localized});});await page.goto(baseUrl+path,{waitUntil:'load'});if(path===root)await page.getByText('DOC-2',{exact:true}).first().waitFor();await page.locator('main').waitFor();await settle(page);await page.waitForTimeout(600);await action(page,m,fixture);await page.mouse.move(8,8);await settle(page);await page.waitForTimeout(650);const control=target(page,m).first();await control.waitFor();const b=await control.boundingBox();if(!b)throw new Error('Reader control missing.');const out=`public/documentation/${locale}/reader-${screen}.png`;await mkdir(`public/documentation/${locale}`,{recursive:true});await control.screenshot({path:out,animations:'disabled'});records=records.filter(r=>r.locale!==locale||r.screen!==screen);records.push({locale,screen,src:out.slice('public'.length),date:'2026-10-08',candidateVersion:'0.11.1',sourceCommit,workingTreeChanges:true,route:path,profile:'Disposable restored full-reference backend aligned to candidate migrations',viewport:[Math.round(b.width),Math.round(b.height)],browserViewport:[1280,1080],displayAdaptation:changed,blockedWrites,reviewed:false,submitted:false,limitation:screen==='objectives'?'Unsubmitted actual creation dialog.':'Actual stored demonstration state; no fabricated result or human acceptance.'});console.log(`${locale}/${screen}: captured`);}catch(e){console.error(`${locale}/${screen}: ${e.message}`);records=records.filter(r=>r.locale!==locale||r.screen!==screen);records.push({locale,screen,error:e.message,reviewed:false});}finally{await browser.close();const latest=JSON.parse(await readFile(recordPath,'utf8').catch(e=>{if(e.code==='ENOENT')return '[]';throw e;}));const current=records.filter(r=>r.locale===locale&&r.screen===screen);await writeFile(recordPath,JSON.stringify([...latest.filter(r=>r.locale!==locale||r.screen!==screen),...current],null,2)+'\n');}
 }
}

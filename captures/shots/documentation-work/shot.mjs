/** Source-backed controls with localized, exact-match demonstration prose in GET responses. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { openPage, settle, shoot, CAPTURE, CAPTURE_LOCALES } from '../../lib/browser.mjs';
import { catalog } from '../../lib/messages.mjs';
const project='6cd36606-c297-4920-8ce3-31b5f3697be8';
if(!['localhost','127.0.0.1'].includes(new URL(CAPTURE.baseUrl).hostname))throw new Error('Use a local candidate for documentation captures.');
const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const path='content/documentation/reviews/work-control-captures-2026-10-08.json';let records=[];try{records=JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
const requested=process.env.DOC_CAPTURE_SCREENS?.split(',');
function translate(value,mapping){if(typeof value==='string')return mapping[value]??value;if(Array.isArray(value))return value.map(v=>translate(v,mapping));if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,translate(v,mapping)]));return value;}
const base=`/projects/${project}`;
async function issue(p){await p.getByText('AUR-2',{exact:true}).first().click();await p.getByRole('dialog').first().waitFor();}
const screens=[
 ['navigation',base,null,p=>p.locator('body')],
 ['bulk-actions',base,async(p,m)=>{for(const key of ['AUR-2','AUR-3'])await p.getByText(key,{exact:true}).first().click({modifiers:['Shift']});await p.getByRole('button',{name:m.BulkActions.actions,exact:true}).click();},p=>p.getByRole('dialog')],
 ['dependencies',base,async(p,m)=>{await issue(p);await p.getByRole('button',{name:m.Relations.addRelationAria,exact:true}).click();await p.getByText(m.Relations.blocked_by,{exact:true}).click();await p.getByPlaceholder(m.Relations.searchTarget,{exact:true}).fill('AUR-3');},p=>p.locator('[data-radix-popper-content-wrapper]').last()],
 ['sub-issues',base,async(p,m)=>{await issue(p);await p.getByPlaceholder(m.IssueUI.addSubIssuePlaceholder,{exact:true}).click();},p=>p.getByRole('dialog').first()],
 ['implementation-plan',base,async p=>{await issue(p);await p.getByRole('dialog').first().getByRole('tab').nth(1).click();await p.getByRole('dialog').first().getByRole('tabpanel').getByText('2/6',{exact:true}).first().waitFor();},p=>p.getByRole('dialog').first()],
 ['resources',base,async(p,m)=>{await issue(p);await p.getByRole('button',{name:m.Resources.add,exact:true}).click();await p.getByText(m.Resources.addLink,{exact:true}).last().click();await p.getByPlaceholder(m.Resources.linkPlaceholder,{exact:true}).fill('https://example.org/contact');},p=>p.getByRole('dialog').last()],
 ['view-filters',base,async(p,m)=>{await p.getByRole('button',{name:m.Common.filters,exact:true}).click();},p=>p.locator('[data-radix-popper-content-wrapper]').last()],
 ['share-view',base,async(p,m)=>{await p.getByRole('button',{name:m.Board.viewOptions.replace('{name}',m.Board.defaultViewName),exact:true}).click();await p.getByText(m.Board.shareView,{exact:true}).last().click();},p=>p.getByRole('dialog').last()],
 ['search',base,async p=>{await p.keyboard.press('ControlOrMeta+k');await p.getByRole('dialog').waitFor();await p.getByRole('dialog').locator('input').fill('AUR-2');},p=>p.getByRole('dialog')],
 ['inbox','/home',async(p,m)=>{await p.getByRole('button',{name:m.Nav.inbox,exact:true}).click();await p.locator('#inbox-popover').waitFor();await p.locator('#inbox-popover').getByText(m.Inbox.emptyTitle,{exact:true}).waitFor();},p=>p.locator('#inbox-popover')],
 ['task-notebook',base,async(p,m)=>{await p.getByRole('button',{name:new RegExp('^'+m.Scratchpad.openAria.split('(')[0].trim())}).first().click();await p.getByRole('dialog',{name:m.Scratchpad.title,exact:true}).waitFor();},p=>p.getByRole('dialog')],
 ['statistics','/statistics',null,p=>p.locator('main')],
 ['trash','/trash',null,p=>p.locator('main')],
];
for(const locale of(process.env.CAPTURE_LOCALES?.split(',')??CAPTURE_LOCALES)){
 const m=await catalog(locale);const fixture=JSON.parse(await readFile(new URL(`./${locale}/fixture.json`,import.meta.url),'utf8'));for(const name of ['Toutes','All','Alle','Todos','Tutti'])fixture.mapping[name]=m.Board.defaultViewName;
 for(const [screen,routePath,action,target]of screens){if(requested&&!requested.includes(screen))continue;
 const {browser,context,page}=await openPage({locale,theme:'light',viewport:{width:1440,height:screen==='implementation-plan'?1400:1080}});page.setDefaultTimeout(60000);const displayAdaptation=[],blockedWrites=[];
 try{
 await context.route('**/api/**',async route=>{const r=route.request(),url=new URL(r.url());if(r.method()!=='GET'){if(url.pathname.startsWith('/api/me/app-tabs'))return route.fallback();blockedWrites.push(url.pathname);return route.abort('blockedbyclient');}if(!url.pathname.startsWith(`/api/projects/${project}/`)&&url.pathname!=='/api/me/scratchpad')return route.fallback();const response=await route.fetch().catch(()=>null);if(!response)return;if(!response.ok())return route.fulfill({response});let body;try{body=await response.json();}catch{return route.fulfill({response});}const localized=translate(body,fixture.mapping);if(JSON.stringify(body)!==JSON.stringify(localized))displayAdaptation.push(url.pathname);return route.fulfill({response,json:localized});});
 await page.goto(CAPTURE.baseUrl+routePath,{waitUntil:'load'});if(routePath===base)await page.getByText('AUR-2',{exact:true}).first().waitFor();else await page.locator('main').waitFor();await settle(page);await page.waitForTimeout(600);if(action)await action(page,m);await page.mouse.move(8,8);await page.waitForTimeout(600);await settle(page);
 const control=target(page,m).first();await control.waitFor();const bounds=await control.boundingBox();if(!bounds||bounds.width<100||bounds.height<40)throw new Error('Capture control is not visible.');const out=`public/documentation/${locale}/work-${screen}.png`;await mkdir(`public/documentation/${locale}`,{recursive:true});if(screen==='navigation')await shoot(page,out);else await control.screenshot({path:out,animations:'disabled'});
 const record={locale,screen,src:out.slice('public'.length),sourceCommit,candidateVersion:'0.11.1',date:'2026-10-08',route:routePath,theme:'light',browserViewport:[1440,screen==='implementation-plan'?1400:1080],viewport:[Math.round(bounds.width),Math.round(bounds.height)],displayAdaptation,blockedWrites,submitted:false,reviewed:false,limitation:'Actual controls only, without a saved action outcome. Exact demo prose translations preserve identifiers and state.'};records=records.filter(r=>r.locale!==locale||r.screen!==screen);records.push(record);console.log(`${locale}/${screen}: captured`);
 }catch(e){console.error(`${locale}/${screen}: ${e.message}`);records=records.filter(r=>r.locale!==locale||r.screen!==screen);records.push({locale,screen,error:e.message,reviewed:false});}finally{await browser.close();const latest=JSON.parse(await readFile(path,'utf8').catch(e=>{if(e.code==='ENOENT')return '[]';throw e;}));const current=records.filter(r=>r.locale===locale&&r.screen===screen);await writeFile(path,JSON.stringify([...latest.filter(r=>r.locale!==locale||r.screen!==screen),...current],null,2)+'\n');}
 }
}

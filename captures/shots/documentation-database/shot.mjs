/** Capture real database controls on an explicitly isolated candidate. */
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { projectId, databaseId, entryId, importDatabaseId, labels, localize } from './localize.mjs';
const origin='http://localhost:3001';
const authState=process.env.DOCUMENTATION_SCRATCH_AUTH ?? '/tmp/min664-reader-auth-owner.json';
const locales=process.env.CAPTURE_LOCALES?.split(',') ?? ['en','fr','de','es','it','pt-BR'];
const requested=process.env.DOC_CAPTURE_SCREENS?.split(',');
const registry='content/documentation/reviews/database-controls-2026-10-08.json';
let records=[];try{records=JSON.parse(await readFile(registry,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
for(const locale of locales){
 const messages=JSON.parse(await readFile(`messages/${locale}.json`,'utf8'));const t=messages.PageDatabase;
 const browser=await chromium.launch();const context=await browser.newContext({storageState:authState,viewport:{width:1440,height:1080},deviceScaleFactor:2,locale:{en:'en-US',fr:'fr-FR',de:'de-DE',es:'es-ES',it:'it-IT','pt-BR':'pt-BR'}[locale],colorScheme:'light',reducedMotion:'reduce'});
 await context.addCookies([{name:'NEXT_LOCALE',value:locale,url:origin}]);
 await context.addInitScript(({db,imp})=>{localStorage.setItem('mangue-ui-theme','light');localStorage.setItem('cookie_consent','declined');for(const id of [db,imp])localStorage.setItem(`minddy:database-setup:${id}`,'pending');document.addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');s.textContent='nextjs-portal{display:none!important}*,*::before,*::after{animation:none!important;transition:none!important}';document.head.appendChild(s);});},{db:databaseId,imp:importDatabaseId});
 const adaptations=[];const writes=[];const blocked=[];
 await context.route('**/api/**',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.origin!==origin)throw new Error('Unexpected API origin');
  if(url.pathname.endsWith('/pages/import-plan')){blocked.push({method:request.method(),path:url.pathname,reason:'Optional AI type recommendation omitted; local mapping remains'});return route.abort();}
  if(request.method()!=='GET'){writes.push({method:request.method(),path:url.pathname});return route.fallback();}
  if(!url.pathname.startsWith(`/api/projects/${projectId}`))return route.fallback();
  const response=await route.fetch().catch(()=>null);if(!response)return;if(!response.ok())return route.fulfill({response});
  const value=await response.json();const translated=localize(value,locale);if(JSON.stringify(value)!==JSON.stringify(translated))adaptations.push(url.pathname);
  return route.fulfill({response,json:translated});
 });
 const page=await context.newPage();page.setDefaultTimeout(20000);
 const path=id=>`/projects/${projectId}/pages/${id}`;
 async function go(id){await page.goto(origin+path(id),{waitUntil:'load'});await page.locator('main textarea').first().waitFor();await page.waitForTimeout(1000);}
 async function capture(screen,target){if(requested&&!requested.includes(screen))return;await page.mouse.move(8,8);await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(450);let bounds=await target.boundingBox();if(screen==='database-table'||screen==='database-entry'){bounds=await target.evaluate(el=>{const r=el.getBoundingClientRect();const bottoms=[...el.querySelectorAll('button,textarea,[role=checkbox],td')].map(x=>x.getBoundingClientRect()).filter(b=>b.width>0&&b.height>0&&b.top<innerHeight).map(b=>b.bottom);return {x:r.x,y:r.y,width:r.width,height:Math.min(r.height,Math.max(...bottoms)-r.y+16)};});}if(!bounds)throw new Error('Missing target');const v=page.viewportSize();const x=Math.max(0,Math.floor(bounds.x-12)),y=Math.max(0,Math.floor(bounds.y-12));const clip={x,y,width:Math.min(v.width-x,Math.ceil(bounds.width+24)),height:Math.min(v.height-y,Math.ceil(bounds.height+24))};const src=`/documentation/${locale}/${screen}.png`;await mkdir(`public/documentation/${locale}`,{recursive:true});await page.screenshot({path:'public'+src,clip,animations:'disabled'});records=records.filter(r=>r.locale!==locale||r.screen!==screen);records.push({locale,screen,src,sourceCommit,candidateVersion:'0.11.1',workingTreeChanges:true,runtime:'Isolated adapted backend on localhost:8000',projectId,databaseId,entryId,route:new URL(page.url()).pathname,browserViewport:[v.width,v.height],viewport:[clip.width,clip.height],language:await page.locator('html').getAttribute('lang'),theme:'light',date:'2026-10-08',displayAdaptation:[...new Set(adaptations)],writes:[...writes],blocked:[...blocked],reviewed:false,limitation:'Real controls and previews. No conversion or import is committed by this capture script.'});await writeFile(registry,JSON.stringify(records,null,2)+'\n');console.log(locale+'/'+screen);}
 try{
  await go(databaseId);await page.getByRole('button',{name:t.addProperty,exact:true}).waitFor();await capture('database-table',page.locator('main'));
  await page.getByRole('button',{name:t.addProperty,exact:true}).click();let dialog=page.getByRole('dialog',{name:t.addProperty,exact:true});await dialog.getByRole('textbox').fill(labels[locale][5]);await dialog.getByRole('button',{name:t.propertyType,exact:true}).click();await capture('database-property-types',page.getByRole('listbox').last());await page.keyboard.press('Escape');await page.keyboard.press('Escape');
  await page.locator('[data-database-column-trigger="3c235acb-533c-4967-9225-30be8ff14055"]').click();await page.getByRole('menuitem',{name:t.editColumn,exact:true}).click();dialog=page.getByRole('dialog',{name:t.editColumn,exact:true});await dialog.getByRole('button',{name:t.propertyType,exact:true}).click();await page.getByText(t.number,{exact:true}).last().click();await dialog.getByRole('button',{name:t.save,exact:true}).click();const warning=page.getByRole('alertdialog');await warning.waitFor();await capture('database-conversion-warning',warning);await warning.getByRole('button',{name:t.cancel,exact:true}).click();await page.keyboard.press('Escape');
  await go(entryId);await page.getByRole('checkbox',{name:labels[locale][7],exact:true}).waitFor();await capture('database-entry',page.locator('main'));
  await go(importDatabaseId);await page.getByRole('button',{name:t.importAction,exact:true}).click();await page.locator('input[type=file]').setInputFiles({name:'demo.csv',mimeType:'text/csv',buffer:Buffer.from(`${messages.PageDatabase.name},${labels[locale][6]},${labels[locale][7]}\n${labels[locale][3]},2.5,true\n${locale==='fr'?'Vérifier le clavier':locale==='de'?'Tastatur prüfen':locale==='es'?'Comprobar el teclado':locale==='it'?'Verificare la tastiera':locale==='pt-BR'?'Verificar o teclado':'Check keyboard navigation'},1,false\n`)});dialog=page.getByRole('dialog');await page.getByText(t.importMappingTitle,{exact:true}).waitFor();await capture('database-import-mapping',dialog.locator('form'));await dialog.getByRole('button',{name:messages.Common.continue,exact:true}).click();await page.getByText(t.importReviewTitle,{exact:true}).waitFor();await capture('database-import-review',dialog.locator('form'));
 }catch(error){console.log(locale+' failed: '+error.message.split('\n')[0]);records.push({locale,error:error.message.split('\n')[0],date:'2026-10-08',reviewed:false});await writeFile(registry,JSON.stringify(records,null,2)+'\n');}
 finally{await browser.close();}
}

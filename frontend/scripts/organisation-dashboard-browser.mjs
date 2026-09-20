import { chromium } from 'playwright';
import { expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { fixture } from './organisation-dashboard-tests.mjs';

const browser = await chromium.launch({headless:true,channel:process.env.DASHBOARD_BROWSER_CHANNEL || 'msedge'});
const base='http://127.0.0.1:4173';
const orgPath='/demo/renamed-demo/dashboard';
const sitePath='/demo/renamed-demo/relational-second-site/dashboard';
const contextFixture=()=>({organisation:{id:'1',name:'Renamed Demo',slug:'renamed-demo',enabled:false,realtime:true},sites:[
 {id:'1',organisation_id:'1',name:'First Site',slug:'first-site',enabled:true,realtime:false,max_capacity:2},
 {id:'2',organisation_id:'1',name:'Relational Second Site',slug:'relational-second-site',enabled:false,realtime:true,max_capacity:3},
]});
const sizes=[['desktop',{width:1440,height:900}],['tablet',{width:768,height:1024}],['phone',{width:390,height:844}]];
let passed=0;
async function check(name, run) { await run();passed++;console.log(`PASS ${name}`); }

async function harness({viewport=sizes[0][1],pending}={}) {
 const context=await browser.newContext({viewport,hasTouch:viewport.width<600});
 await context.route('https://consent.cookiebot.com/**',route=>route.abort());
 const state={data:contextFixture(),requests:[],errors:[],fail:new Set()};
 let release;
 const gate=pending?new Promise(resolve=>{release=resolve;}):Promise.resolve();
 await context.route('**/api/**',async route=>{
  const url=new URL(route.request().url());const path=url.pathname;
  state.requests.push(path+url.search);
  if(path===pending)await gate;
  let body={};let status=200;
  if(path==='/api/auth/me')body={ok:false};
  else if(path==='/api/demo/dashboard/context')body=state.data;
  else if(path==='/api/demo/dashboard/snapshot')body=fixture();
  else if(path.startsWith('/api/demo/dashboard/sites/'))body=fixture('site',path.split('/')[5]);
  if(body.payload) {
   body.payload.year.occupancy[1]=[0,0,0];
   body.payload.year.occupancy.splice(9,3,[0,0,0],[0,0,0],[0,0,0]);
  }
  if(state.fail.has(path)){status=503;body={detail:'unavailable'};}
  await route.fulfill({status,json:body});
 });
 const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>state.errors.push(e.message));
 const count=path=>state.requests.filter(p=>p===path).length;
 return {context,page,state,count,release};
}

async function ready(page) {
 await expect(page.locator('[data-snapshot-ts]')).toBeVisible();
 await expect(page.locator('.dashboard-loading')).toHaveCount(0);
}

async function assertHeader(page,{name,realtime,enabled}) {
 const header=page.locator('.dashboard-v2__header--canonical');
 await expect(page.getByRole('heading',{name,exact:true,level:1})).toBeVisible();
 await expect(header.getByText(realtime?'Realtime':'Offline',{exact:true}).filter({visible:true})).toBeVisible();
 await expect(header.getByText(`System status: ${enabled?'ON':'OFF'}`,{exact:false}).filter({visible:true})).toBeVisible();
 await expect(header.getByText(/Local time: \d{2}:\d{2}/).filter({visible:true})).toBeVisible();
 assert.equal(await header.getByText(/Snapshot:|UTC/).count(),0);
 const wave=header.locator('.vrm-realtime-wave-track:visible');
 assert.equal(await wave.evaluate(el=>getComputedStyle(el).animationName),realtime?'vrm-realtime-wave':'none');
 assert.equal(await header.locator('.vrm-status-wave__cross:visible').count(),realtime?0:1);
 const waveBox=await header.locator('.vrm-status-wave:visible').boundingBox();
 assert(Math.abs(waveBox.width-32)<1 && Math.abs(waveBox.height-16)<1,'Wave size is unchanged');
 if(!realtime) {
  const crossBox=await header.locator('.vrm-status-wave__cross:visible').boundingBox();
  assert(Math.abs(crossBox.x+crossBox.width/2-waveBox.x-waveBox.width/2)<0.5,'Offline cross is horizontally centered on the wave');
  assert(Math.abs(crossBox.y+crossBox.height/2-waveBox.y-waveBox.height/2)<0.5,'Offline cross is vertically centered on the wave');
 }
 await expect(header.locator(`.vrm-status-indicator.${enabled?'on':'off'}:visible`)).toBeVisible();
 if(enabled)assert.equal(await header.locator('.vrm-status-indicator.on:visible').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(34, 197, 94)');
 assert.equal(await header.evaluate(el=>el.scrollWidth>el.clientWidth+1),false,'Header does not overflow');
}

try {
 const h=await harness();const {page,state,count}=h;
 await check('canonical organisation header and KPI regressions',async()=>{
  await page.goto(base+orgPath+'?panel=sites&org=2&viewToken=ignored');await ready(page);
  await assertHeader(page,{name:'Renamed Demo',realtime:true,enabled:false});
  await expect(page.getByText('125%',{exact:true})).toBeVisible();
  await expect(page.locator('.dashboard-v2__kpi-band .kpi-value')).toHaveText(['96','97','9','26','20']);
  const dwell=page.locator('.dashboard-v2__kpi-content[aria-label="Dwell Minutes"]');
  await expect(dwell.locator('.kpi-value')).toHaveText('20');
  await expect(dwell.locator('.kpi-label')).toHaveText('Dwell Minutes');
  await dwell.getByTestId('vrm-sparkline-overlay').hover();
  await expect(dwell.getByTestId('vrm-sparkline-footer').locator('.kpi-sparkline-strip__value')).toHaveText('20');
  await dwell.screenshot({path:'test-results/dwell-headline-desktop.png'});
  await page.mouse.move(400,100);
  const ring=await page.locator('.capacity-usage .recharts-wrapper').boundingBox();
  await page.mouse.move(ring.x+ring.width/2+56,ring.y+ring.height/2);
  await expect(page.getByText('Rolling peak',{exact:true})).toBeVisible();
  await expect(page.getByText('151%',{exact:true})).toBeVisible();
  await page.mouse.move(400,100);
  assert.equal(count('/api/demo/dashboard/context'),1);
  assert.equal(count('/api/demo/dashboard/snapshot'),1);
 });
 await check('bare Demo, relational rename and default Site 2',async()=>{
  const beforeContext=count('/api/demo/dashboard/context');
  const beforeOrganisation=count('/api/demo/dashboard/snapshot');
  await page.goto(base+'/demo');await ready(page);
  await expect(page).toHaveURL(base+sitePath);
  await assertHeader(page,{name:'Relational Second Site',realtime:true,enabled:false});
  assert.equal(count('/api/demo/dashboard/sites/2/snapshot'),1);
  assert.equal(count('/api/demo/dashboard/context'),beforeContext+1,'Redirect reuses context');
  assert.equal(count('/api/demo/dashboard/snapshot'),beforeOrganisation,'Bare entry only loads the selected site Snapshot');
  state.data.sites[1].name='Changed Relational Name';state.data.sites[1].slug='changed-relational-name';
  await page.goto(base+'/demo');await ready(page);
  await expect(page).toHaveURL(base+'/demo/renamed-demo/changed-relational-name/dashboard');
  await expect(page.getByRole('heading',{name:'Changed Relational Name',exact:true})).toBeVisible();
  state.data=contextFixture();
 });
 await check('organisation and Site 1 remain selectable',async()=>{
  await page.goto(base+sitePath+'?panel=sites');await ready(page);
  await page.getByRole('link',{name:'First Site',exact:true}).click();await ready(page);
  await expect(page).toHaveURL(/\/first-site\/dashboard/);
  await assertHeader(page,{name:'First Site',realtime:false,enabled:true});
  await page.getByRole('button',{name:'First Site',exact:true}).click();
  await page.getByRole('link',{name:'Renamed Demo',exact:true}).click();await ready(page);
  await expect(page).toHaveURL(base+orgPath);
  await expect(page.getByRole('link',{name:'Event Logs',exact:true})).toHaveAttribute('href',/\/demo\/site-b\/event-logs/);
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('camOS_selected_site')),'site-b');
 });
 await check('unknown slugs and existing legacy aliases',async()=>{
  const before=state.requests.length;
  await page.goto(base+'/demo/renamed-demo/foreign/dashboard');
  await expect(page.getByText('Dashboard not found.',{exact:true})).toBeVisible();
  assert(!state.requests.slice(before).some(p=>p.endsWith('/snapshot')));
  for(const alias of ['site-a','site-b','all']){
   await page.goto(base+`/demo/${alias}/dashboard`);await ready(page);
   await expect(page).toHaveURL(base+orgPath);
  }
 });
 await check('missing default site is a recoverable configuration error',async()=>{
  state.data.sites=state.data.sites.filter(site=>site.id!=='2');
  await page.goto(base+'/demo');
  await expect(page.getByRole('alert')).toContainText('configured default site is missing');
  await expect(page.locator('.dashboard-loading')).toHaveCount(0);
  state.data=contextFixture();
  await page.getByRole('button',{name:'Retry',exact:true}).click();await ready(page);
  await expect(page).toHaveURL(base+sitePath);
 });
 await check('no polling, browser-clock liveness or timer-driven network traffic',async()=>{
  await page.clock.install({time:new Date('2035-01-01T12:00:00Z')});
  await page.goto(base+sitePath);await ready(page);
  const before=state.requests.length;
  const localTime=await page.locator('.dashboard-v2__header--canonical').getByText(/Local time:/).filter({visible:true}).textContent();
  await page.clock.fastForward(16*60*1000);
  assert.equal(state.requests.length,before);
  await assertHeader(page,{name:'Relational Second Site',realtime:true,enabled:false});
  assert.notEqual(await page.locator('.dashboard-v2__header--canonical').getByText(/Local time:/).filter({visible:true}).textContent(),localTime);
  await page.clock.resume();
 });

 for(const [size,viewport] of sizes) {
  await page.setViewportSize(viewport);
  await check(`${size}: Dwell headline retains minute meaning without suffix`,async()=>{
   await page.goto(base+sitePath);await ready(page);
   const dwell=page.locator('.dashboard-v2__kpi-content[aria-label="Dwell Minutes"]');
   await expect(dwell.locator('.kpi-value')).toHaveText('20');
   await expect(dwell.locator('.kpi-label')).toHaveText('Dwell Minutes');
   await dwell.screenshot({path:`test-results/dwell-headline-${size}.png`});
  });
  for(const realtime of [true,false])for(const enabled of [true,false]){
   await check(`${size}: ${enabled?'ON':'OFF'} and ${realtime?'Realtime':'Offline'}`,async()=>{
    Object.assign(state.data.sites[1],{enabled,realtime});
    await page.goto(base+sitePath);await ready(page);
    await assertHeader(page,{name:state.data.sites[1].name,enabled,realtime});
    await page.locator('.dashboard-v2__header--canonical').screenshot({path:`test-results/header-${size}-${enabled?'on':'off'}-${realtime?'realtime':'offline'}.png`});
   });
  }
  await check(`${size}: organisation and long relational title`,async()=>{
   await page.goto(base+orgPath);await ready(page);
   await assertHeader(page,{name:'Renamed Demo',enabled:false,realtime:true});
   await page.screenshot({path:`test-results/organisation-${size}.png`,fullPage:true});
   state.data.sites[1].name='A Much Longer Relational Site Name With More Than One Word';
   await page.goto(base+sitePath);await ready(page);
   await assertHeader(page,{name:state.data.sites[1].name,enabled:false,realtime:false});
   await page.locator('.dashboard-v2__header--canonical').screenshot({path:`test-results/header-long-${size}.png`});
   state.data.sites[1].name='Relational Second Site';
  });
  await check(`${size}: Year line stops in September and bars keep their domain`,async()=>{
   await page.goto(base+sitePath);await ready(page);
   const before=state.requests.length;
   await page.getByLabel('Site Flow period').selectOption('year');
   const card=page.locator('.dashboard-v2__chart-card--site-flow');
   await card.scrollIntoViewIfNeeded();
   const line=card.locator('.recharts-line-curve');await expect(line).toBeVisible();
   const endpoints=await line.evaluate(el=>{
    const start=el.getPointAtLength(0);
    const point=el.getPointAtLength(el.getTotalLength());
    const screenX=p=>new DOMPoint(p.x,p.y).matrixTransform(el.getScreenCTM()).x;
    return {start:screenX(start),end:screenX(point)};
   });
   const finalTick=await card.locator('.recharts-xAxis .recharts-cartesian-axis-tick').last().boundingBox();
   const domainEnd=finalTick.x+finalTick.width/2;
   assert(Math.abs((endpoints.end-endpoints.start)/(domainEnd-endpoints.start)-8/11)<0.01,'Jan–Sep line occupies eight of eleven month intervals, with Oct–Dec absent');
   const timeline=card.getByRole('region',{name:'Site Flow activity timeline'});
   if(size==='phone') {
    assert(await timeline.evaluate(el=>el.scrollWidth>el.clientWidth),'Narrow chart scrolls without squeezing its axes');
    await timeline.evaluate(el=>{el.scrollLeft=el.scrollWidth;});
    const viewportBox=await timeline.boundingBox();
    for(const label of ['Entrances','Exits','Occupancy']) {
     const legendBox=await timeline.getByRole('button',{name:label,exact:true}).boundingBox();
     assert(legendBox.x>=viewportBox.x-1 && legendBox.x+legendBox.width<=viewportBox.x+viewportBox.width+1,'Legend stays available when the timeline scrolls');
    }
   }
   await card.screenshot({path:`test-results/year-${size}.png`});
   assert.equal(state.requests.length,before);
  });
  await check(`${size}: demographics chart-only layout, labels and hover values`,async()=>{
   await expect(page.getByLabel('Site Flow period').locator('option[value="month"]')).toHaveText('Last Month');
   await expect(page.getByLabel('Site Flow period').locator('option[value="quarter"]')).toHaveText('Last Quarter');
   await page.getByLabel('Site Flow view').selectOption('demographics');
   const charts=page.locator('.site-flow-demographics');await charts.scrollIntoViewIfNeeded();
   assert.equal(await charts.locator('dl,dt,dd,.traffic-distribution__annotations').count(),0);
   assert.equal(await charts.locator('.recharts-pie').count(),2);
   assert.equal(await charts.locator('.recharts-pie-sector').count(),8);
   for(const [index,value] of [[0,'85%'],[1,'60%']]){
    const ring=await charts.locator('.recharts-wrapper').nth(index).boundingBox();
    await page.mouse.move(ring.x+ring.width/2+56,ring.y+ring.height/2);
    await expect(charts.locator('.analytics-chart-tooltip--donut').getByText(value,{exact:true})).toBeVisible();
   }
   await page.mouse.move(0,0);
   await charts.screenshot({path:`test-results/demographics-${size}.png`});
  });
 }
 await check('mobile site selector',async()=>{
  await page.goto(base+orgPath+'?panel=sites');await ready(page);
  await page.getByRole('button',{name:'Sites',exact:true}).click();
  await page.getByRole('button',{name:'Sites',exact:true}).click();
  await page.getByText('First Site',{exact:true}).last().click();await ready(page);
  await expect(page).toHaveURL(/\/first-site\/dashboard/);
 });
 assert(state.requests.every(p=>p==='/api/me'||p==='/api/auth/me'||p==='/api/demo/session'||p.startsWith('/api/demo/dashboard/')),'No legacy fallback API requests');
 assert.deepEqual(state.errors,[]);
 await h.context.close();

 for(const [phase,endpoint] of [['session','/api/demo/session'],['context','/api/demo/dashboard/context'],['snapshot','/api/demo/dashboard/sites/2/snapshot']]){
  for(const fail of [false,true])await check(`${phase} delayed ${fail?'failure and retry':'success'}`,async()=>{
   const h=await harness({pending:endpoint,viewport:sizes[phase==='session'?0:phase==='context'?1:2][1]});
   if(fail)h.state.fail.add(endpoint);
   await h.page.goto(base+sitePath);
   await expect.poll(()=>h.count(endpoint)).toBe(1);
   const loader=h.page.locator('.dashboard-loading');await expect(loader).toBeVisible();
   await expect(loader.locator('.dashboard-loading__spinner')).toBeVisible();
   assert.equal(await h.page.locator('p[role="status"]').count(),0);
   assert.equal(h.count(endpoint),1);
   await h.page.screenshot({path:`test-results/loading-${phase}.png`,fullPage:true});
   await h.page.emulateMedia({reducedMotion:'reduce'});
   assert.equal(await loader.locator('.dashboard-loading__spinner').evaluate(el=>getComputedStyle(el).animationName),'none');
   h.release();
   if(fail){
    await expect(h.page.getByRole('button',{name:'Retry',exact:true})).toBeVisible();
    await expect(loader).toHaveCount(0);
    h.state.fail.clear();
    await h.page.getByRole('button',{name:'Retry',exact:true}).click();
   }
   await ready(h.page);
   if(phase==='snapshot') {
    assert.equal(await h.page.locator('.site-flow-activity .analytics-chart-surface').evaluate(el=>getComputedStyle(el).touchAction),'auto','Phone permits native horizontal chart scrolling');
    assert.equal(await h.page.locator('.vrm-realtime-wave-track:visible').evaluate(el=>getComputedStyle(el).animationName),'none');
   }
   assert.equal(h.count(endpoint),fail?2:1);
   assert.deepEqual(h.state.errors,[]);
   await h.context.close();
  });
 }
 console.log(`Dashboard browser scenarios: ${passed} passed, 0 failed.`);
} finally {await browser.close();}

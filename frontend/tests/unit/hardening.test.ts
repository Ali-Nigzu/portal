import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { usernameError } from '../../src/features/auth/usernameValidation';
import { demoReturnPath } from '../../src/features/organisation-dashboard/demoReturnPath';
import { optionalLocalStorage, optionalSessionStorage } from '../../src/common/optionalStorage';
import { readRecentPortalDestinations } from '../../src/features/organisation-dashboard/recentPortalDestinations';
import { contactAttachmentBytes } from '../../src/features/contact/contactLimits';
import { logout } from '../../src/features/auth/transport/me';
import { snapshot } from '../fixtures';
import { buildReportData } from '../../src/features/reports/engine/ReportsEngine';
import { buildSiteFlowBucketLabels } from '../../src/features/reports/utils/reportUtils';
import { periodBucketTimes } from '../../src/features/organisation-dashboard/snapshotTime';

test('manual usernames preserve Unicode codepoints, case, symbols, and reject every whitespace class', () => {
  for(const name of ['abc','123','MiXeD','名字🙂','🙂'.repeat(15),'a.b','a\x7fb']) assert.equal(usernameError(name),undefined);
  for(const name of ['ab','x'.repeat(16),' John','a\u00a0b','a\u0085b','a\u2003b','a\nB','a\x00b','a\ud800b']) assert.ok(usernameError(name));
});

test('Demo return targets preserve valid query/routes and reject encoded external or malformed targets', () => {
  for(const path of ['/home','/sites/21/dashboard?period=today','/contact?company=a%20b']) assert.equal(demoReturnPath(encodeURIComponent(path)),path);
  for(const path of ['//evil.invalid','\\evil.invalid','/\\evil.invalid','https://evil.invalid','/%2f%2fevil.invalid','/%5cevil.invalid','/\nfoo','%E0%A4%A','/%25252f%25252fevil.invalid']) assert.equal(demoReturnPath(path),'/');
});

test('optional storage survives blocked reads/writes/removals and retries preferences after recovery', () => {
  const store=new Map<string,string>(); let blocked=true;
  const native={getItem:(k:string)=>{if(blocked)throw Error('SecurityError');return store.get(k)??null;},setItem:(k:string,v:string)=>{if(blocked)throw Error('QuotaExceededError');store.set(k,v);},removeItem:(k:string)=>{if(blocked)throw Error('SecurityError');store.delete(k);}};
  Object.defineProperty(globalThis,'window',{value:{localStorage:native,sessionStorage:native},configurable:true});
  for(const storage of [optionalLocalStorage,optionalSessionStorage]) {
    assert.equal(storage.getItem('missing'),null); storage.setItem('preference','new'); assert.equal(storage.getItem('preference'),'new');
    blocked=false; assert.equal(storage.getItem('preference'),'new'); assert.equal(store.get('preference'),'new');
    blocked=true; storage.removeItem('preference'); assert.equal(storage.getItem('preference'),null);
    blocked=false; assert.equal(storage.getItem('preference'),null); assert.equal(store.has('preference'),false); blocked=true;
  }
  blocked=false;
  for(const raw of ['invalid','null','{}','[null,3,{}, {"organisationId":"foreign","module":"devices","viewedAt":1}]']){
    store.set('camos_authenticated_portal_recent_v1',raw);
    assert.deepEqual(readRecentPortalDestinations([{id:'2',name:'Org',role:0,sites:[]}]),[]);
  }
});

test('aggregate attachment expansion has a deterministic exact boundary',()=>{
  const overhead=1024+5+15; // x.pdf + application/pdf
  assert.equal(contactAttachmentBytes([{name:'x.pdf',type:'application/pdf',size:3}]),overhead+4);
  assert.equal(contactAttachmentBytes([{name:'x.pdf',type:'application/pdf',size:4}]),overhead+8);
  assert.ok(contactAttachmentBytes([{name:'x.pdf',type:'application/pdf',size:10*1024*1024}])>8_000_000);
});

test('logout requires the contracted 204 acknowledgement',async()=>{
  const previous=globalThis.fetch;
  try { for(const status of [200,401,503]) {globalThis.fetch=async()=>new Response('{}',{status});await assert.rejects(logout());}
    globalThis.fetch=async()=>new Response(null,{status:204}); await logout();
    globalThis.fetch=async()=>{throw Error('network')};await assert.rejects(logout());
  } finally {globalThis.fetch=previous;}
});

test('Today totals use elapsed UTC prefix, partial arrays, real occupancy, and no future tails',()=>{
  const value=snapshot(); value.payload.today.entrances=[10,20,30,40,...Array(20).fill(999)];
  const report=buildReportData(value,'site-activity','today'); assert.equal(report.reportType,'site-activity');
  if(report.reportType!=='site-activity') return;
  assert.equal(report.metrics.totalEntrances,100); assert.equal(report.metrics.occupancyMin,10); assert.equal(report.metrics.occupancyAvg,20);
  assert.equal(report.metrics.dwellAvg,4); assert.equal(report.bucketLabels.length,4);
  value.payload.today.entrances=[10,20]; value.payload.today.exits=[1,2]; value.payload.today.occupancy=[[20,10,30],[40,35,45]];
  const partial=buildReportData(value,'site-activity','today');if(partial.reportType!=='site-activity')return;
  assert.equal(partial.metrics.totalEntrances,30);assert.equal(partial.bucketLabels.length,2);assert.equal(partial.metrics.occupancyMin,10);
  assert.equal(buildReportData(value,'visitor-profile','today').metrics.totalEntrances,30);
  const historic=buildReportData(value,'site-activity','last_year');if(historic.reportType!=='site-activity')return;
  assert.deepEqual(historic.metrics.dwellSeries,[]);assert.equal(historic.metrics.dwellAvg,null);assert.equal(historic.metrics.dwellMax,null);
});

test('all rollup labels use the same UTC anchors as Dashboard',()=>{
  const ts='2026-10-25T01:30:00Z';
  for(const [frame,period,n] of [['today','today',2],['yesterday','yesterday',24],['last_week','week',7],['last_month','month',4],['last_quarter','quarter',12],['last_year','year',12],['all_time','all_time',3]] as const){
    const result=buildSiteFlowBucketLabels(frame,new Date(ts),[Array(n).fill(1)]);
    assert.deepEqual(result.timestamps.map(date=>date.valueOf()),periodBucketTimes(period,ts,n));
  }
});

test('Report counts, statistics, and labels are identical across UTC, London, New York, Tokyo and DST dates',()=>{
  const code=`import {snapshot} from './tests/fixtures.ts';import {buildReportData} from './src/features/reports/engine/ReportsEngine.ts';console.log(JSON.stringify(['2026-03-29T03:30:00Z','2026-10-25T01:30:00Z','2026-03-08T07:30:00Z','2026-11-01T06:30:00Z'].map(ts=>buildReportData(snapshot(ts),'site-activity','today',new Date(ts)))));`;
  const outputs=['UTC','Europe/London','America/New_York','Asia/Tokyo'].map(TZ=>execFileSync(process.execPath,['--import','tsx','--input-type=module','-e',code],{encoding:'utf8',env:{...process.env,TZ}}));
  for(const output of outputs.slice(1)) assert.equal(output,outputs[0]);
});

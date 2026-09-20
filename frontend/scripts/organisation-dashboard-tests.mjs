import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
const output = new URL('../test-results/dashboard-core.mjs', import.meta.url);
await mkdir(new URL('../test-results/', import.meta.url), { recursive: true });
const compiled = await build({stdin:{contents:`export * from './src/features/organisation-dashboard/projection'; export * from './src/features/organisation-dashboard/selection'; export * from './src/features/organisation-dashboard/api'; export * from './src/analytics/components/ChartRenderer/validation'; export * from './src/analytics/components/ChartRenderer/primitives/utils'; export * from './src/analytics/components/ChartRenderer/primitives/KpiTile'; export * from './src/analytics/components/ChartRenderer/utils/format';`,resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',jsx:'automatic',external:['react','react-dom','recharts'],write:false,define:{'import.meta.env':'{}'}});
await writeFile(output,compiled.outputFiles[0].text);
globalThis.window = {location:{hostname:'localhost'}};
const core = await import(output.href);
export function fixture(scope='organisation', id='1') {
 const rollup=n=>({entrances:Array(n).fill(17),occupancy:Array.from({length:n},()=>[3,1,5]),exits:Array(n).fill(9),age_pct:[1,2,3,4,5,85],sex_pct:[40,60]});
 const payload={
  entrances_96:Array.from({length:96},(_,i)=>i+1),
  occupancy_96:Array.from({length:96},(_,i)=>[i+2,i+1,i+3]),
  exits_96:Array(96).fill(9),
  footfall_96:Array(96).fill(26),
  dwell_time_96:Array(96).fill(20),
 };
 Object.assign(payload,{traffic_devices:scope==='organisation'?[{site_id:'17',name:'Payload Site Name'}]:[{device_id:'81',name:'Door Camera'}],traffic_split_96:Array.from({length:96},()=>[100]),capacity:Array.from({length:96},()=>[125,151]),today:rollup(14),yesterday:rollup(24),week:rollup(7),month:rollup(4),quarter:rollup(12),year:rollup(12),all_time:rollup(3)});
 return {scope,entity_id:id,entity_name:'Snapshot Entity',ts:'2026-09-14T14:07:00+01:00',payload};
}
const snapshot=core.parseSnapshot(fixture());
assert.deepEqual(snapshot.payload.occupancy_96[0],[2,1,3]);
const kpis=core.projectKpis(snapshot);
assert.equal(kpis.length,7);
for(const kpi of kpis.slice(0,5)) assert.equal(kpi.result.series[0].data.length,96);
assert.equal(kpis[0].result.series[0].data[95].x,'2026-09-14T13:00:00.000Z');
assert.equal(kpis[0].result.series[0].data[0].x,'2026-09-13T13:15:00.000Z');
assert.equal(kpis[1].result.meta.summary.headlineValue,97);
assert.equal(kpis[1].result.series[0].data[0].value,2);
assert.deepEqual(snapshot.payload.occupancy_96[0],[2,1,3]);
assert.equal(kpis[3].result.meta.summary.headlineValue,26);
assert.equal(snapshot.payload.dwell_time_96[95],20);
assert.equal(kpis[4].result.meta.summary.headlineValue,20);
assert(kpis[4].result.series[0].data.every(p=>p.value===20));
assert.equal(kpis[4].result.series[0].unit,'minutes');
assert.equal(core.formatValue(20,kpis[4].result.series[0].unit),'20 minutes');
const headline=result=>renderToStaticMarkup(createElement(core.KpiTile,{result,series:result.series,height:168})).match(/class="kpi-value">([^<]*)</)?.[1];
assert.deepEqual(kpis.slice(0,5).map(kpi=>headline(kpi.result)),['96','97','9','26','20']);
for(const value of [0,27,1250]) {
 const result=structuredClone(kpis[4].result);result.meta.summary.headlineValue=value;
 assert.equal(headline(result),String(value),'Canonical Dwell headline has no suffix or numeric conversion');
}
const legacyDwell=structuredClone(kpis[4].result);delete legacyDwell.meta.summary.canonicalSnapshot;
assert.equal(headline(legacyDwell),'20 min','Legacy headline formatting is unchanged');
const otherMinutes=structuredClone(kpis[4].result);otherMinutes.series[0].id='other-minutes-kpi';
assert.equal(headline(otherMinutes),'20 min','Other minute-based KPIs are unchanged');
const percentage=structuredClone(kpis[4].result);percentage.series[0].unit='percentage';
assert.equal(headline(percentage),'20%','Percentage headlines retain their suffix');
assert.equal(kpis[5].result.series[0].data[0].label,'Payload Site Name');
assert.equal(kpis[5].result.series[0].data[0].x,'site:17');
assert.equal(core.projectKpis(fixture('site','17'))[5].result.series[0].data[0].x,'device:81');
assert.equal(kpis[6].result.meta.summary.headlineValue,125);
assert.equal(kpis[6].result.meta.summary.capacity_rolling_peak_pct,151);
for(const dwell of [0,27]){
 const value=fixture();value.payload.dwell_time_96[95]=dwell;
 const result=core.projectKpis(core.parseSnapshot(value))[4].result;
 assert.equal(value.payload.dwell_time_96[95],dwell);
 assert.equal(result.meta.summary.headlineValue,dwell);
 assert.equal(result.series[0].data[95].value,dwell);
}
for(const period of core.PERIOD_OPTIONS){
 const activity=core.projectActivity(snapshot,period.value);
 assert.equal(activity.series[2].data[0].occupancy_min,1);
 assert.equal(activity.series[2].data[0].occupancy_max,5);
 assert.equal(activity.series[2].data[0].value,3);
 assert.deepEqual(core.validateChartResult(activity),[]);
 const demographics=core.projectDemographics(snapshot.payload[period.value]);
 assert.deepEqual(demographics.map(d=>d.id),['age','sex']);
 assert.deepEqual(demographics.map(d=>d.result.series[0].data.length),[6,2]);
 assert.deepEqual(demographics[1].result.series[0].data.map(p=>[p.label,p.value]),[['Male',40],['Female',60]]);
}
assert.equal(core.PERIOD_OPTIONS.find(p=>p.value==='month').label,'Last Month');
assert.equal(core.PERIOD_OPTIONS.find(p=>p.value==='quarter').label,'Last Quarter');
const temporal=fixture();
temporal.ts='2026-09-16T13:07:00Z';
temporal.payload.today={...temporal.payload.today,entrances:Array(24).fill(17),exits:Array(24).fill(9),occupancy:Array.from({length:24},()=>[3,1,5])};
for(const period of ['today','week','year']) {
 temporal.payload[period].occupancy[1]=[0,0,0];
 const activity=core.projectActivity(temporal,period);
 const [entrances,exits,occupancy]=activity.series;
 const expectedLength={today:14,week:3,year:9}[period];
 assert.equal(occupancy.data.length,expectedLength);
 assert(occupancy.data.every(p=>Date.parse(p.x)<=Date.parse(temporal.ts)));
 assert.equal(occupancy.data[1].value,0,'Historical zero remains');
 assert.deepEqual(entrances.data.map(p=>p.value),temporal.payload[period].entrances);
 assert.deepEqual(exits.data.map(p=>p.value),temporal.payload[period].exits);
 assert.deepEqual(core.validateChartResult(activity),[]);
 const merged=core.buildCartesianDataset(activity.series).data;
 assert.equal(merged[expectedLength-1].occupancy,3,'Current partial bucket remains');
 assert.equal(merged[expectedLength].occupancy,undefined,'No future occupancy value reaches the renderer');
 assert.equal(temporal.payload[period].occupancy.length,entrances.data.length,'Source payload stays intact');
}
const year=core.projectActivity(temporal,'year');
assert.deepEqual(year.series[2].data.map(p=>new Date(p.x).getUTCMonth()),[0,1,2,3,4,5,6,7,8]);
const exact=fixture();exact.ts='2026-09-16T13:00:00Z';
assert.equal(core.projectActivity(exact,'today').series[2].data.at(-1).x,exact.ts.replace('Z','.000Z'));
for(const corrupt of [
 result=>{delete result.meta.summary.canonicalSnapshot;},
 result=>{result.meta.summary.chartStyle='unrelated';},
 result=>{result.series[1].data.pop();},
 result=>{result.series[2].data.shift();},
 result=>{result.series[2].data[0].value=NaN;},
]) {
 const invalid=structuredClone(year);corrupt(invalid);
 assert(core.validateChartResult(invalid).length>0,'Unrelated mismatches, wrong ordering and invalid values remain rejected');
}
for(const corrupt of [null,[],{scope:'organisation'},{scope:'organisation',entity_id:'1',entity_name:'Demo',ts:'now',payload:[]}]){
 assert.throws(()=>core.parseSnapshot(corrupt));
}
const obsolete=fixture();obsolete.payload.occupancy_96=Array(96).fill(2);
assert.throws(()=>core.projectKpis(core.parseSnapshot(obsolete)));
const context={organisation:{id:'1',name:'Renamed Demo',slug:'renamed-demo',enabled:true,realtime:true},sites:[{id:'17',organisation_id:'1',name:'New Site',slug:'new-site',enabled:false,realtime:true,max_capacity:2}]};
assert.equal(core.organisationPath(context),'/demo/renamed-demo/dashboard');
assert.equal(core.sitePath(context,'new-site'),'/demo/renamed-demo/new-site/dashboard');
assert.deepEqual(core.resolveSelection(context,'renamed-demo','new-site'),{scope:'site',id:'17'});
assert.equal(core.resolveSelection(context,'renamed-demo','foreign'),null);
assert.equal(core.resolveSelection(context,'foreign'),null);
assert.deepEqual(core.resolveSelection(context,'renamed-demo'),{scope:'organisation',id:'1'},'Generic organisation selection has no Demo default');
assert.equal(core.dashboardSearch('?org=2&viewToken=secret&embed=1'),'?embed=1');
console.log('Canonical projection, envelope parsing and slug selection assertions passed.');

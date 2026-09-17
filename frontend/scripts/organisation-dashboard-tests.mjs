import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
const output = new URL('../test-results/dashboard-core.mjs', import.meta.url);
await mkdir(new URL('../test-results/', import.meta.url), { recursive: true });
const compiled = await build({stdin:{contents:`export * from './src/features/organisation-dashboard/projection'; export * from './src/features/organisation-dashboard/selection'; export * from './src/features/organisation-dashboard/api';`,resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false,define:{'import.meta.env':'{}'}});
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
 const demographics=core.projectDemographics(snapshot.payload[period.value]);
 assert.deepEqual(demographics.map(d=>d.id),['age','sex']);
 assert.deepEqual(demographics.map(d=>d.result.series[0].data.length),[6,2]);
 assert.deepEqual(demographics[1].result.series[0].data.map(p=>[p.label,p.value]),[['Male',40],['Female',60]]);
}
for(const corrupt of [null,[],{scope:'organisation'},{scope:'organisation',entity_id:'1',entity_name:'Demo',ts:'now',payload:[]}]){
 assert.throws(()=>core.parseSnapshot(corrupt));
}
const obsolete=fixture();obsolete.payload.occupancy_96=Array(96).fill(2);
assert.throws(()=>core.projectKpis(core.parseSnapshot(obsolete)));
const context={organisation:{id:'1',name:'Renamed Demo',slug:'renamed-demo',enabled:true},sites:[{id:'17',organisation_id:'1',name:'New Site',slug:'new-site',enabled:false,max_capacity:2}]};
assert.equal(core.organisationPath(context),'/demo/renamed-demo/dashboard');
assert.equal(core.sitePath(context,'new-site'),'/demo/renamed-demo/new-site/dashboard');
assert.deepEqual(core.resolveSelection(context,'renamed-demo','new-site'),{scope:'site',id:'17'});
assert.equal(core.resolveSelection(context,'renamed-demo','foreign'),null);
assert.equal(core.resolveSelection(context,'foreign'),null);
assert.equal(core.dashboardSearch('?org=2&viewToken=secret&embed=1'),'?embed=1');
console.log('Canonical projection, envelope parsing and slug selection assertions passed.');

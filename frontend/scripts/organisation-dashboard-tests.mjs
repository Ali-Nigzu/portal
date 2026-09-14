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
 const rollup=n=>({entrances:Array(n).fill(17),occupancy:Array.from({length:n},()=>[2.75,1.25,4.5]),exits:Array(n).fill(9),age_pct:[1,2,3,4,5,85],sex_pct:[40,60]});
 const payload=Object.fromEntries(['entrances','occupancy','exits','footfall','dwell_time'].map((key,index)=>[key+'_96',Array.from({length:96},(_,i)=>index===4?150:i+index+0.25)]));
 Object.assign(payload,{traffic_devices:scope==='organisation'?[{site_id:'17',name:'Payload Site Name'}]:[{device_id:'81',name:'Door Camera'}],traffic_split_96:Array.from({length:96},()=>[100]),capacity:Array.from({length:96},()=>[125.5,151.25]),today:rollup(14),yesterday:rollup(24),week:rollup(7),month:rollup(4),quarter:rollup(12),year:rollup(12),all_time:rollup(3)});
 return {scope,entity_id:id,entity_name:'Snapshot Entity',ts:'2026-09-14T14:07:00+01:00',payload};
}
const snapshot=core.parseSnapshot(fixture());
const kpis=core.projectKpis(snapshot);
assert.equal(kpis.length,7);
for(const kpi of kpis.slice(0,5)) assert.equal(kpi.result.series[0].data.length,96);
assert.equal(kpis[0].result.series[0].data[95].x,'2026-09-14T13:00:00.000Z');
assert.equal(kpis[0].result.series[0].data[0].x,'2026-09-13T13:15:00.000Z');
assert.equal(kpis[1].result.meta.summary.headlineValue,96.25);
assert.equal(kpis[3].result.meta.summary.headlineValue,98.25);
assert.equal(kpis[4].result.meta.summary.headlineValue,2.5);
assert(kpis[4].result.series[0].data.every(p=>p.value===2.5));
assert.equal(kpis[5].result.series[0].data[0].label,'Payload Site Name');
assert.equal(kpis[5].result.series[0].data[0].x,'site:17');
assert.equal(core.projectKpis(fixture('site','17'))[5].result.series[0].data[0].x,'device:81');
assert.equal(kpis[6].result.meta.summary.headlineValue,125.5);
assert.equal(kpis[6].result.meta.summary.capacity_rolling_peak_pct,151.25);
for(const period of core.PERIOD_OPTIONS){
 const activity=core.projectActivity(snapshot,period.value);
 assert.equal(activity.series[2].data[0].occupancy_min,1.25);
 assert.equal(activity.series[2].data[0].value,2.75);
 const demographics=core.projectDemographics(snapshot.payload[period.value]);
 assert.deepEqual(demographics.map(d=>d.id),['age','sex']);
 assert.deepEqual(demographics.map(d=>d.result.series[0].data.length),[6,2]);
 assert.deepEqual(demographics[1].result.series[0].data.map(p=>[p.label,p.value]),[['Male',40],['Female',60]]);
}
for(const corrupt of [s=>s.payload.entrances_96.push(0),s=>s.payload.occupancy_96.pop(),s=>s.payload.capacity[95]=[1],s=>s.payload.today.age_pct.push(0),s=>s.payload.today.race_pct=[100],s=>s.ts='2026-09-14T13:00:00']){
 const value=fixture();corrupt(value);assert.throws(()=>core.parseSnapshot(value));
}
const context={organisation:{id:'1',name:'Renamed Demo',slug:'renamed-demo',enabled:true},sites:[{id:'17',organisation_id:'1',name:'New Site',slug:'new-site',enabled:false,max_capacity:2}]};
assert.equal(core.organisationPath(context),'/demo/renamed-demo/dashboard');
assert.equal(core.sitePath(context,'new-site'),'/demo/renamed-demo/new-site/dashboard');
assert.deepEqual(core.resolveSelection(context,'renamed-demo','new-site'),{scope:'site',id:'17'});
assert.equal(core.resolveSelection(context,'renamed-demo','foreign'),null);
assert.equal(core.resolveSelection(context,'foreign'),null);
assert.equal(core.dashboardSearch('?org=2&viewToken=secret&embed=1'),'?embed=1');
console.log('Canonical projection, validation and slug selection assertions passed.');

import type { SelectedSnapshot, Rollup } from '../src/features/organisation-dashboard/types';
export function snapshot(ts = '2026-03-29T03:30:00Z'): SelectedSnapshot {
  const rollup = (n: number): Rollup => ({ entrances: Array(n).fill(1), exits: Array(n).fill(0), occupancy: Array.from({length:n}, () => [20,10,30]), age_pct: [0,0,100,0,0,0], sex_pct:[50,50] });
  return { scope:'site',entity_id:'21',entity_name:'Test site',ts,payload:{
    entrances_96:Array(96).fill(1),exits_96:Array(96).fill(0),footfall_96:Array(96).fill(1),
    occupancy_96:Array.from({length:96},()=>[20,10,30]),dwell_time_96:Array(96).fill(4),
    capacity:Array.from({length:96},()=>[20,100]),traffic_devices:[],traffic_split_96:Array.from({length:96},()=>[]),
    today:rollup(24),yesterday:rollup(24),week:rollup(7),month:rollup(4),quarter:rollup(12),year:rollup(12),all_time:rollup(3),
  }};
}

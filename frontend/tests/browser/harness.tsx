// Test-only mount: exercises real production components and deliberately ignores
// AbortSignal in deferred responses, so generation/ownership guards are tested.
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import DocumentsPage from '../../src/features/documents/DocumentsPage';
import { PortalProvider, usePortal, type PortalSource } from '../../src/context/PortalContext';
import { useCanonicalDeviceList } from '../../src/features/devices/hooks/useCanonicalDeviceList';
import { snapshot } from '../fixtures';
import { buildReportData } from '../../src/features/reports/engine/ReportsEngine';
import { renderReportPdf } from '../../src/features/reports/pdf/renderReportPdf';
import OrganisationDashboardPage from '../../src/features/organisation-dashboard/OrganisationDashboardPage';

const queue: {url:string;method:string;signal?:AbortSignal;resolve:(response:Response)=>void}[]=[];
window.fetch=(input,init={})=>new Promise(resolve=>queue.push({url:String(input),method:init.method??'GET',signal:init.signal??undefined,resolve}));
const root=createRoot(document.getElementById('root')!);
const metadata={organisation:{id:'2',name:'Org',slug:'org',enabled:true,realtime:true},sites:[],sources:[],clock:{server_now:'2026-03-29T03:30:00Z',effective_now:'2026-03-29T03:30:00Z',time_zone:'Europe/London'}};
function DeviceProbe(){
  const state=useCanonicalDeviceList();
  return <><button onClick={state.refresh}>Refresh</button><button onClick={()=>void state.setEnabled(state.items[0],!state.items[0].displayed_enabled)} disabled={!state.items.length}>Toggle</button><output>{state.items.map(item=>String(item.displayed_enabled)).join(',')}</output><p>{state.error}</p>{state.items.map(item=><p key={item.ref}>{item.control_error}</p>)}</>;
}
function ReadyDevices(){return usePortal().context?<DeviceProbe/>:null;}
let overrides:Record<string,boolean>={};
const harness={
  pending:()=>queue.map(({url,method,signal})=>({url,method,aborted:signal?.aborted??false})),
  answer:(index:number,status:number,body:unknown)=>queue.splice(index,1)[0].resolve(new Response(status===204?null:JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}})),
  mount:(kind:string,mode:'canonical'|'simulated'='canonical')=>{
    if(kind==='documents'){root.render(<BrowserRouter><DocumentsPage/></BrowserRouter>);return;}
    overrides={};
    const source:PortalSource={context:async()=>metadata,snapshot:async()=>snapshot(),request:(path,_params,signal)=>fetch('/test'+path,{signal}),deviceControl:{mode,getOverrides:()=>overrides,setSourceEnabled:async(ref,enabled,signal)=>{
      if(mode==='simulated'){overrides={...overrides,[ref]:enabled};return{ref,enabled};}
      const response=await fetch('/test/control',{method:'PUT',signal});if(!response.ok)throw Error('Write failed');return response.json();
    }}};
    if(kind==='malformed'){
      const broken=snapshot(); broken.payload.today.occupancy=null as unknown as typeof broken.payload.today.occupancy;
      source.snapshot=async()=>({...broken,scope:'organisation',entity_id:'2'});
      root.render(<PortalProvider source={source} organisationId="2"><OrganisationDashboardPage/></PortalProvider>);return;
    }
    root.render(<PortalProvider source={source} organisationId="2"><ReadyDevices/></PortalProvider>);
  },
  unmount:()=>root.unmount(),
  pdf:(timeframe:'today'|'last_year')=>{
    const data=buildReportData(snapshot(),'site-activity',timeframe);
    const {doc,filename}=renderReportPdf(data,{heading:'Test site',organisationName:'Org',siteName:'Test site'},new Date('2026-03-29T03:30:00Z'));
    return {text:doc.output(),filename,pages:doc.getNumberOfPages()};
  },
};
declare global{interface Window{harness:typeof harness}}
window.harness=harness;

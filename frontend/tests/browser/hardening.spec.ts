import { test, expect, type Page } from '@playwright/test';
import { snapshot } from '../fixtures';
const doc={id:'doc1',accountId:'1',name:'old.pdf',type:'pdf',mimeType:'application/pdf',sizeBytes:42,createdAt:'2026-03-29T00:00:00Z',updatedAt:'2026-03-29T00:00:00Z'};
const device=(enabled:boolean)=>({scope:{organisation_id:'2',site_id:null},records_status:'available',items:[{ref:'device:210',kind:'device',site_id:'21',site_name:'Site',name:'Device',canonical_enabled:enabled,last_activity:null,runtime_state:'offline',records:3,records_status:'available'}]});
async function pending(page:Page,n:number){await expect.poll(()=>page.evaluate(()=>window.harness.pending().length)).toBe(n);}
async function answer(page:Page,index:number,status:number,body:unknown){await page.evaluate(({index,status,body})=>window.harness.answer(index,status,body),{index,status,body});}
async function harness(page:Page,kind:string,mode:'canonical'|'simulated'='canonical'){
  await page.goto('http://127.0.0.1:4100/tests/browser/harness.html');
  await page.evaluate(({kind,mode})=>window.harness.mount(kind,mode),{kind,mode});
}

test('Documents deletion invalidates an older list and retains confirmation after refresh failure',async({page})=>{
  await harness(page,'documents');await pending(page,1);await answer(page,0,200,{documents:[doc]});
  await expect(page.getByRole('heading',{name:'old.pdf'})).toBeVisible();
  await page.getByRole('button',{name:'Refresh',exact:true}).click();await pending(page,1);
  await page.getByRole('button',{name:'Delete old.pdf'}).click();await pending(page,2);await answer(page,1,204,null);
  await pending(page,2);await answer(page,1,503,{detail:'Unavailable'});
  await expect(page.getByRole('heading',{name:'old.pdf'})).toHaveCount(0);
  await answer(page,0,200,{documents:[doc]});await expect(page.getByRole('heading',{name:'old.pdf'})).toHaveCount(0);
  await expect(page.getByRole('alert')).toContainText('Unavailable');
});

test('Documents cleanup aborts an outstanding list',async({page})=>{
  await harness(page,'documents');await pending(page,1);await page.evaluate(()=>window.harness.unmount());
  expect(await page.evaluate(()=>window.harness.pending()[0].aborted)).toBe(true);
  await answer(page,0,200,{documents:[doc]});await expect(page.getByRole('heading',{name:'old.pdf'})).toHaveCount(0);
});

test('canonical device acknowledgement survives older reads and is superseded by a new read',async({page})=>{
  await harness(page,'devices');await pending(page,1);await answer(page,0,200,device(true));await expect(page.locator('output')).toHaveText('true');
  await page.getByRole('button',{name:'Refresh'}).click();await pending(page,1);
  await page.getByRole('button',{name:'Toggle'}).click();await pending(page,2);await answer(page,1,200,{ref:'device:210',enabled:false});
  await expect(page.locator('output')).toHaveText('false');await answer(page,0,200,device(true));await expect(page.locator('output')).toHaveText('false');
  await page.getByRole('button',{name:'Refresh'}).click();await pending(page,1);await answer(page,0,200,device(true));await expect(page.locator('output')).toHaveText('true');
  await page.getByRole('button',{name:'Toggle'}).click();await pending(page,1);await answer(page,0,503,{});await expect(page.locator('output')).toHaveText('true');
  await expect(page.getByText('Write failed')).toBeVisible();
});

test('Demo simulated device override remains separate from canonical reads',async({page})=>{
  await harness(page,'devices','simulated');await pending(page,1);await answer(page,0,200,device(true));
  await page.getByRole('button',{name:'Toggle'}).click();await expect(page.locator('output')).toHaveText('false');
  await page.getByRole('button',{name:'Refresh'}).click();await pending(page,1);await answer(page,0,200,device(true));await expect(page.locator('output')).toHaveText('false');
});

test('PDF rendering produces real pages and marks unavailable historical dwell',async({page})=>{
  await page.goto('http://127.0.0.1:4100/tests/browser/harness.html');
  const today=await page.evaluate(()=>window.harness.pdf('today'));expect(today.pages).toBeGreaterThan(0);expect(today.text).toContain('%PDF');expect(today.filename).toBe('Test-site-Site-Activity-Report.pdf');
  const historical=await page.evaluate(()=>window.harness.pdf('last_year'));expect(historical.text).toContain('Unavailable');expect(historical.text).not.toContain('NaN');
});

test('Dashboard error boundary encloses malformed projection code',async({page})=>{
  await harness(page,'malformed');
  await expect(page.getByRole('alert')).toContainText('Something went wrong.');
});

async function mockApp(page:Page,loggedIn=true){
  await page.route('**/api/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    if(path==='/api/me')return route.fulfill({status:loggedIn?200:401,json:loggedIn?{user:{id:'1',name:'Tester',email:'test@example.invalid',has_password:true}}:{detail:'Unauthorized'}});
    if(path==='/api/portal/organisations')return route.fulfill({json:{organisations:[]}});
    if(path==='/api/auth/providers')return route.fulfill({json:{providers:[]}});
    return route.fulfill({json:{documents:[],invitations:[],requests:[],memberships:[]}});
  });
}

test('production SPA logout failure preserves identity and supports successful retry',async({page})=>{
  await mockApp(page);let attempts=0;
  await page.route('**/api/logout',route=>route.fulfill({status:++attempts===1?503:204,body:''}));
  await page.goto('/documents');await expect(page.getByRole('heading',{name:'My Documents'})).toBeVisible();
  await page.getByRole('button',{name:'Open navigation',exact:true}).click();
  await page.getByRole('button',{name:'Logout',exact:true}).click();
  await expect(page.getByRole('button',{name:'Retry logout'})).toBeVisible();expect(new URL(page.url()).pathname).toBe('/documents');
  await expect(page.getByRole('heading',{name:'My Documents'})).toBeVisible();
  await page.getByRole('button',{name:'Retry logout'}).click();await expect(page).toHaveURL(/\/login$/);
});

test('blocked browser storage cannot break production login, Contact, or routing',async({page})=>{
  await page.addInitScript(()=>{
    for(const kind of ['localStorage','sessionStorage'])Object.defineProperty(window,kind,{get(){throw new DOMException('Blocked','SecurityError')}});
  });
  await mockApp(page,false);const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/login');await expect(page.getByRole('heading',{name:'Welcome Back'})).toBeVisible();
  await page.goto('/contact');await expect(page.locator('form')).toBeVisible();expect(errors).toEqual([]);
});

test('logout cancels an outstanding cookie-bearing profile write before clearing identity',async({page})=>{
  await mockApp(page);
  await page.route('**/api/settings/unlock/start',route=>route.fulfill({json:{ok:true,expiresInSeconds:600,resendCooldownSeconds:60}}));
  await page.route('**/api/settings/unlock/verify',route=>route.fulfill({json:{ok:true,unlockToken:'test-only-unlock',unlockExpiresInSeconds:300}}));
  let held:import('@playwright/test').Route|undefined;
  await page.route('**/api/me',async(route)=>{
    if(route.request().method()==='PUT'){held=route;return;}
    await route.fulfill({json:{user:{id:'1',name:'Tester',email:'test@example.invalid',has_password:true}}});
  });
  await page.route('**/api/logout',route=>route.fulfill({status:204,body:''}));
  await page.goto('/settings/account');await page.getByRole('button',{name:'Edit Username'}).click();
  await page.getByLabel('Current password',{exact:true}).fill('test-password');
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.getByLabel('Verification code',{exact:true}).fill('123456');await page.getByRole('button',{name:'Unlock',exact:true}).click();
  await page.getByLabel('Username',{exact:true}).fill('Changed');await page.getByRole('button',{name:'Save',exact:true}).click();
  await expect.poll(()=>Boolean(held)).toBe(true);
  if(!await page.getByRole('button',{name:'Logout',exact:true}).isVisible())
    await page.getByRole('button',{name:'Open navigation',exact:true}).click();
  await page.getByRole('button',{name:'Logout',exact:true}).click();
  await expect(page).toHaveURL(/\/login$/);
  await held!.fulfill({json:{user:{id:'1',name:'Changed',email:'test@example.invalid',has_password:true}},headers:{'Set-Cookie':'test-stale-cookie=should-not-arrive; Path=/'}}).catch(()=>{});
  await expect(page.getByRole('heading',{name:'Welcome Back'})).toBeVisible();
  expect((await page.context().cookies()).some(cookie=>cookie.name==='test-stale-cookie')).toBe(false);
});

test('blocked storage still permits valid Demo entry and exit',async({page})=>{
  await page.addInitScript(()=>{
    for(const kind of ['localStorage','sessionStorage'])Object.defineProperty(window,kind,{get(){throw new DOMException('Blocked','SecurityError')}});
  });
  await mockApp(page,false);
  await page.route('**/api/demo/session',route=>route.fulfill({json:{ok:true}}));
  await page.route('**/api/demo/portal/context',route=>route.fulfill({json:{organisation:{id:'1',name:'Demo',slug:'demo-org',enabled:true,realtime:true},sites:[{id:'21',name:'Test site',slug:'test-site',organisation_id:'1',enabled:true,realtime:true,max_capacity:100}],sources:[],clock:{server_now:'2026-03-29T03:30:00Z',effective_now:'2026-03-29T03:30:00Z',time_zone:'Europe/London'}}}));
  await page.route('**/api/demo/dashboard/sites/21/snapshot',route=>route.fulfill({json:snapshot()}));
  await page.goto('/demo/demo-org/test-site/dashboard');
  await expect(page.getByRole('heading',{name:'Test site',exact:true}).first()).toBeVisible();
  await page.getByRole('button',{name:'Exit demo',exact:true}).click();await expect(page).toHaveURL(/\/(home)?$/);
});

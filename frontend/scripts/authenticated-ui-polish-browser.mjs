import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { build } from "esbuild";
import { chromium } from "playwright";
import { expect } from "@playwright/test";
import { fixture } from "./organisation-dashboard-tests.mjs";
const base = process.env.PORTAL_BROWSER_BASE_URL ?? "http://127.0.0.1:3000";
const generated = ".tmp/authenticated-ui-polish";
await mkdir(generated, { recursive: true });
await build({ entryPoints: ["src/features/organisation-dashboard/recentPortalDestinations.ts"], outfile: `${generated}/recent.mjs`, bundle: true, format: "esm", platform: "node" });
const recent = await import(`../${generated}/recent.mjs`);
await build({entryPoints:["src/features/organisation-dashboard/favouriteScopesStorage.ts"],outfile:`${generated}/storage.mjs`,bundle:true,format:"esm",platform:"node"});
const storage = await import(`../${generated}/storage.mjs`);
let stored;
globalThis.localStorage = { getItem: () => stored, setItem: (_key, value) => stored = value };
const oid = "900000000000000101", sid = "900000000000000201";
const orgs = [
  { id: oid, name: "Demo", role: 0, sites: [{ id: sid, name: "Alis Barber" }, { id: "202", name: "Tokis Takeout" }] },
  { id: "2", name: "Second Org", role: 0, sites: [{ id: sid, name: "Alis Barber" }, { id: "203", name: "A deliberately very long canonical Site name that should wrap without hiding Status or Local Time" }] },
  { id: "3", name: "Empty Org", role: 0, sites: [] },
  { id: "4", name: "Single Site Org", role: 0, sites: [{ id: "204", name: "Only Site" }] }
];
const modules = ["dashboard", "event-logs", "alarm-logs", "device-list", "reports"], labels = ["Dashboard", "Event Logs", "Alarm Logs", "Device List", "Reports"];
for (let i = 0; i < modules.length; i++) {
  stored = JSON.stringify([{ organisationId: oid, module: modules[i], viewedAt: 1 }, { organisationId: oid, siteId: sid, module: modules[i], viewedAt: 2 }, { organisationId: "2", siteId: sid, module: modules[i], viewedAt: 3 }]);
  const before = stored;
  const result = recent.readRecentPortalDestinations(orgs);
  assert.deepEqual(result.map((x) => x.label), [`Demo \xB7 All Sites \xB7 ${labels[i]}`, `Demo \xB7 Alis Barber \xB7 ${labels[i]}`, `Second Org \xB7 Alis Barber \xB7 ${labels[i]}`]);
  assert.equal(result[1].path, `/sites/organisations/${oid}/sites/${sid}/${modules[i]}`);
  assert.equal(stored, before);
}
stored = JSON.stringify([{ organisationId: oid, siteId: "202", module: "reports", viewedAt: 1 }]);
assert.equal(recent.readRecentPortalDestinations(orgs)[0].label, "Demo \xB7 Tokis Takeout \xB7 Reports");
const renamed = structuredClone(orgs);
renamed[0].name = "dEMO renamed";
renamed[0].sites[1].name = "canonical lowercase";
assert.equal(recent.readRecentPortalDestinations(renamed)[0].label, "dEMO renamed \xB7 canonical lowercase \xB7 Reports");
assert.equal(recent.readRecentPortalDestinations(orgs.slice(1)).length, 0);
console.log("PASS Recently Viewed: five canonical labels, multi-org identities, renames and unchanged storage");
const saved = new Map();
globalThis.localStorage = {getItem:key=>saved.get(key)??null,setItem:(key,value)=>saved.set(key,value)};
const scopeRecord={organisationId:oid,scopeType:'site',scopeId:sid};
const recordKey=storage.favouriteStorageKey('user-A');
for(const record of ['{broken',JSON.stringify({version:2,scopes:[scopeRecord]}),JSON.stringify({version:1,scopes:null})]) {
  saved.set(recordKey,record);assert.equal(storage.readFavouriteScopes('user-A',orgs).keys.size,0);
}
saved.set(recordKey,JSON.stringify({version:1,scopes:[scopeRecord,scopeRecord,{...scopeRecord,scopeId:123},{...scopeRecord,scopeId:'missing'},{organisationId:oid,scopeType:'organisation',scopeId:'wrong'}]}));
assert.deepEqual([...storage.readFavouriteScopes('user-A',orgs).keys],[storage.favouriteScopeKey(oid,sid)]);
assert.equal(storage.readFavouriteScopes('user-B',orgs).keys.size,0);
assert.equal(storage.readFavouriteScopes('user-A',orgs.slice(1)).keys.size,0);
assert.equal(storage.readFavouriteScopes('user-A',orgs.map(o=>({...o,sites:[]}))).keys.size,0);
assert.equal(storage.readFavouriteScopes('user-A',renamed).keys.size,1);
assert(storage.writeFavouriteScopes('user-A',new Set([storage.favouriteScopeKey(oid),storage.favouriteScopeKey(oid,sid)]),orgs));
assert.deepEqual(JSON.parse(saved.get(recordKey)),{version:1,scopes:[{organisationId:oid,scopeType:'organisation',scopeId:oid},scopeRecord]});
globalThis.localStorage={getItem:()=>{throw new Error('blocked')},setItem:()=>{throw new Error('quota')}};
assert(storage.readFavouriteScopes('user-A',orgs).storageError);
assert.equal(storage.writeFavouriteScopes('user-A',new Set(),orgs),false);
console.log('PASS storage: version/schema, duplicates, stale scopes, renames, string IDs, user isolation and storage exceptions');
const browser = await chromium.launch({ headless: true, ...(process.env.PORTAL_BROWSER_EXECUTABLE ? { executablePath: process.env.PORTAL_BROWSER_EXECUTABLE } : {}) }), errors = [], requests = [];
const page = await browser.newPage({ viewport: { width: 1440, height: 1e3 } });
page.setDefaultTimeout(12e3);
page.on("pageerror", (e) => errors.push(e.message));
async function api(p) {
  await p.route("https://consent.cookiebot.com/**", (r) => r.abort());
  await p.route("**/api/**", async (r) => {
    const u = new URL(r.request().url()), p2 = u.pathname;
    if (!p2.startsWith("/api/")) return r.continue();
    requests.push({ url: u, method: r.request().method() });
    if (p2 === "/api/me") return r.fulfill({ json: { user: { id: "tester", name: "Tester", email: "tester@example.com" } } });
    if (p2 === "/api/portal/organisations") return r.fulfill({ json: { organisations: orgs } });
    const id = p2.match(/organisations\/(\d+)/)?.[1], org = orgs.find((o) => o.id === id);
    if (!org) return r.fulfill({ json: { documents: [] } });
    const siteId = u.searchParams.get("site_id") ?? p2.match(/sites\/(\d+)\/snapshot/)?.[1], site = org.sites.find((s) => s.id === siteId), scope2 = { organisation_id: id, site_id: siteId ?? null };
    const sources = org.sites.flatMap((s) => [{ ref: `device:${s.id}`, kind: "device", site_id: s.id, label: "Door Camera", analyzed_until: null }, { ref: `gateway:${s.id}`, kind: "gateway", site_id: s.id, label: "Gateway", analyzed_until: null }]);
    if (p2.endsWith("/context")) return r.fulfill({ json: { organisation: { ...org, enabled: true, realtime: false, slug: "demo" }, sites: org.sites.map((s) => ({ ...s, organisation_id: id, enabled: true, realtime: false, slug: s.id, max_capacity: 10 })), sources, clock: { server_now: "2026-10-06T12:00:00Z", effective_now: "2026-10-06T12:00:00Z", time_zone: "Europe/London" } } });
    const snap = fixture(site ? "site" : "organisation", site?.id ?? id);
    snap.entity_name = site?.name ?? org.name;
    if (p2.endsWith("/reports/snapshot")) return r.fulfill({ json: { scope: scope2, snapshot: snap } });
    if (p2.endsWith("/snapshot")) return r.fulfill({ json: snap });
    if (p2.endsWith("/devices")) return r.fulfill({ json: { scope: scope2, items: [], records_status: "available" } });
    if (p2.endsWith("/alarms")) return r.fulfill({ json: { scope: scope2, active: { items: [] }, cleared: { items: [] } } });
    if (p2.endsWith("/events")) return r.fulfill({ json: { scope: scope2, total: 1, page: { next_cursor: null }, items: [{ event_id: "00000000-0000-4000-8000-123456789012", site: { id: site?.id ?? sid, name: site?.name ?? "Alis Barber" }, source: { ref: `device:${site?.id ?? sid}`, kind: "device", label: "Door Camera" }, timestamp: "2026-10-06T12:00:00Z", event: { value: "entrance", label: "Entrance" }, sex: { value: "male", label: "Male" }, age: { value: "26-45", label: "26\u201345" } }] } });
    return r.fulfill({ json: {} });
  });
}
await api(page);
const path = (id, site, module2 = "dashboard") => `/sites/organisations/${id}${site ? `/sites/${site}` : ""}/${module2}`;
const header = (p) => p.getByTestId("portal-scope-header"), star = (p) => header(p).locator(".authenticated-portal-favourite:visible");
async function open(p) {
  await p.locator(".authenticated-navigation__rail").hover({ position: { x: 10, y: 250 } });
}
async function module(p, name) {
  await open(p);
  await p.locator(".authenticated-navigation__secondary").getByRole("button", { name, exact: true }).click();
}
async function scope(p, org, site) {
  await open(p);
  await p.locator(".authenticated-navigation__primary").getByRole("button", { name: org.name, exact: true }).click();
  await p.getByRole("navigation", { name: `${org.name} scope selector` }).getByRole("button", { name: site?.name ?? "All Sites", exact: true }).click();
  await p.keyboard.press("Escape");
  await expect(p).toHaveURL(new RegExp(`/organisations/${org.id}${site ? `/sites/${site.id}` : ""}/`));
}
try {
  await page.goto(base + path(oid));
  await expect(star(page)).toHaveAttribute("aria-pressed", "false");
  await expect(header(page)).toContainText("System status: ON");
  await expect(header(page)).toContainText("Local time:");
  assert.equal(await page.locator(".authenticated-navigation .authenticated-portal-favourite").count(), 0);
  await star(page).focus();
  await page.keyboard.press("Enter");
  await expect(star(page)).toHaveAttribute("aria-label", "Remove All Sites from favourites");
  await expect(star(page).locator("svg")).toHaveCSS("fill", "rgb(155, 116, 32)");
  const url = page.url();
  await star(page).focus();
  await page.keyboard.press("Space");
  await expect(star(page)).toHaveAttribute("aria-pressed", "false");
  await expect(page).toHaveURL(url);
  await expect(star(page)).toHaveCSS("outline-style", "solid");
  await star(page).click();
  for (let i = 0; i < modules.length; i++) {
    await module(page, labels[i]);
    await expect(page).toHaveURL(base + path(oid, void 0, modules[i]));
    await expect(star(page)).toHaveAttribute("aria-pressed", "true");
    await expect(header(page)).toContainText("Local time:");
    await expect(page.locator(".authenticated-navigation__pod")).toHaveCount(0);
  }
  await scope(page, orgs[0], orgs[0].sites[0]);
  await expect(star(page)).toHaveAttribute("aria-pressed", "false");
  await star(page).click();
  await scope(page, orgs[0], orgs[0].sites[1]);
  await expect(star(page)).toHaveAttribute("aria-pressed", "false");
  await scope(page, orgs[1], orgs[1].sites[0]);
  await expect(star(page)).toHaveAttribute("aria-pressed", "false");
  await star(page).click();
  await scope(page, orgs[1]);
  await expect(star(page)).toHaveAttribute("aria-pressed", "false");
  await scope(page, orgs[0]);
  await expect(star(page)).toHaveAttribute("aria-pressed", "true");
  await scope(page, orgs[0], orgs[0].sites[0]);
  await expect(star(page)).toHaveAttribute("aria-pressed", "true");
  console.log("PASS favourites: page metadata placement, keyboard/focus, five modules and independent multi-org scopes");
  async function home() {await open(page);await page.locator('.authenticated-navigation__primary').getByRole('button',{name:'Home',exact:true}).click();await expect(page.getByTestId('home-favourites')).toBeVisible();}
  await home();
  const favourites=page.getByTestId('home-favourites');
  await expect(favourites.getByRole('button')).toHaveCount(3);
  await expect(favourites.getByRole('button')).toHaveText(['DemoAll Sites','DemoAlis Barber','Second OrgAlis Barber']);
  await favourites.getByRole('button',{name:'Demo Alis Barber',exact:true}).click();
  await expect(page).toHaveURL(base+path(oid,sid));
  await star(page).click();await home();
  await expect(favourites.getByRole('button')).toHaveCount(2);
  await expect(favourites.getByRole('button',{name:'Demo Alis Barber',exact:true})).toHaveCount(0);
  await favourites.getByRole('button',{name:'Demo All Sites',exact:true}).click();await expect(page).toHaveURL(base+path(oid));
  await page.reload();await expect(star(page)).toHaveAttribute('aria-pressed','true');
  await scope(page,orgs[0],orgs[0].sites[0]);await star(page).click();await home();
  await expect(favourites.getByRole('button',{name:'Demo Alis Barber',exact:true})).toBeVisible();
  await scope(page,orgs[2]);await star(page).click();await home();
  await expect(favourites.getByRole('button',{name:'Empty Org All Sites',exact:true})).toBeVisible();
  await favourites.getByRole('button',{name:'Empty Org All Sites',exact:true}).click();await expect(page).toHaveURL(base+path('3'));
  await star(page).click();await scope(page,orgs[0],orgs[0].sites[0]);
  console.log('PASS Home: shared live state, star/unstar, All Sites, duplicate Site names, catalogue order and Dashboard destinations');
  await module(page, "Event Logs");
  await expect(page.getByRole("columnheader", { name: "Device", exact: true })).toBeVisible();
  await expect(page.locator('label[for="portal-sources"]')).toHaveText("Device");
  await expect(page.locator(".event-devices-trigger")).toContainText("All Devices");
  await page.locator(".event-devices-trigger").click();
  await page.getByRole("option", { name: "Door Camera", exact: true }).click();
  await expect(page.locator(".event-devices-trigger", { hasText: "1 device selected" })).toBeVisible();
  await page.getByRole("option", { name: "Gateway", exact: true }).click();
  await expect(page.locator(".event-devices-trigger", { hasText: "2 devices selected" })).toBeVisible();
  await page.locator(".event-devices-trigger", { hasText: "2 devices selected" }).click();
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect.poll(() => requests.filter((r) => r.url.pathname.endsWith("/events")).at(-1)?.url.searchParams.getAll("source")).toEqual([`device:${sid}`, `gateway:${sid}`]);
  const filtered = requests.filter((r) => r.url.pathname.endsWith("/events")).at(-1).url;
  assert.equal(filtered.searchParams.get("site_id"), sid);
  assert(filtered.pathname.includes(oid));
  assert(!filtered.searchParams.has("device"));
  await module(page, "Alarm Logs");
  await expect(page.locator('label[for="portal-sources"]')).toHaveText("Sources");
  await expect(page.locator(".event-devices-trigger", { hasText: "All sources" })).toBeVisible();
  console.log("PASS Event Logs: Device copy, plural selections, unchanged source requests and Alarm terminology");
  const calendly = "https://calendly.com/cameraoperatingsystems/camos-site-setup-appointment";
  await page.context().route("https://calendly.com/**", (r) => r.fulfill({ body: "Scheduling test" }));
  for (const org of orgs) {
    await open(page);
    await page.locator(".authenticated-navigation__primary").getByRole("button", { name: org.name, exact: true }).click();
    const panel = page.getByRole("navigation", { name: `${org.name} scope selector` });
    const children = await panel.locator(".authenticated-navigation__panel-list").evaluate((el) => [...el.children].map((n) => ({ text: n.textContent.trim(), divider: n.classList.contains("authenticated-navigation__scope-divider") })));
    assert.equal(children[0].text, "All Sites");
    assert(children[1].divider);
    assert.deepEqual(children.slice(2, -1).map((c) => c.text), org.sites.map((s) => s.name));
    assert.equal(children.at(-1).text, "Add Site");
    const link2 = panel.getByRole("link", { name: "Add Site" });
    await expect(link2).toHaveAttribute("href", calendly);
    await expect(link2).toHaveAttribute("target", "_blank");
    await expect(link2).toHaveAttribute("rel", "noopener noreferrer");
    assert.equal(await link2.getAttribute("aria-current"), null);
    const before2 = page.url();
    await link2.focus();
    const popup = page.waitForEvent("popup");
    await page.keyboard.press("Enter");
    const tab2 = await popup;
    await tab2.waitForURL(calendly);
    await tab2.close();
    await expect(page).toHaveURL(before2);
    await expect(panel).toBeVisible();
    await page.keyboard.press("Escape");
  }
  console.log("PASS Add Site: zero/one/many Sites, divider/order, keyboard new tab and unchanged route/stage");
  await scope(page, orgs[2]);
  await module(page, "Event Logs");
  await page.locator(".event-devices-trigger").click();
  await expect(page.getByText("No devices in this scope.", { exact: true })).toBeVisible();
  await page.locator(".event-devices-trigger").click();
  await page.goto(base + path(oid, sid, "event-logs") + "?source=device%3A999");
  await expect(page.getByText("The requested device is unavailable in this Portal scope.", { exact: true })).toBeVisible();
  for (const destination of ["Home", "Documents"]) {
    await open(page);
    await page.locator(".authenticated-navigation__primary").getByRole("button", { name: destination, exact: true }).click();
    await expect(page.getByRole("heading",{name:destination === "Home" ? "Welcome Tester" : "My Documents",exact:true})).toBeVisible();
    await expect(page.getByTestId("portal-scope-header")).toHaveCount(0);
    await expect(page.locator(".authenticated-portal-favourite")).toHaveCount(0);
  }
  await open(page);
  await page.locator(".authenticated-navigation__primary").getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "My Account", exact: true }).click();
  await expect(page.locator(".authenticated-portal-favourite")).toHaveCount(0);
  console.log("PASS isolation: empty/invalid Event device copy; no scope star on Home, Documents or Settings");
  await scope(page, orgs[1], orgs[1].sites[1]);
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1e3 });
    await expect(star(page)).toBeVisible();
    const box = await star(page).boundingBox();
    assert(box.width >= 24 && box.height >= 24 && box.width <= 24 && box.height <= 24);
    await expect(star(page).locator('svg')).toHaveAttribute('width', '16');
    await expect(star(page)).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
    const placement = await star(page).evaluate(button => ({previous: button.previousElementSibling?.textContent, parent:button.parentElement.textContent}));
    assert(placement.previous?.includes('Local time:') || placement.parent.includes('Local time:'));
    const row = header(page).locator('.vrm-dashboard-header:visible, .vrm-dashboard-header-mobile:visible');
    const beforeHeight=(await row.boundingBox()).height;
    await star(page).evaluate(button=>button.style.display='none');
    assert.equal((await row.boundingBox()).height,beforeHeight,'utility star must not increase header height');
    await header(page).locator('.vrm-dashboard-header:visible .authenticated-portal-favourite, .vrm-dashboard-header-mobile:visible .authenticated-portal-favourite').evaluate(button=>button.style.display='');
    const metrics = await header(page).evaluate((el) => ({ width: el.clientWidth, scroll: el.scrollWidth }));
    assert(metrics.scroll <= metrics.width + 1, "long names must not overflow the scope header");
    await expect(header(page).locator(".vrm-dashboard-header:visible, .vrm-dashboard-header-mobile:visible")).toContainText("Local time:");
  }
  await page.screenshot({ path: "/tmp/portal-polish-long-site.png", fullPage: true });
  const touch = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await api(touch);
  await touch.context().route("https://calendly.com/**", (r) => r.fulfill({ body: "Scheduling test" }));
  await touch.goto(base + path(oid, sid, "event-logs"));
  await star(touch).tap();
  await expect(star(touch)).toHaveAttribute("aria-pressed", "true");
  await expect(touch.locator(".authenticated-navigation__pod")).toHaveCount(0);
  await touch.locator(".authenticated-navigation__rail-trigger").tap();
  await touch.getByRole("button", { name: "Change scope for Demo" }).tap();
  const link = touch.getByRole("link", { name: "Add Site" }), pending = touch.waitForEvent("popup"), before = touch.url();
  await link.tap();
  const tab = await pending;
  await tab.waitForURL(calendly);
  await tab.close();
  await expect(touch).toHaveURL(before);
  await expect(touch.getByRole("navigation", { name: "Demo scope selector" })).toBeVisible();
  await touch.close();
  console.log("PASS responsive/touch: long names preserve metadata; star and Add Site activate without scope changes");
  await writeFile(`${generated}/context.tsx`, `import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {AuthenticatedApplicationProvider,useAuthenticatedApplication} from '../../src/context/AuthenticatedApplicationContext';
 const initial=${JSON.stringify(orgs)};
 function Probe(){const c=useAuthenticatedApplication();return <><button onClick={()=>c.toggleScopeFavourite('${oid}','${sid}')}>Toggle</button><button onClick={()=>c.toggleScopeFavourite('999','999')}>Invalid</button><output>{String(c.isScopeFavourite('${oid}','${sid}'))}</output><span data-testid='storage-error'>{String(c.favouriteStorageError)}</span></>}
 function App(){const [ready,setReady]=useState(!location.search.includes('pending'));const [user,setUser]=useState({id:'1',name:'Tester',email:'tester@example.com'});const [organisations,setOrganisations]=useState(initial);return <><button onClick={()=>setReady(true)}>Catalogue ready</button><button onClick={()=>setUser({...user,id:'2'})}>Change user</button><button onClick={()=>setUser({...user,id:'1'})}>First user</button><button onClick={()=>setOrganisations(initial.map(o=>({...o,name:'renamed',sites:o.sites.map(s=>({...s,name:'renamed'}))})))}>Rename</button><button onClick={()=>setOrganisations(initial.filter(o=>o.id!=='${oid}'))}>Remove</button><button onClick={()=>setOrganisations(initial)}>Restore</button><button onClick={()=>setOrganisations(initial.map(o=>o.id==='${oid}'?{...o,sites:[]}:o))}>Remove Site</button><AuthenticatedApplicationProvider user={user} organisations={organisations} refreshOrganisations={async()=>{}} favouritesCatalogueReady={ready}><Probe/></AuthenticatedApplicationProvider></>};createRoot(document.getElementById('root')).render(<App/>);`);
  await page.route("**/__polish-context*", (r) => r.fulfill({ contentType: "text/html", body: `<div id="root"></div><script type="module">import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;<\/script><script type="module" src="/${generated}/context.tsx"><\/script>` }));
  await page.goto(base + "/__polish-context");
  await expect(page.locator("output")).toHaveText("false");
  await page.getByRole("button", { name: "Invalid", exact: true }).click();
  await expect(page.locator("output")).toHaveText("false");
  await page.getByRole("button", { name: "Toggle", exact: true }).click();
  await expect(page.locator("output")).toHaveText("true");
  await page.getByRole("button", { name: "Rename", exact: true }).click();
  await expect(page.locator("output")).toHaveText("true");
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(page.locator("output")).toHaveText("false");
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(page.locator("output")).toHaveText("false");
  await page.getByRole("button", { name: "Toggle", exact: true }).click();
  await expect(page.locator("output")).toHaveText("true");
  await page.getByRole("button", { name: "Change user", exact: true }).click();
  await expect(page.locator("output")).toHaveText("false");
  await page.getByRole("button",{name:"First user",exact:true}).click();
  await expect(page.locator("output")).toHaveText("true");
  await page.reload();
  await expect(page.locator("output")).toHaveText("true");
  await page.getByRole("button", { name: "Remove Site", exact: true }).click();
  await expect(page.locator("output")).toHaveText("false");
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(page.locator("output")).toHaveText("false");
  await page.getByRole("button", { name: "Toggle", exact: true }).click();
  await expect(page.locator("output")).toHaveText("true");
  await page.reload();
  await expect(page.locator("output")).toHaveText("true");
  const saved = await page.evaluate(() => localStorage.getItem('camos_authenticated_favourites_v1:1'));
  await page.goto(base + "/__polish-context?pending");
  await expect(page.locator("output")).toHaveText("false");
  await page.getByRole("button", { name: "Toggle", exact: true }).click();
  assert.equal(await page.evaluate(() => localStorage.getItem('camos_authenticated_favourites_v1:1')), saved);
  await page.getByRole("button", { name: "Catalogue ready", exact: true }).click();
  await expect(page.locator("output")).toHaveText("true");
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException('Storage blocked', 'QuotaExceededError'); }; });
  await page.getByRole("button", { name: "Toggle", exact: true }).click();
  await expect(page.locator("output")).toHaveText("false");
  await expect(page.getByTestId("storage-error")).toHaveText("true");
  console.log("PASS hydration/failure: pending catalogue preserves storage; write failure keeps runtime toggle coherent");
  assert(!requests.some((r) => !["GET", "HEAD", "OPTIONS"].includes(r.method)));
  assert.deepEqual(errors, []);
  console.log("PASS favourite cleanup: invalid scopes rejected, rename retained, removed scope pruned, user change cleared");
  console.log("Authenticated UI polish checks passed.");
} catch (error) {
  console.error({url:page.url(),errors});
  console.error(await page.locator("body").innerText());
  await page.screenshot({ path: "/tmp/portal-polish-failure.png", fullPage: true });
  throw error;
} finally {
  await browser.close();
}

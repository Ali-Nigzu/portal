import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { expect } from '@playwright/test';
const base = process.env.PORTAL_BROWSER_BASE_URL ?? 'http://127.0.0.1:3000';
const directory = await mkdtemp(path.join(tmpdir(), 'portal-account-browser-'));
const runtime = spawn(process.env.PORTAL_TEST_PYTHON ?? 'python', ['-m','backend.tests.run_lifecycle_browser'], {
  cwd:path.resolve('..'), env:{...process.env,PORTAL_TEST_MAIL_DIR:directory}, stdio:['ignore','pipe','pipe'],
});
let runtimeLog = ''; runtime.stdout.on('data',data=>runtimeLog+=data); runtime.stderr.on('data',data=>runtimeLog+=data);
let browser;
const errors = [], output = 'test-results/account-lifecycle';
const code = async subject => {
  const messages = JSON.parse(await readFile(path.join(directory,'messages.json'),'utf8'));
  const message = messages.filter(message=>message.Subject.toLowerCase().includes(subject)).at(-1);
  assert(message,'Expected local Postmark request');const match=message.TextBody.match(/\b\d{6}\b/);assert(match);return match[0];
};
const signIn = async (page,identifier,password) => {
  await page.goto(`${base}/login`);await page.getByLabel('Email or username').fill(identifier);
  await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByLabel('Password',{exact:true}).fill(password);
  await page.getByRole('button',{name:'Login',exact:true}).click();await expect(page).toHaveURL(/\/home$/);
};
const unlock = async (page,password) => {
  await page.getByRole('button',{name:'Unlock to edit',exact:true}).click();const dialog=page.getByRole('dialog');
  await dialog.getByLabel('Current password',{exact:true}).fill(password);await dialog.getByRole('button',{name:'Continue',exact:true}).click();
  await expect(dialog.getByLabel('Verification code')).toBeVisible();await dialog.getByLabel('Verification code').fill(await code('unlock'));await dialog.getByRole('button',{name:'Unlock',exact:true}).click();await expect(dialog).toHaveCount(0);
};
try {
  await expect.poll(async()=>{if(runtime.exitCode!==null)throw new Error(runtimeLog);try{return (await fetch('http://127.0.0.1:8000/api/me')).status;}catch{return 0;}},{timeout:20000}).toBe(401);
  browser=await chromium.launch({headless:true,...(process.env.PORTAL_BROWSER_EXECUTABLE?{executablePath:process.env.PORTAL_BROWSER_EXECUTABLE}:{})});
  await mkdir(output,{recursive:true});const context=await browser.newContext({viewport:{width:1440,height:1000}});
  const page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',error=>errors.push(error.message));
  const email='browser-account@example.com',password='  browser123  ';
  await page.goto(`${base}/create-account`);await page.getByLabel('Username',{exact:true}).fill('browser-account');
  await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill(password);
  await page.getByLabel('Confirm password',{exact:true}).fill(password);await page.getByRole('button',{name:/create account/i}).click();
  await expect(page).toHaveURL(/\/verify-email\?/);await page.getByLabel('Verification code').fill(await code('verification'));
  await page.getByRole('button',{name:'Verify email',exact:true}).click();await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('status')).toContainText('Account verified');await signIn(page,'browser-account',password);
  assert.deepEqual((await (await page.request.get(`${base}/api/portal/organisations`)).json()).organisations,[]);
  const originalCookie=(await context.cookies()).find(cookie=>cookie.name==='camos_session');
  await page.goto(`${base}/settings/account`);await expect(page.getByRole('heading',{name:'Account details'})).toBeVisible();await unlock(page,password);
  await page.getByRole('button',{name:'Edit Username',exact:true}).click();await page.getByLabel('Username',{exact:true}).fill('renamed-browser');
  await page.getByRole('button',{name:'Save',exact:true}).click();await expect(page.getByRole('status')).toContainText('Account details saved');
  await page.getByRole('button',{name:'Lock editing',exact:true}).click();
  await expect(page.getByRole('button',{name:'Unlock to edit',exact:true})).toBeVisible();
  await page.goto(`${base}/home`);await expect(page.getByRole('heading',{name:'Welcome renamed-browser'})).toBeVisible();
  await page.goto(`${base}/settings/account`);await unlock(page,password);await page.getByRole('button',{name:'Edit phone',exact:true}).click();
  await page.getByLabel('Phone number',{exact:true}).fill('+447700900123');await page.getByRole('button',{name:'Save',exact:true}).click();
  await expect(page.getByText('+447700900123',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Edit phone',exact:true}).click();await page.getByLabel('Phone number',{exact:true}).fill('+15551234567');
  await page.getByRole('button',{name:'Save',exact:true}).click();await expect(page.getByText('+15551234567',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Edit phone',exact:true}).click();await page.getByLabel('Phone number',{exact:true}).fill('+447700900123');
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await expect(page.getByText('+447700900123',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Edit phone',exact:true}).click();
  await page.getByRole('button',{name:'Remove phone number',exact:true}).click();await page.getByRole('button',{name:'Save',exact:true}).click();
  await expect(page.getByText('Not added',{exact:true})).toBeVisible();await page.screenshot({path:`${output}/desktop.png`,fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:`${output}/mobile.png`,fullPage:true});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'No horizontal mobile overflow');
  await page.getByRole('button',{name:'Change password',exact:true}).click();await page.getByLabel('New password',{exact:true}).fill('new-browser-password');
  await page.getByLabel('Confirm new password',{exact:true}).fill('new-browser-password');await page.getByRole('button',{name:'Save password',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Password changed');const stale=await browser.newContext();await stale.addCookies([originalCookie]);
  assert.equal((await stale.request.get(`${base}/api/me`)).status(),401);await stale.close();await context.clearCookies();
  await page.goto(`${base}/login`);await page.getByLabel('Email or username').fill(email);await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.getByRole('link',{name:'Reset password',exact:true}).click();await expect(page).toHaveURL(/\/reset-password\/code\?/);
  await page.getByLabel('Verification code').fill(await code('reset'));await page.getByRole('button',{name:'Verify code',exact:true}).click();
  await expect(page).toHaveURL(/\/reset-password\/new\?email=/);assert(!page.url().includes('resetToken'));
  await page.getByLabel('New password',{exact:true}).fill('reset-browser-password');await page.getByLabel('Confirm password',{exact:true}).fill('reset-browser-password');
  await page.getByRole('button',{name:'Set new password',exact:true}).click();await expect(page.getByRole('status')).toContainText('Password reset successful');
  const old=await page.request.post(`${base}/api/login`,{headers:{'X-Requested-With':'camOS'},data:{identifier:email,password:'new-browser-password'}});assert.equal(old.status(),401);
  await signIn(page,email,'reset-browser-password');await page.goto(`${base}/settings/account`);await expect(page.getByText('renamed-browser',{exact:true})).toBeVisible();
  await page.reload();await expect(page.getByText('renamed-browser',{exact:true})).toBeVisible();await expect(page.getByText('Not added',{exact:true})).toBeVisible();
  assert.equal((await page.request.post(`${base}/api/logout`,{headers:{'X-Requested-With':'camOS'}})).status(),204);
  await signIn(page,'renamed-browser','reset-browser-password');await page.goto(`${base}/settings/account`);await expect(page.getByText('renamed-browser',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Unlock to edit',exact:true}).click();const dialog=page.getByRole('dialog');await expect(dialog.getByLabel('Current password',{exact:true})).toBeFocused();
  await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);assert.deepEqual(errors,[]);
  console.log('Canonical browser signup, Postmark HTTP stub, zero-org login, account edits, shell refresh, mobile, password change, reset and focus checks passed.');
} finally {
  await browser?.close();if(runtime.exitCode===null){const exited=once(runtime,'exit');runtime.kill('SIGINT');await exited;}
}

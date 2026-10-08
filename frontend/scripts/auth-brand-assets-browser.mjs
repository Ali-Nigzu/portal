import { expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const rootDir = path.resolve(process.cwd());
const baseUrl = "http://127.0.0.1:4174";
const screenshotsDir = path.join(rootDir, "artifacts", "auth-brand-assets");
const artwork = '[data-testid="auth-desktop-artwork"]';

const server = spawn(
  path.join(rootDir, "node_modules", ".bin", "vite"),
  ["--host", "127.0.0.1", "--port", "4174"],
  {
    cwd: rootDir,
    stdio: "inherit",
  },
);

const waitForServer = async () => {
  const started = Date.now();
  while (Date.now() - started < 30_000) {
    try {
      if ((await fetch(baseUrl)).ok) return;
    } catch {
      // Retry until Vite is ready.
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Timed out waiting for ${baseUrl}`);
};

const assertArtworkFillsPane = async (page, paneSelector) => {
  const pane = page.locator(paneSelector);
  const image = pane.locator(artwork);
  await expect(pane).toBeVisible();
  await expect(image).toHaveCount(1);
  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute("alt", "");
  await expect(image).toHaveAttribute("aria-hidden", "true");
  await expect(image).toHaveAttribute("draggable", "false");

  const geometry = await image.evaluate((node) => {
    const imageRect = node.getBoundingClientRect();
    const paneRect = node.parentElement?.getBoundingClientRect();
    const styles = getComputedStyle(node);
    return {
      image: { x: imageRect.x, y: imageRect.y, width: imageRect.width, height: imageRect.height },
      pane: paneRect && { x: paneRect.x, y: paneRect.y, width: paneRect.width, height: paneRect.height },
      objectFit: styles.objectFit,
      objectPosition: styles.objectPosition,
      src: node.getAttribute("src"),
    };
  });
  expect(geometry.pane).not.toBeNull();
  expect(geometry.objectFit).toBe("cover");
  expect(geometry.objectPosition).toBe("50% 50%");
  expect(geometry.src).toContain("auth-desktop-artwork");
  for (const key of ["x", "y", "width", "height"])
    expect(Math.abs(geometry.image[key] - geometry.pane[key])).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
};

const routes = [
  { path: "/login", pane: ".login-right-pane", control: "#login-email" },
  { path: "/create-account", pane: ".create-account-right-pane", control: "#create-username" },
  { path: "/verify-email?email=test%40example.com", pane: ".verify-email-right-pane", control: "#verify-code" },
  { path: "/reset-password?email=test%40example.com", pane: ".verify-email-right-pane", control: "#reset-code" },
  { path: "/reset-password/code?email=test%40example.com", pane: ".verify-email-right-pane", control: "#reset-code" },
  { path: "/reset-password/new?email=test%40example.com&resetToken=test-token", pane: ".verify-email-right-pane", control: "#reset-password" },
];

try {
  await mkdir(screenshotsDir, { recursive: true });
  await waitForServer();
  const browser = await chromium.launch({ headless: true, ...(process.env.PORTAL_BROWSER_EXECUTABLE ? { executablePath: process.env.PORTAL_BROWSER_EXECUTABLE } : {}) });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.route("**/api/me", (route) => route.fulfill({ status: 401, contentType: "application/json", body: "{}" }));

  for (const route of routes) {
    const page = await context.newPage();
    await page.goto(`${baseUrl}${route.path}`, { waitUntil: "networkidle" });
    await assertArtworkFillsPane(page, route.pane);
    await expect(page.locator('img[alt="camOS"]')).toHaveAttribute("src", /camos-logo/);
    await page.close();
  }

  const login = await context.newPage();
  await login.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });
  await login.locator("#login-email").fill("test@example.com");
  await login.getByRole("button", { name: "Continue" }).click();
  await expect(login.locator("#login-password")).toBeVisible();
  await assertArtworkFillsPane(login, ".login-right-pane");
  await login.screenshot({ path: path.join(screenshotsDir, "login-1440x900.png"), fullPage: true });
  await login.close();

  for (const excludedPath of ["/", "/contact", "/terms-and-conditions", "/privacy-policy", "/sub-processor-register", "/demo"]) {
    const page = await context.newPage();
    await page.goto(`${baseUrl}${excludedPath}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator(artwork)).toHaveCount(0);
    await page.close();
  }

  for (const route of routes) {
    const page = await context.newPage();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${baseUrl}${route.path}`, { waitUntil: "networkidle" });
    await expect(page.locator(route.pane)).toBeHidden();
    await expect(page.locator(artwork)).toBeHidden();
    await expect(page.locator(route.control)).toBeVisible();
    await expect(page.locator('img[alt="camOS"]')).toHaveAttribute("src", /camos-logo/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.close();
  }

  for (const width of [900, 901]) {
    const page = await context.newPage();
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });
    if (width === 900) {
      await expect(page.locator(".login-right-pane")).toBeHidden();
      await expect(page.locator(artwork)).toBeHidden();
    } else {
      await assertArtworkFillsPane(page, ".login-right-pane");
    }
    await page.screenshot({ path: path.join(screenshotsDir, `login-${width}x900.png`), fullPage: true });
    await page.close();
  }

  for (const viewport of [{ width: 1920, height: 1080 }, { width: 390, height: 844 }]) {
    const page = await context.newPage();
    await page.setViewportSize(viewport);
    await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });
    await page.screenshot({ path: path.join(screenshotsDir, `login-${viewport.width}x${viewport.height}.png`), fullPage: true });
    await page.close();
  }

  const authenticatedContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await authenticatedContext.route("**/api/me", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ user: { id: "1", name: "Test User", email: "test@example.com" } }),
  }));
  await authenticatedContext.route("**/api/portal/organisations", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ organisations: [] }),
  }));
  const authenticatedPage = await authenticatedContext.newPage();
  authenticatedPage.setDefaultTimeout(8_000);
  await authenticatedPage.goto(`${baseUrl}/home`, { waitUntil: "domcontentloaded" });
  await expect(authenticatedPage.locator(artwork)).toHaveCount(0);
  await expect(authenticatedPage.locator('img[alt="camOS"]')).toHaveAttribute("src", /camos-logo/);
  await authenticatedContext.close();

  await context.close();
  await browser.close();
  console.log("Auth brand asset browser checks passed.");
} finally {
  if (!server.killed) server.kill("SIGTERM");
}

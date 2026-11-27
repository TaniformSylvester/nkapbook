import { expect, test } from "@playwright/test";

test("home page fits a 360px phone and has big enough touch targets", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const small = await page.evaluate(() =>
    [...document.querySelectorAll("a,button,input")]
      .map((e) => e.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height < 44).length,
  );
  expect(small).toBe(0);
});

test("language switch changes the page to Pidgin and French", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "PID" }).click();
  await expect(page.getByRole("link", { name: "Sign in as official" })).toBeVisible();
  await page.getByRole("button", { name: "FR" }).click();
  await expect(page.getByRole("link", { name: "Connexion des responsables" })).toBeVisible();
});

test("official pages redirect to sign in", async ({ page }) => {
  await page.goto("/app");
  await expect(page).toHaveURL(/\/login$/);
});

test("login rejects a non-Cameroon number with a friendly message", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Your phone number").fill("12345");
  await page.getByRole("button", { name: "Send me a code" }).click();
  await expect(page.locator(".error")).toContainText("Cameroon phone number");
});

test("PWA manifest and service worker are served", async ({ page, request }) => {
  const m = await (await request.get("/manifest.webmanifest")).json();
  expect(m.display).toBe("standalone");
  expect(m.icons.some((i: { purpose: string }) => i.purpose === "maskable")).toBe(true);
  expect((await request.get("/sw.js")).ok()).toBe(true);
  await page.goto("/");
  expect(await page.evaluate(async () => !!(await navigator.serviceWorker.ready))).toBe(true);
});

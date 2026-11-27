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

test("group pages are private: signed-out visitors go to sign in", async ({ page }) => {
  for (const path of ["/app/new", "/app/g/00000000-0000-0000-0000-000000000000/members"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
  }
});

test("member link pages are private and never cached", async ({ request }) => {
  const res = await request.get("/m/not-a-real-token");
  expect(res.headers()["cache-control"]).toContain("no-store");
  expect(res.headers()["referrer-policy"]).toBe("no-referrer");
  expect(await res.text()).toContain("noindex");
});

test("automatic reminder job refuses callers without the secret", async ({ request }) => {
  expect((await request.get("/api/cron/reminders")).status()).toBe(401);
  expect((await request.get("/api/cron/reminders", { headers: { Authorization: "Bearer wrong" } })).status()).toBe(401);
});

test("exports and reminder links require sign-in", async ({ request }) => {
  const g = "00000000-0000-0000-0000-000000000000";
  for (const path of [`/app/g/${g}/export/ledger.csv`, `/app/g/${g}/reminders/send?m=${g}&d=2026-01-01&l=en`]) {
    const res = await request.get(path, { maxRedirects: 0 });
    expect(res.status()).toBe(307);
    expect(res.headers()["location"]).toContain("/login");
  }
});

test("public pages pass an automated accessibility scan (WCAG 2.1 AA) in all three languages", async ({ page, context }) => {
  const { default: AxeBuilder } = await import("@axe-core/playwright");
  for (const lang of ["en", "fr", "pcm"]) {
    await context.addCookies([{ name: "nk_lang", value: lang, url: "http://localhost:3100" }]);
    for (const path of ["/", "/login", "/offline", "/m/not-a-real-token"]) {
      await page.goto(path);
      const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
      expect(r.violations.map((v) => `${lang} ${path}: ${v.id}`)).toEqual([]);
    }
  }
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { writeFileSync } from "node:fs";
import en from "@/i18n/en";
import pcm from "@/i18n/pcm";

// The member page is a server component; stub its server-only dependencies.
vi.mock("server-only", () => ({}));
let view: unknown;
let lang: "en" | "pcm" = "pcm";
vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: () => ({ rpc: async () => ({ data: view, error: null }) }),
}));
vi.mock("@/lib/client-ip", () => ({ clientIp: async () => "127.0.0.1" }));
vi.mock("@/i18n/server", () => ({
  getT: async () => ({ lang, t: lang === "pcm" ? pcm : en }),
}));
vi.mock("@/app/m/[token]/actions", () => ({ confirmPayout: () => {} }));
vi.mock("@/components/actions", () => ({ setLang: () => {} }));

const TOKEN = "A".repeat(43);
const mary = {
  status: "ok",
  member: { name: "Mary Ndi", hands: 2, status: "active" },
  group: { name: "Unity Njangi", town: "Bamenda", language: "pcm" },
  totals: { paid: 45000, contribution_owing: 5000, credit: 0, fines_owing: 500, loans_owing: 0, events_owing: 0, received: 30000 },
  next: { date: "2027-03-07", collector: "Grace" },
  turns: [
    { position: 2, hand_no: 1, planned_date: "2027-01-03", meeting_date: "2027-01-03" },
    { position: 7, hand_no: 2, planned_date: "2027-03-14", meeting_date: null },
  ],
  payouts: [{ id: "p1", amount: 30000, method: "cash", date: "2027-01-03", confirmed_at: null }],
  history: [
    { id: "h1", kind: "contribution_paid", amount: 10000, method: "mtn_momo", date: "2027-02-07", correction: false, reason: null, corrected: false },
    { id: "h2", kind: "contribution_paid", amount: 9000, method: "cash", date: "2027-01-03", correction: true, reason: "Recorded twice", corrected: false },
    { id: "h3", kind: "contribution_paid", amount: 9000, method: "cash", date: "2027-01-03", correction: false, reason: null, corrected: true },
    { id: "h4", kind: "fine_charged", amount: 500, method: null, date: "2027-01-03", correction: false, reason: null, corrected: false },
  ],
};

async function render() {
  const { default: Page } = await import("@/app/m/[token]/page");
  return renderToStaticMarkup(await Page({ params: Promise.resolve({ token: TOKEN }) }));
}

describe("member page (My NkapBook)", () => {
  beforeEach(() => {
    view = mary;
    lang = "pcm";
  });

  it("shows totals, turn, payout confirmation and history in Pidgin", async () => {
    const html = await render();
    if (process.env.DUMP_HTML) writeFileSync(process.env.DUMP_HTML, html);
    expect(html).toContain("Hello Mary");
    expect(html).toContain("You don pay");
    expect(html).toContain("45,000 FCFA");
    expect(html).toContain("You dey owe");
    expect(html).toContain("5,500 FCFA"); // 5,000 contributions + 500 fine
    expect(html).toContain("Your turn na 14 March 2027");
    expect(html).toContain("Yes, I don receive 30,000 FCFA");
    expect(html).toContain("Correction");
    expect(html).toContain("Recorded twice");
    expect(html).toContain("Na Grace go chop for next meeting.");
  });

  it("shows a clear message when the link was reset", async () => {
    view = { status: "revoked" };
    lang = "en";
    expect(await render()).toContain("This link no longer works");
  });

  it("never shows other members' names beyond the next collector's first name", async () => {
    const html = await render();
    expect(html).not.toMatch(/Grace [A-Z]/);
  });
});

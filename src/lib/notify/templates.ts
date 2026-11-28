// Emails to the NkapBook admin. Group-level facts only (name, town, plan, dates, reference):
// never members' names or phone numbers, as the privacy policy says.
import { groupRef, subscriptionState } from "@/lib/subscription";
import type { Mail } from "./mail";

export const SITE = "https://nkapbook.com";

export type GroupRow = {
  id: string;
  name: string;
  town: string | null;
  plan: "pilot" | "free" | "trial" | "paid";
  paid_until: string | null;
  created_at: string;
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const oneLine = (s: string) => s.replace(/[\r\n\t]+/g, " ").trim().slice(0, 80);
const day = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
export const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const label = (g: GroupRow) => `${oneLine(g.name)}${g.town ? ` (${oneLine(g.town)})` : ""}`;

function layout(title: string, blocks: string[]) {
  return `<!doctype html><html><body style="margin:0;padding:16px;background:#f4f6f1;font-family:Arial,sans-serif;color:#1d2a22">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:20px">
<h1 style="font-size:18px;margin:0 0 12px;color:#0B5D3B">${esc(title)}</h1>
${blocks.join("\n")}
<p style="margin:20px 0 0"><a href="${SITE}/admin" style="background:#0B5D3B;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;display:inline-block">Open admin</a></p>
</div></body></html>`;
}

const groupLine = (g: GroupRow, extra: string) =>
  `<li style="margin:0 0 6px"><strong>${esc(label(g))}</strong> · ${esc(groupRef(g.id))}<br><span style="color:#5b6b60">${esc(extra)}</span></li>`;

export function newGroupMail(g: GroupRow): Mail {
  const facts = `Created ${day(g.created_at)} · ${g.plan === "trial" && g.paid_until ? `Trial until ${day(g.paid_until)}` : `Plan: ${g.plan}`} · Ref ${groupRef(g.id)}`;
  return {
    subject: `New njangi on NkapBook: ${label(g)}`,
    text: `A new group signed up on NkapBook.\n\n${label(g)}\n${facts}\n\nOpen admin: ${SITE}/admin\n`,
    html: layout("A new njangi signed up", [`<p style="margin:0 0 4px;font-size:16px"><strong>${esc(label(g))}</strong></p>`, `<p style="margin:0;color:#5b6b60">${esc(facts)}</p>`]),
  };
}

/** Groups whose trial or paid period ends exactly `days` days from today. */
export function endingOn(groups: GroupRow[], today: string, days = 7) {
  const target = addDays(today, days);
  return groups.filter((g) => (g.plan === "trial" || g.plan === "paid") && g.paid_until === target);
}

export function endingSoonMail(groups: GroupRow[], today: string, days = 7): Mail | null {
  if (groups.length === 0) return null;
  const when = day(addDays(today, days));
  const kind = (g: GroupRow) => (g.plan === "trial" ? "Free trial" : "Paid subscription");
  const lines = groups.map((g) => `${label(g)} · ${groupRef(g.id)} · ${kind(g)} ends ${when}`);
  return {
    subject: groups.length === 1 ? `Ends in ${days} days: ${label(groups[0]!)}` : `${groups.length} NkapBook plans end in ${days} days`,
    text: `These groups' plans end on ${when}. After that they get 14 days of grace, then new meetings pause.\n\n${lines.join("\n")}\n\nOpen admin: ${SITE}/admin\n`,
    html: layout(`Plans ending on ${when}`, [
      `<p style="margin:0 0 8px">After that they get 14 days of grace, then new meetings pause. A good time to say hello and explain how to pay.</p>`,
      `<ul style="padding-left:18px;margin:0">${groups.map((g) => groupLine(g, `${kind(g)} ends ${when}`)).join("")}</ul>`,
    ]),
  };
}

export function weeklySummary(groups: GroupRow[], today: string) {
  const weekAgo = addDays(today, -7);
  const in14 = addDays(today, 14);
  const created = groups.filter((g) => g.created_at.slice(0, 10) > weekAgo);
  const states = groups.map((g) => ({ g, s: subscriptionState(g, today) }));
  const ending = states.filter(({ g, s }) => (s.kind === "trial" || s.kind === "active") && g.paid_until! <= in14);
  const grace = states.filter(({ s }) => s.kind === "grace");
  const paused = states.filter(({ s }) => s.kind === "locked");
  const count = (p: GroupRow["plan"]) => groups.filter((g) => g.plan === p).length;
  return {
    created: created.length, ending: ending.length, grace: grace.length, paused: paused.length,
    totals: { all: groups.length, trial: count("trial"), paid: count("paid"), pilot: count("pilot"), free: count("free") },
    lists: { created, ending: ending.map((x) => x.g), grace: grace.map((x) => x.g), paused: paused.map((x) => x.g) },
  };
}

export function weeklyMail(groups: GroupRow[], today: string): Mail {
  const w = weeklySummary(groups, today);
  const t = w.totals;
  const totals = `${t.all} groups: ${t.paid} paid, ${t.trial} on trial, ${t.pilot} pilot, ${t.free} free`;
  const section = (title: string, list: GroupRow[], extra: (g: GroupRow) => string) =>
    list.length === 0
      ? { text: `${title}: none`, html: `<h2 style="font-size:15px;margin:16px 0 6px">${esc(title)}: none</h2>` }
      : {
          text: `${title} (${list.length}):\n${list.map((g) => `- ${label(g)} · ${groupRef(g.id)} · ${extra(g)}`).join("\n")}`,
          html: `<h2 style="font-size:15px;margin:16px 0 6px">${esc(title)} (${list.length})</h2><ul style="padding-left:18px;margin:0">${list.map((g) => groupLine(g, extra(g))).join("")}</ul>`,
        };
  const parts = [
    section("New this week", w.lists.created, (g) => `created ${day(g.created_at)}`),
    section("Ending in the next 14 days", w.lists.ending, (g) => `${g.plan === "trial" ? "trial" : "paid"} until ${day(g.paid_until!)}`),
    section("In grace (ended, meetings still open)", w.lists.grace, (g) => `ended ${day(g.paid_until!)}`),
    section("Paused (new meetings stopped)", w.lists.paused, (g) => (g.paid_until ? `ended ${day(g.paid_until)}` : "no end date")),
  ];
  return {
    subject: `NkapBook weekly: ${w.created} new, ${w.ending} ending soon, ${w.paused} paused`,
    text: `NkapBook weekly summary, ${day(today)}\n${totals}\n\n${parts.map((p) => p.text).join("\n\n")}\n\nOpen admin: ${SITE}/admin\n`,
    html: layout(`Weekly summary · ${day(today)}`, [`<p style="margin:0;color:#5b6b60">${esc(totals)}</p>`, ...parts.map((p) => p.html)]),
  };
}

export const testMail = (): Mail => ({
  subject: "NkapBook test email",
  text: `It works. NkapBook can send you notifications.\n\nOpen admin: ${SITE}/admin\n`,
  html: layout("It works", ["<p style=\"margin:0\">NkapBook can send you notifications: new groups, plans ending soon, and a weekly summary every Monday.</p>"]),
});

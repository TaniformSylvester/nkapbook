import { describe, expect, it } from "vitest";
import { endingOn, endingSoonMail, newGroupMail, weeklyMail, weeklySummary, type GroupRow } from "@/lib/notify/templates";

const g = (o: Partial<GroupRow>): GroupRow => ({
  id: "9d51176a-dc89-49b2-a5a3-04d1f9353530", name: "Unity Njangi", town: "Bamenda", plan: "trial",
  paid_until: "2027-01-27", created_at: "2026-11-28T10:00:00Z", ...o,
});
const today = "2026-11-30"; // a Monday

describe("admin emails", () => {
  it("new group email has the name, town, trial end and reference, and nothing about members", () => {
    const m = newGroupMail(g({}));
    expect(m.subject).toBe("New njangi on NkapBook: Unity Njangi (Bamenda)");
    expect(m.text).toContain("Trial until 27 Jan 2027");
    expect(m.text).toContain("NKAP-9D5117");
    expect(m.html).toContain("https://nkapbook.com/admin");
  });

  it("escapes what groups type in, and keeps the subject on one line", () => {
    const m = newGroupMail(g({ name: "<script>x</script>\r\nBcc: evil@example.com", town: null }));
    expect(m.html).not.toContain("<script>");
    expect(m.subject).not.toMatch(/[\r\n]/);
  });

  it("plans ending in exactly 7 days (trial or paid only)", () => {
    const groups = [
      g({ id: "a".repeat(8) + "-0000-0000-0000-000000000000", paid_until: "2026-12-07" }),
      g({ id: "b".repeat(8) + "-0000-0000-0000-000000000000", plan: "paid", paid_until: "2026-12-07" }),
      g({ id: "c".repeat(8) + "-0000-0000-0000-000000000000", paid_until: "2026-12-08" }),
      g({ id: "d".repeat(8) + "-0000-0000-0000-000000000000", plan: "pilot", paid_until: "2026-12-07" }),
    ];
    const due = endingOn(groups, today);
    expect(due.map((x) => x.id[0])).toEqual(["a", "b"]);
    expect(endingSoonMail(due, today)!.subject).toBe("2 NkapBook plans end in 7 days");
    expect(endingSoonMail([], today)).toBeNull();
  });

  it("weekly summary counts new, ending, grace and paused groups", () => {
    const groups = [
      g({ created_at: "2026-11-28T10:00:00Z" }), // new, trial until Jan
      g({ plan: "paid", paid_until: "2026-12-10", created_at: "2026-09-01T00:00:00Z" }), // ending within 14 days
      g({ plan: "paid", paid_until: "2026-11-25", created_at: "2026-08-01T00:00:00Z" }), // grace
      g({ plan: "trial", paid_until: "2026-11-01", created_at: "2026-09-02T00:00:00Z" }), // paused
      g({ plan: "pilot", paid_until: null, created_at: "2026-07-01T00:00:00Z" }),
    ];
    const w = weeklySummary(groups, today);
    expect([w.created, w.ending, w.grace, w.paused]).toEqual([1, 1, 1, 1]);
    expect(w.totals).toEqual({ all: 5, trial: 2, paid: 2, pilot: 1, free: 0 });
    expect(weeklyMail(groups, today).subject).toBe("NkapBook weekly: 1 new, 1 ending soon, 1 paused");
  });
});

import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toCsv } from "@/lib/csv";
import { supabaseServer } from "@/lib/supabase/server";

const FILES = ["ledger", "members", "meetings", "attendance", "loans", "fines"] as const;
type File = (typeof FILES)[number];

/** PostgREST returns at most 1000 rows per request: page through everything. */
async function all<T>(q: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await q(from, from + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

async function build(sb: SupabaseClient, gid: string, file: File): Promise<string> {
  const members = await all<{ id: string; name: string; phone: string | null; user_id: string | null; hands: number; role: string; status: string }>(
    (a, b) => sb.from("members").select("id, name, phone, user_id, hands, role, status").eq("group_id", gid).order("name").range(a, b));
  const name = new Map(members.map((m) => [m.id, m.name]));
  const byUser = new Map(members.filter((m) => m.user_id).map((m) => [m.user_id!, m.name]));
  const meetings = await all<{ id: string; date: string; status: string; minutes: string | null }>(
    (a, b) => sb.from("meetings").select("id, date, status, minutes").eq("group_id", gid).order("date").range(a, b));
  const mdate = new Map(meetings.map((m) => [m.id, m.date]));

  switch (file) {
    case "ledger": {
      type E = { id: string; recorded_at: string; client_recorded_at: string | null; meeting_id: string | null; member_id: string | null; account: string; kind: string; amount: number; method: string | null; momo_ref: string | null; note: string | null; reverses_entry_id: string | null; reason: string | null; recorded_by: string | null; fine_id: string | null; loan_id: string | null; event_id: string | null };
      const rows = await all<E>((a, b) => sb.from("ledger_entries").select("*").eq("group_id", gid).order("recorded_at").range(a, b));
      const { data: g } = await sb.from("groups").select("currency").eq("id", gid).maybeSingle();
      const cur = (g?.currency as string | undefined) ?? "XAF";
      return toCsv(
        ["entry_id", "recorded_at", "meeting_date", "member", "account", "kind", "amount", "signed_amount", "currency", "method", "momo_ref", "note", "corrects_entry", "correction_reason", "recorded_by", "fine_id", "loan_id", "event_id"],
        rows.map((e) => [e.id, e.recorded_at, e.meeting_id ? mdate.get(e.meeting_id) : "", e.member_id ? name.get(e.member_id) : "", e.account, e.kind,
          e.amount, e.reverses_entry_id ? -e.amount : e.amount, cur, e.method, e.momo_ref, e.note, e.reverses_entry_id, e.reason,
          e.recorded_by ? byUser.get(e.recorded_by) ?? e.recorded_by : "", e.fine_id, e.loan_id, e.event_id]),
      );
    }
    case "members": {
      const bal = await all<{ member_id: string; contribution_owing: number; fines_owing: number; loans_owing: number; events_owing: number; contributions_paid: number; savings: number }>(
        (a, b) => sb.from("member_balances").select("*").eq("group_id", gid).range(a, b));
      const bm = new Map(bal.map((x) => [x.member_id, x]));
      return toCsv(
        ["name", "phone", "role", "hands", "status", "contributions_paid", "contribution_owing", "fines_owing", "loans_owing", "events_owing", "savings"],
        members.map((m) => { const x = bm.get(m.id); return [m.name, m.phone, m.role, m.hands, m.status, x?.contributions_paid, x?.contribution_owing, x?.fines_owing, x?.loans_owing, x?.events_owing, x?.savings]; }),
      );
    }
    case "meetings":
      return toCsv(["date", "status", "minutes"], meetings.map((m) => [m.date, m.status, m.minutes]));
    case "attendance": {
      const rows = await all<{ meeting_id: string; member_id: string; status: string; recorded_at: string }>(
        (a, b) => sb.from("attendance").select("meeting_id, member_id, status, recorded_at").eq("group_id", gid).range(a, b));
      return toCsv(["meeting_date", "member", "status", "recorded_at"], rows.map((r) => [mdate.get(r.meeting_id), name.get(r.member_id), r.status, r.recorded_at]));
    }
    case "loans": {
      const rows = await all<{ member_name: string; principal: number; interest_rate_pct: number; interest_basis: string; term_months: number; start_date: string; due_date: string; status: string; interest: number; owed_total: number; repaid: number; balance: number; overdue: boolean }>(
        (a, b) => sb.from("loan_balances").select("*").eq("group_id", gid).order("start_date").range(a, b));
      return toCsv(["member", "principal", "interest_rate_pct", "interest_basis", "term_months", "start_date", "due_date", "status", "interest", "owed_total", "repaid", "balance", "overdue"],
        rows.map((l) => [l.member_name, l.principal, l.interest_rate_pct, l.interest_basis, l.term_months, l.start_date, l.due_date, l.status, l.interest, l.owed_total, l.repaid, l.balance, l.overdue]));
    }
    case "fines": {
      const rows = await all<{ member_name: string; type: string; note: string | null; created_at: string; meeting_id: string | null; charged: number; paid: number; balance: number }>(
        (a, b) => sb.from("fine_balances").select("*").eq("group_id", gid).order("created_at").range(a, b));
      return toCsv(["member", "type", "note", "date", "meeting_date", "charged", "paid", "balance"],
        rows.map((f) => [f.member_name, f.type, f.note, f.created_at, f.meeting_id ? mdate.get(f.meeting_id) : "", f.charged, f.paid, f.balance]));
    }
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ gid: string; file: string }> }) {
  const { gid, file } = await params;
  const kind = file.replace(/\.csv$/, "") as File;
  if (!/^[0-9a-f-]{36}$/i.test(gid) || !FILES.includes(kind)) return new NextResponse("Not found", { status: 404 });
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return NextResponse.redirect(new URL("/login", req.url));
  const { data: g } = await sb.from("groups").select("name").eq("id", gid).maybeSingle();
  if (!g) return new NextResponse("Not found", { status: 404 });
  const csv = await build(sb, gid, kind);
  const safe = String(g.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "group";
  const day = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Douala" });
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="nkapbook-${safe}-${kind}-${day}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}

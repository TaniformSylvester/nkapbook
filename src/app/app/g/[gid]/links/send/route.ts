import { NextResponse, type NextRequest } from "next/server";
import { fill, getDict, isLang } from "@/i18n";
import { SITE_URL } from "@/lib/env";
import { supabaseServer } from "@/lib/supabase/server";
import { waLink } from "@/lib/whatsapp";

// Creates the member's private link if needed, records that it was shared, then opens WhatsApp ready to send.
export async function GET(req: NextRequest, { params }: { params: Promise<{ gid: string }> }) {
  const { gid } = await params;
  const mid = req.nextUrl.searchParams.get("m") ?? "";
  const lang = req.nextUrl.searchParams.get("l");
  if (!/^[0-9a-f-]{36}$/i.test(gid) || !/^[0-9a-f-]{36}$/i.test(mid) || !isLang(lang)) return new NextResponse("Bad request", { status: 400 });
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return NextResponse.redirect(new URL("/login", req.url));
  const [{ data: m }, { data: g }] = await Promise.all([
    sb.from("members").select("name, phone").eq("id", mid).eq("group_id", gid).maybeSingle(),
    sb.from("groups").select("name").eq("id", gid).maybeSingle(),
  ]);
  if (!m?.phone || !g) return new NextResponse("Not found", { status: 404 });
  const { data: token, error } = await sb.rpc("share_member_link", { p_member_id: mid });
  if (error || !token) return new NextResponse("Not allowed", { status: 403 });
  const text = fill(getDict(lang).link.waMessage, {
    name: String(m.name).split(" ")[0] ?? String(m.name), group: String(g.name), url: `${SITE_URL}/m/${token as string}`,
  });
  return NextResponse.redirect(waLink(m.phone as string, text), { status: 303 });
}

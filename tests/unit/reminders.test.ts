import { describe, expect, it, vi } from "vitest";
import { composeReminder } from "@/lib/reminders/compose";
import { automaticChannel, waCloudChannel, waLinkChannel } from "@/lib/reminders/channel";
import { toCsv } from "@/lib/csv";

const mary = { name: "Mary Ndi", group: "Unity Njangi", amount: 5000, day: "Sunday", paid: 45000, owing: 0, turn: "14 March" };

describe("composeReminder", () => {
  it("matches the Pidgin example from the brief", () => {
    expect(composeReminder("pcm", mary)).toBe(
      "Hi Mary, your 5,000 FCFA for Unity Njangi dey due Sunday. You don pay 45,000 FCFA so far. Your turn na 14 March. Thank you!",
    );
  });
  it("English and French, with arrears and the private link", () => {
    const d = { ...mary, owing: 4000, url: "https://nkapbook.com/m/abc" };
    expect(composeReminder("en", d)).toBe(
      "Hello Mary, your 5,000 FCFA for Unity Njangi is due on Sunday. You have paid 45,000 FCFA so far. You still owe 4,000 FCFA from before. Your turn is on 14 March. Your record: https://nkapbook.com/m/abc Thank you!",
    );
    expect(composeReminder("fr", d)).toContain("Bonjour Mary, votre cotisation de 5 000 FCFA pour Unity Njangi est due le Sunday.");
  });
  it("leaves out what doesn't apply (nothing paid yet, no turn)", () => {
    expect(composeReminder("en", { ...mary, paid: 0, turn: null })).toBe(
      "Hello Mary, your 5,000 FCFA for Unity Njangi is due on Sunday. Thank you!",
    );
  });
  it("is never threatening", () => {
    for (const l of ["en", "fr", "pcm"] as const) {
      expect(composeReminder(l, { ...mary, owing: 99000 })).not.toMatch(/penalt|sanction|warning|last chance|must|police/i);
    }
  });
});

describe("reminder channels", () => {
  it("the free channel builds a wa.me link", async () => {
    const r = await waLinkChannel.send({ to: "237670123456", text: "Hi Mary", template: { name: "x", lang: "en", params: [] } });
    expect(r).toEqual({ ok: true, link: "https://wa.me/237670123456?text=Hi%20Mary" });
  });
  it("the automatic channel is off unless the feature flag and credentials are set", () => {
    expect(automaticChannel({})).toBeNull();
    expect(automaticChannel({ FEATURE_WA_CLOUD: "true" })).toBeNull();
    expect(automaticChannel({ FEATURE_WA_CLOUD: "false", WA_CLOUD_PHONE_NUMBER_ID: "1", WA_CLOUD_ACCESS_TOKEN: "t" })).toBeNull();
    expect(automaticChannel({ FEATURE_WA_CLOUD: "true", WA_CLOUD_PHONE_NUMBER_ID: "1", WA_CLOUD_ACCESS_TOKEN: "t" })?.name).toBe("wa_cloud");
  });
  it("the Cloud API channel sends an approved template", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ messages: [{ id: "wamid.1" }] }), { status: 200 }));
    const ch = waCloudChannel({ phoneNumberId: "123", token: "secret", fetchImpl: fetchImpl as unknown as typeof fetch });
    const r = await ch.send({ to: "237670123456", text: "", template: { name: "contribution_due", lang: "pcm", params: ["Mary", "5,000 FCFA"] } });
    expect(r).toEqual({ ok: true, id: "wamid.1" });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://graph.facebook.com/v21.0/123/messages");
    const body = JSON.parse(String(init.body));
    expect(body.template.name).toBe("contribution_due");
    expect(body.template.components[0].parameters).toEqual([{ type: "text", text: "Mary" }, { type: "text", text: "5,000 FCFA" }]);
  });
  it("reports provider errors instead of throwing", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: { message: "Template not approved" } }), { status: 400 }));
    const ch = waCloudChannel({ phoneNumberId: "123", token: "t", fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(await ch.send({ to: "1", text: "", template: { name: "x", lang: "en", params: [] } })).toEqual({ ok: false, error: "Template not approved" });
  });
});

describe("toCsv", () => {
  it("quotes, escapes, adds a BOM and CRLF", () => {
    expect(toCsv(["a", "b"], [["Ma, Grace", 'say "hi"'], [5000, null]])).toBe('﻿a,b\r\n"Ma, Grace","say ""hi"""\r\n5000,\r\n');
  });
  it("neutralises formulas so a name can't run code in Excel", () => {
    expect(toCsv(["n"], [["=HYPERLINK(\"x\")"], ["+1"], ["@SUM(A1)"], [-500]])).toBe('﻿n\r\n"\'=HYPERLINK(""x"")"\r\n\'+1\r\n\'@SUM(A1)\r\n-500\r\n');
  });
});

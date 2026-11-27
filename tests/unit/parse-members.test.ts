import { describe, expect, it } from "vitest";
import { parseMemberList } from "@/lib/parse-members";

const ok = (text: string) => {
  const [r] = parseMemberList(text);
  if (!r?.ok) throw new Error(`not ok: ${JSON.stringify(r)}`);
  return { name: r.name, phone: r.phone, hands: r.hands };
};

describe("parseMemberList", () => {
  it.each([
    ["Mary Ndi, 670 12 34 56", { name: "Mary Ndi", phone: "237670123456", hands: 1 }],
    ["Pa Joe Tabi 6 77 88 99 00, 2", { name: "Pa Joe Tabi", phone: "237677889900", hands: 2 }],
    ["3. Ma Grace - +237 699 11 22 33 x2", { name: "Ma Grace", phone: "237699112233", hands: 2 }],
    ["Ma Grace", { name: "Ma Grace", phone: null, hands: 1 }],
    ["Ngwa Paul; 677889900; 3", { name: "Ngwa Paul", phone: "237677889900", hands: 3 }],
    ["Mary Ndi\t670123456\t2", { name: "Mary Ndi", phone: "237670123456", hands: 2 }],
    ["Akwa Bih: 00237 6 70 12 34 56", { name: "Akwa Bih", phone: "237670123456", hands: 1 }],
    ["Tchoffo Jean 650.12.34.56 (2)", { name: "Tchoffo Jean", phone: "237650123456", hands: 2 }],
    ["Fon Emmanuel 670123456 2 hands", { name: "Fon Emmanuel", phone: "237670123456", hands: 2 }],
    ["Mbah Délphine, 2", { name: "Mbah Délphine", phone: null, hands: 2 }],
    ["• Ayuk Nkongho 670-12-34-56", { name: "Ayuk Nkongho", phone: "237670123456", hands: 1 }],
  ])("%s", (input, expected) => expect(ok(input)).toEqual(expected));

  it("skips blank lines and keeps line numbers", () => {
    const r = parseMemberList("Mary, 670123456\n\n  \nJoe");
    expect(r.map((x) => x.line)).toEqual([1, 4]);
  });

  it("reports problems per line", () => {
    const r = parseMemberList("Mary 12345678\n670123456\nJoe, 670123456, 15");
    expect(r).toEqual([
      { ok: false, line: 1, raw: "Mary 12345678", problem: "badPhone" },
      { ok: false, line: 2, raw: "670123456", problem: "noName" },
      { ok: false, line: 3, raw: "Joe, 670123456, 15", problem: "badHands" },
    ]);
  });
});

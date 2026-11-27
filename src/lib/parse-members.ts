import { normalizeCmPhone } from "./phone";

export type ParsedLine =
  | { ok: true; line: number; name: string; phone: string | null; hands: number }
  | { ok: false; line: number; raw: string; problem: "noName" | "badPhone" | "badHands" };

// A run of digits (with spaces, dots, dashes, an optional + or 00) long enough to be a phone number.
const PHONE_RE = /(\+|00)?\d[\d\s.\-()]{6,}\d/;

function cleanName(s: string) {
  return s
    .replace(/^[\s\d.)\-*•]+(?=\D)/, "") // list markers like "1." "2)" "-" "•"
    .replace(/[:\-–,;|]+\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parse one member per line. Accepts forms like
 *   "Mary Ndi, 670 12 34 56"   "Pa Joe Tabi 6 77 88 99 00, 2"   "3. Ma Grace - +237 699 11 22 33 x2"
 *   "Ma Grace"   "Ngwa Paul; 677889900; 3"   "Mary Ndi\t670123456\t2" (from a spreadsheet)
 */
export function parseMemberList(text: string): ParsedLine[] {
  const out: ParsedLine[] = [];
  text.split(/\r?\n/).forEach((rawLine, i) => {
    const raw = rawLine.trim();
    if (!raw) return;
    const line = i + 1;
    let rest = raw;
    let hands = 1;

    // hands at the end: ", 2" / "x2" / "2 hands" / "(2)"
    const handsMatch = /(?:[,;|\t]\s*|\s+x\s*|\s*\()\s*(\d{1,2})\s*(?:hands?|mains?|h)?\)?\s*$/i.exec(rest);
    if (handsMatch) {
      // an explicit separator before it ("," ";" tab " x" "("), so this number is the hands
      const n = Number(handsMatch[1]);
      if (n < 1 || n > 10) {
        out.push({ ok: false, line, raw, problem: "badHands" });
        return;
      }
      hands = n;
      rest = rest.slice(0, handsMatch.index);
    } else {
      const words = /\s(\d{1,2})\s*(?:hands?|mains?)\s*$/i.exec(rest);
      if (words) {
        hands = Number(words[1]);
        rest = rest.slice(0, words.index);
        if (hands < 1 || hands > 10) {
          out.push({ ok: false, line, raw, problem: "badHands" });
          return;
        }
      }
    }

    let phone: string | null = null;
    const pm = PHONE_RE.exec(rest);
    if (pm) {
      phone = normalizeCmPhone(pm[0]);
      if (!phone) {
        out.push({ ok: false, line, raw, problem: "badPhone" });
        return;
      }
      rest = rest.slice(0, pm.index) + " " + rest.slice(pm.index + pm[0].length);
    }

    const name = cleanName(rest.replace(/[,;|\t]/g, " "));
    if (!name || !/\p{L}/u.test(name)) {
      out.push({ ok: false, line, raw, problem: "noName" });
      return;
    }
    out.push({ ok: true, line, name: name.slice(0, 80), phone, hands });
  });
  return out;
}

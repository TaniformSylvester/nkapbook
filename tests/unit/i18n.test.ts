import { describe, expect, it } from "vitest";
import en from "@/i18n/en";
import fr from "@/i18n/fr";
import pcm from "@/i18n/pcm";
import { fill } from "@/i18n";

function keys(o: object, prefix = ""): string[] {
  return Object.entries(o).flatMap(([k, v]) =>
    typeof v === "string" ? [prefix + k] : keys(v as object, `${prefix}${k}.`),
  );
}
function get(o: object, path: string): string {
  return path.split(".").reduce<unknown>((a, k) => (a as Record<string, unknown>)[k], o) as string;
}

describe("dictionaries", () => {
  it("French and Pidgin have exactly the English keys", () => {
    expect(keys(fr).sort()).toEqual(keys(en).sort());
    expect(keys(pcm).sort()).toEqual(keys(en).sort());
  });
  it("keep the same {placeholders}", () => {
    for (const k of keys(en)) {
      const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
      expect(ph(get(fr, k)), `fr ${k}`).toBe(ph(get(en, k)));
      expect(ph(get(pcm, k)), `pcm ${k}`).toBe(ph(get(en, k)));
    }
  });
  it("has no empty strings", () => {
    for (const d of [en, fr, pcm]) for (const k of keys(d)) expect(get(d, k).trim(), k).not.toBe("");
  });
  it("fills placeholders", () => expect(fill("Hi {name}, {n}", { name: "Mary", n: 3 })).toBe("Hi Mary, 3"));
});

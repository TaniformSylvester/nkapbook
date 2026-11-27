import en, { type Dict } from "./en";
import fr from "./fr";
import pcm from "./pcm";

export type Lang = "en" | "fr" | "pcm";
export const LANGS: Lang[] = ["en", "fr", "pcm"];
export const LANG_COOKIE = "nk_lang";
export type { Dict };

const dicts: Record<Lang, Dict> = { en, fr, pcm };

export function isLang(v: unknown): v is Lang {
  return v === "en" || v === "fr" || v === "pcm";
}

export function getDict(lang: Lang): Dict {
  return dicts[lang];
}

/** Fill {placeholders} in a dictionary string. */
export function fill(s: string, vars: Record<string, string | number>): string {
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** Best guess from an Accept-Language header (Pidgin is never auto-detected). */
export function langFromAccept(header: string | null | undefined): Lang {
  return header && /^\s*fr\b/i.test(header) ? "fr" : "en";
}

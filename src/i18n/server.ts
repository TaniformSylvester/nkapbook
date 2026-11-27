import "server-only";
import { cookies, headers } from "next/headers";
import { getDict, isLang, langFromAccept, LANG_COOKIE, type Lang } from "./index";

/** Language for this request: the cookie choice, else a fallback (e.g. the group's language), else the browser's. */
export async function getLang(fallback?: Lang): Promise<Lang> {
  const c = (await cookies()).get(LANG_COOKIE)?.value;
  if (isLang(c)) return c;
  if (fallback) return fallback;
  return langFromAccept((await headers()).get("accept-language"));
}

export async function getT(fallback?: Lang) {
  const lang = await getLang(fallback);
  return { lang, t: getDict(lang) };
}

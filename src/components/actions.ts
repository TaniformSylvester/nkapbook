"use server";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { isLang, LANG_COOKIE } from "@/i18n";

export async function setLang(formData: FormData) {
  const lang = formData.get("lang");
  if (isLang(lang)) {
    (await cookies()).set(LANG_COOKIE, lang, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
    revalidatePath("/", "layout"); // re-render the current page in the new language
  }
}

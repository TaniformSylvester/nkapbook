import { LANGS, type Dict, type Lang } from "@/i18n";
import { setLang } from "./actions";

/** A plain form: works without JavaScript and adds nothing to the page bundle. */
export function LangSwitch({ current, t }: { current: Lang; t: Dict }) {
  return (
    <form action={setLang} className="langs" aria-label={t.lang.label}>
      {LANGS.map((l) => (
        <button key={l} name="lang" value={l} aria-pressed={l === current} lang={l === "pcm" ? "en-CM" : l} title={t.lang[l]}>
          {l === "pcm" ? "PID" : l.toUpperCase()}
        </button>
      ))}
    </form>
  );
}

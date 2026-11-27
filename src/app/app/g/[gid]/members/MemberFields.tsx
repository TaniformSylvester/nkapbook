import type { Dict } from "@/i18n";
import { formatPhone } from "@/lib/phone";
import type { Member } from "@/lib/types";

export function MemberFields({ t, m, withStatus }: { t: Dict; m?: Member; withStatus?: boolean }) {
  const s = t.members;
  return (
    <>
      <div className="field">
        <label htmlFor="name">{s.name}</label>
        <input id="name" name="name" className="input" required maxLength={80} defaultValue={m?.name} autoComplete="off" />
      </div>
      <div className="field">
        <label htmlFor="phone">{s.phone}</label>
        <span className="hint" id="phone-hint">{s.phoneHint}</span>
        <input
          id="phone"
          name="phone"
          className="input"
          type="tel"
          inputMode="tel"
          aria-describedby="phone-hint"
          defaultValue={m?.phone ? formatPhone(m.phone) : ""}
          autoComplete="off"
        />
      </div>
      <div className="field">
        <label htmlFor="hands">{s.handsLabel}</label>
        <span className="hint" id="hands-hint">{s.handsHint}</span>
        <select id="hands" name="hands" className="input" defaultValue={m?.hands ?? 1} aria-describedby="hands-hint">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </div>
      <label className="check">
        <input type="checkbox" name="opt_in" defaultChecked={m?.whatsapp_opt_in} />
        <span>{s.optIn}</span>
      </label>
      {withStatus && (
        <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ fontWeight: 600, marginBottom: 4 }}>{s.status}</legend>
          <div className="segmented">
            <label>
              <input type="radio" name="status" value="active" defaultChecked={m?.status !== "left"} />
              <span>{s.active}</span>
            </label>
            <label>
              <input type="radio" name="status" value="left" defaultChecked={m?.status === "left"} />
              <span>{s.leftGroup}</span>
            </label>
          </div>
        </fieldset>
      )}
    </>
  );
}

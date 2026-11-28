"use client";
import { useState } from "react";
import { fill, LANGS, type Dict } from "@/i18n";
import { CURRENCIES, currencyLabel } from "@/lib/money";
import { FREQUENCIES, type Frequency, type Group } from "@/lib/types";

/** Fields shared by "create group" and "group settings". Meeting day adapts to the frequency. */
/** currencyLocked: money has been recorded, so the currency is shown but can't change. */
export function GroupFields({ t, initial, withYourName, currencyLocked }: { t: Dict; initial?: Partial<Group>; withYourName?: boolean; currencyLocked?: boolean }) {
  const f = t.groupForm;
  const [freq, setFreq] = useState<Frequency>(initial?.frequency ?? "monthly");
  const [currency, setCurrency] = useState<string>(initial?.currency ?? "XAF");
  const [day, setDay] = useState<number>(initial?.meeting_day ?? (freq === "monthly" ? 1 : 0));
  const pickFreq = (v: Frequency) => {
    setFreq(v);
    if (v === "monthly" && (day < 1 || day > 28)) setDay(1);
    if (v !== "monthly" && day > 6) setDay(0);
  };

  return (
    <>
      <div className="field">
        <label htmlFor="name">{f.name}</label>
        <input id="name" name="name" className="input" required minLength={2} maxLength={80} placeholder={f.nameHint} defaultValue={initial?.name} />
      </div>
      <div className="field">
        <label htmlFor="town">{f.town}</label>
        <input id="town" name="town" className="input" maxLength={80} defaultValue={initial?.town ?? ""} />
      </div>
      {withYourName && (
        <div className="field">
          <label htmlFor="your_name">{f.yourName}</label>
          <input id="your_name" name="your_name" className="input" required maxLength={80} autoComplete="name" />
        </div>
      )}
      <div className="field">
        <label htmlFor="currency">{f.currency}</label>
        <span className="hint" id="currency-hint">{currencyLocked ? f.currencyLocked : f.currencyHint}</span>
        <select id="currency" name={currencyLocked ? undefined : "currency"} className="input" value={currency} disabled={currencyLocked}
          onChange={(e) => setCurrency(e.target.value)} aria-describedby="currency-hint">
          {CURRENCIES.map((c) => <option key={c} value={c}>{t.currencies[c]}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="contribution">{fill(f.contribution, { cur: currencyLabel(currency) })}</label>
        <span className="hint" id="contribution-hint">{f.contributionHint}</span>
        <input
          id="contribution"
          name="contribution"
          className="input num"
          inputMode="numeric"
          pattern="[0-9 ,.]*"
          required
          aria-describedby="contribution-hint"
          defaultValue={initial?.contribution_per_hand?.toString()}
        />
      </div>
      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend style={{ fontWeight: 600, marginBottom: 4 }}>{f.frequency}</legend>
        <div className="segmented">
          {FREQUENCIES.map((v) => (
            <label key={v}>
              <input type="radio" name="frequency" value={v} checked={freq === v} onChange={() => pickFreq(v)} />
              <span>{t.freq[v]}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {freq === "monthly" ? (
        <div className="field">
          <label htmlFor="meeting_day">{f.dayOfMonth}</label>
          <input
            id="meeting_day"
            name="meeting_day"
            className="input num"
            type="number"
            min={1}
            max={28}
            required
            value={day}
            onChange={(e) => setDay(Number(e.target.value))}
          />
        </div>
      ) : (
        <div className="field">
          <label htmlFor="meeting_day">{f.meetingDay}</label>
          <select id="meeting_day" name="meeting_day" className="input" value={day} onChange={(e) => setDay(Number(e.target.value))}>
            {t.days.map((d, i) => (
              <option key={i} value={i}>{d}</option>
            ))}
          </select>
        </div>
      )}
      <div className="field">
        <label htmlFor="start_date">{f.startDate}</label>
        <input id="start_date" name="start_date" type="date" className="input" required defaultValue={initial?.start_date ?? new Date().toISOString().slice(0, 10)} />
      </div>
      <div className="field">
        <label htmlFor="language">{f.language}</label>
        <span className="hint" id="language-hint">{f.languageHint}</span>
        <select id="language" name="language" className="input" defaultValue={initial?.language ?? "en"} aria-describedby="language-hint">
          {LANGS.map((l) => (
            <option key={l} value={l}>{t.lang[l]}</option>
          ))}
        </select>
      </div>
    </>
  );
}

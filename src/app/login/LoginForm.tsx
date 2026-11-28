import { SubmitButton } from "@/components/SubmitButton";
import { fill, type Dict } from "@/i18n";
import { formatPhone } from "@/lib/phone";
import { sendCode, verifyCode, type LoginError } from "./actions";

type LoginText = Dict["login"];

/** Plain forms posting to server actions: work with or without JavaScript. */
export function LoginForm({ t, step, phone, error }: { t: LoginText; step: "phone" | "code"; phone: string | null; error: LoginError | null }) {
  if (step === "code" && phone) {
    return (
      <div className="stack">
        <h1>{t.codeTitle}</h1>
        <p>{fill(t.codeSent, { phone: formatPhone(phone) })}</p>
        {error && <p className="error" role="alert">{t.errors[error]}</p>}
        <form action={verifyCode} className="stack">
          <div className="field">
            <label htmlFor="code">{t.codeLabel}</label>
            <input id="code" name="code" className="input input-big" inputMode="numeric" autoComplete="one-time-code"
              pattern="[0-9]{6}" maxLength={6} required autoFocus />
          </div>
          <SubmitButton>{t.verify}</SubmitButton>
        </form>
        <form action={sendCode}>
          <input type="hidden" name="phone" value={`+${phone}`} />
          <SubmitButton className="btn-link">{t.resend}</SubmitButton>
        </form>
        <a href="/login?change=1" className="btn-link">{t.changeNumber}</a>
      </div>
    );
  }

  return (
    <form action={sendCode} className="stack">
      <h1>{t.title}</h1>
      {error && <p className="error" role="alert">{t.errors[error]}</p>}
      <div className="field">
        <label htmlFor="phone">{t.phoneLabel}</label>
        <span className="hint" id="phone-hint">{t.phoneHint}</span>
        <input id="phone" name="phone" className="input" type="tel" inputMode="tel" autoComplete="tel"
          aria-describedby="phone-hint" defaultValue={phone ? formatPhone(phone) : ""} required />
      </div>
      <SubmitButton>{t.sendCode}</SubmitButton>
    </form>
  );
}

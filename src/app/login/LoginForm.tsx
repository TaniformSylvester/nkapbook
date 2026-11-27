"use client";
import { useActionState } from "react";
import type { Dict } from "@/i18n";
import { fill } from "@/i18n";
import { formatPhone } from "@/lib/phone";
import { sendCode, verifyCode, type LoginState } from "./actions";

type LoginText = Dict["login"];

export function LoginForm({ t }: { t: LoginText }) {
  const [sent, sendAction, sending] = useActionState<LoginState, FormData>(sendCode, { step: "phone" });
  const [verified, verifyAction, verifying] = useActionState<LoginState, FormData>(verifyCode, { step: "code" });

  const onCodeStep = sent.step === "code" && verified.step === "code";
  const error = onCodeStep ? verified.error : sent.error;

  if (onCodeStep && sent.phone) {
    return (
      <div className="stack">
        <h1>{t.codeTitle}</h1>
        <p>{fill(t.codeSent, { phone: formatPhone(sent.phone) })}</p>
        {error && <p className="error" role="alert">{t.errors[error]}</p>}
        <form action={verifyAction} className="stack">
          <input type="hidden" name="phone" value={sent.phone} />
          <div className="field">
            <label htmlFor="code">{t.codeLabel}</label>
            <input
              id="code"
              name="code"
              className="input input-big"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              autoFocus
            />
          </div>
          <button className="btn btn-block" disabled={verifying}>
            {t.verify}
          </button>
        </form>
        <form action={sendAction}>
          <input type="hidden" name="phone" value={sent.phone} />
          <button className="btn-link" disabled={sending}>{t.resend}</button>
        </form>
        <a href="/login" className="btn-link">{t.changeNumber}</a>
      </div>
    );
  }

  return (
    <form action={sendAction} className="stack">
      <h1>{t.title}</h1>
      {error && <p className="error" role="alert">{t.errors[error]}</p>}
      <div className="field">
        <label htmlFor="phone">{t.phoneLabel}</label>
        <span className="hint" id="phone-hint">{t.phoneHint}</span>
        <input
          id="phone"
          name="phone"
          className="input"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          aria-describedby="phone-hint"
          defaultValue={sent.phone ? formatPhone(sent.phone) : ""}
          required
        />
      </div>
      <button className="btn btn-block" disabled={sending}>
        {t.sendCode}
      </button>
    </form>
  );
}

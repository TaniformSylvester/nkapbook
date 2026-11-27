// Reminder channels. Phase 1 (now): wa.me links that the secretary sends by hand — free, no API.
// Phase 2 (later, behind FEATURE_WA_CLOUD): automatic sends through a WhatsApp Business provider.
// Nothing outside this file knows which provider is used.
import { waLink } from "@/lib/whatsapp";

export type ReminderMessage = {
  to: string; // 2376XXXXXXXX
  text: string; // the full message, used by the free link channel
  template: { name: string; lang: "en" | "fr" | "pcm"; params: string[] }; // used by template-based providers
};

export type SendResult = { ok: true; id?: string; link?: string } | { ok: false; error: string };

export interface ReminderChannel {
  readonly name: "wa_link" | "wa_cloud";
  readonly automatic: boolean;
  send(msg: ReminderMessage): Promise<SendResult>;
}

/** Builds a wa.me link; a person taps it and presses send in WhatsApp. */
export const waLinkChannel: ReminderChannel = {
  name: "wa_link",
  automatic: false,
  async send(msg) {
    return { ok: true, link: waLink(msg.to, msg.text) };
  },
};

/**
 * WhatsApp Business Platform (Cloud API). Sends an approved template.
 * Business-initiated messages must use pre-approved templates, and only to members who opted in.
 */
export function waCloudChannel(cfg: { phoneNumberId: string; token: string; apiVersion?: string; fetchImpl?: typeof fetch }): ReminderChannel {
  const f = cfg.fetchImpl ?? fetch;
  const langCode = { en: "en", fr: "fr", pcm: "en" } as const; // Meta has no Pidgin locale; register Pidgin text under en
  return {
    name: "wa_cloud",
    automatic: true,
    async send(msg) {
      const res = await f(`https://graph.facebook.com/${cfg.apiVersion ?? "v21.0"}/${cfg.phoneNumberId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: msg.to,
          type: "template",
          template: {
            name: msg.template.name,
            language: { code: langCode[msg.template.lang] },
            components: [{ type: "body", parameters: msg.template.params.map((text) => ({ type: "text", text })) }],
          },
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string } };
      if (!res.ok) return { ok: false, error: body.error?.message ?? `HTTP ${res.status}` };
      return { ok: true, id: body.messages?.[0]?.id };
    },
  };
}

/** The automatic channel, or null when the feature is off or not configured. */
export function automaticChannel(env: Record<string, string | undefined> = process.env): ReminderChannel | null {
  if (env.FEATURE_WA_CLOUD !== "true") return null;
  if (!env.WA_CLOUD_PHONE_NUMBER_ID || !env.WA_CLOUD_ACCESS_TOKEN) return null;
  return waCloudChannel({ phoneNumberId: env.WA_CLOUD_PHONE_NUMBER_ID, token: env.WA_CLOUD_ACCESS_TOKEN });
}

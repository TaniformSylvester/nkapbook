/** Public contact details. Safe to show anywhere. */
export const SUPPORT_EMAIL = "support@nkapbook.com";
/** WhatsApp number for support (digits with country code), from the environment. */
export const supportWhatsapp = () =>
  (process.env.SUBSCRIPTION_WHATSAPP_NUMBER ?? process.env.SUBSCRIPTION_MTN_NUMBER)?.replace(/\D/g, "") || null;

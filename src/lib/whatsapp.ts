/** A wa.me link that opens WhatsApp with the message ready; the sender taps Send. Free, no API. */
export function waLink(phone: string | null | undefined, text: string): string {
  const q = `text=${encodeURIComponent(text)}`;
  return phone ? `https://wa.me/${phone.replace(/\D/g, "")}?${q}` : `https://wa.me/?${q}`;
}

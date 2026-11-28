import net from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { sendAdminMail } from "@/lib/notify/mail";
import { newGroupMail } from "@/lib/notify/templates";

// A tiny SMTP server that records what it receives.
let server: net.Server;
let port = 0;
const received: string[] = [];
beforeAll(async () => {
  server = net.createServer((s) => {
    let inData = false, buf = "";
    s.write("220 test\r\n");
    s.on("data", (d) => {
      buf += d.toString();
      if (inData) {
        if (buf.includes("\r\n.\r\n")) { received.push(buf); buf = ""; inData = false; s.write("250 ok\r\n"); }
        return;
      }
      let i;
      while ((i = buf.indexOf("\r\n")) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 2);
        const c = line.slice(0, 4).toUpperCase();
        if (c === "EHLO") s.write("250-test\r\n250 AUTH PLAIN LOGIN\r\n");
        else if (c === "AUTH") { received.push(line); s.write("235 ok\r\n"); }
        else if (c === "DATA") { inData = true; s.write("354 go\r\n"); break; }
        else if (c === "QUIT") { s.write("221 bye\r\n"); s.end(); }
        else s.write("250 ok\r\n");
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  port = (server.address() as net.AddressInfo).port;
});
afterAll(() => { server.close(); vi.unstubAllEnvs(); });

describe("sending admin emails", () => {
  it("does nothing when SMTP isn't configured", async () => {
    vi.stubEnv("SMTP_USER", "");
    vi.stubEnv("SMTP_PASS", "");
    expect(await sendAdminMail(newGroupMail({ id: "9d51176a-dc89-49b2-a5a3-04d1f9353530", name: "X", town: null, plan: "trial", paid_until: "2027-01-27", created_at: "2026-11-28T10:00:00Z" }))).toEqual({ sent: false, reason: "not_configured" });
  });

  it("logs in and sends from support@nkapbook.com to the admin address", async () => {
    vi.stubEnv("SMTP_HOST", "127.0.0.1");
    vi.stubEnv("SMTP_PORT", String(port));
    vi.stubEnv("SMTP_USER", "me@example.com");
    vi.stubEnv("SMTP_PASS", "app-password");
    const r = await sendAdminMail(newGroupMail({ id: "9d51176a-dc89-49b2-a5a3-04d1f9353530", name: "Unity Njangi", town: "Bamenda", plan: "trial", paid_until: "2027-01-27", created_at: "2026-11-28T10:00:00Z" }));
    expect(r).toEqual({ sent: true });
    const msg = received.join("\n");
    expect(msg).toMatch(/^AUTH /m);
    expect(msg).toContain("From: NkapBook <support@nkapbook.com>");
    expect(msg).toContain("To: support@nkapbook.com");
    expect(msg).toContain("Subject: New njangi on NkapBook: Unity Njangi (Bamenda)");
  });

  it("reports a failure without throwing when the server can't be reached", async () => {
    vi.stubEnv("SMTP_PORT", "1"); // nothing listens there
    const r = await sendAdminMail(newGroupMail({ id: "9d51176a-dc89-49b2-a5a3-04d1f9353530", name: "X", town: null, plan: "trial", paid_until: null, created_at: "2026-11-28T10:00:00Z" }));
    expect(r).toMatchObject({ sent: false, reason: "failed" });
  });
});

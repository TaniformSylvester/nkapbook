import { describe, expect, it } from "vitest";
import { nextMeetingDate } from "@/lib/schedule";

describe("nextMeetingDate", () => {
  it("weekly on Sunday from a Friday", () => expect(nextMeetingDate({ frequency: "weekly", meeting_day: 0 }, "2026-11-27")).toBe("2026-11-29"));
  it("same day counts", () => expect(nextMeetingDate({ frequency: "biweekly", meeting_day: 5 }, "2026-11-27")).toBe("2026-11-27"));
  it("monthly later this month", () => expect(nextMeetingDate({ frequency: "monthly", meeting_day: 28 }, "2026-11-27")).toBe("2026-11-28"));
  it("monthly rolls into next month and year", () => expect(nextMeetingDate({ frequency: "monthly", meeting_day: 5 }, "2026-12-27")).toBe("2027-01-05"));
});

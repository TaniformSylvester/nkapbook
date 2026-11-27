import type { Lang } from "@/i18n";

export type Role = "president" | "secretary" | "treasurer" | "member";
export type Frequency = "weekly" | "biweekly" | "monthly";

export type Group = {
  id: string;
  name: string;
  town: string | null;
  language: Lang;
  frequency: Frequency;
  meeting_day: number;
  contribution_per_hand: number;
  start_date: string;
  status: "active" | "paused" | "closed";
  plan: "pilot" | "free" | "paid";
  fines_go_to_fund: boolean;
};

export type Member = {
  id: string;
  group_id: string;
  name: string;
  phone: string | null;
  role: Role;
  hands: number;
  status: "active" | "left";
  left_at: string | null;
  user_id: string | null;
  whatsapp_opt_in: boolean;
};

export const ROLES: Role[] = ["member", "secretary", "treasurer", "president"];
export const OFFICIAL_ROLES: Exclude<Role, "member">[] = ["president", "secretary", "treasurer"];
export const FREQUENCIES: Frequency[] = ["weekly", "biweekly", "monthly"];

import type { SupportCategory } from "./support-routing";

export type SupportPriority = "low" | "normal" | "high" | "urgent";

const priorityByCategory: Record<SupportCategory, SupportPriority> = {
  privacy: "urgent",
  moderation: "urgent",
  billing: "high",
  account: "high",
  technical: "normal",
  events: "normal",
  general: "normal",
};

const firstResponseMs: Record<SupportPriority, number> = {
  urgent: 60 * 60_000,
  high: 4 * 60 * 60_000,
  normal: 12 * 60 * 60_000,
  low: 24 * 60 * 60_000,
};

export function supportPriority(category: SupportCategory): SupportPriority {
  return priorityByCategory[category];
}

export function supportFirstResponseDueAt(category: SupportCategory, from = Date.now()) {
  const priority = supportPriority(category);
  return { priority, dueAt: from + firstResponseMs[priority] };
}

export function supportSlaState(
  dueAt: number | null | undefined,
  firstResponseAt: number | null | undefined,
  now = Date.now(),
) {
  if (firstResponseAt) return "met" as const;
  if (!dueAt) return "unset" as const;
  if (dueAt <= now) return "overdue" as const;
  if (dueAt - now <= 60 * 60_000) return "at_risk" as const;
  return "on_track" as const;
}

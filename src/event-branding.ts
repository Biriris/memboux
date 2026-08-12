import { esc } from "./utils";

export type EventBranding = {
  brand_name: string;
  primary_color: string;
  background_color: string;
  logo_media_id: string | null;
  hide_memboux: number;
};

export const defaultEventBranding: EventBranding = {
  brand_name: "",
  primary_color: "#7c3aed",
  background_color: "#f8f5ff",
  logo_media_id: null,
  hide_memboux: 0,
};

export const validBrandColor = (value: string) => /^#[0-9a-f]{6}$/i.test(value);

export async function getEventBranding(db: D1Database, eventId: string) {
  return await db.prepare("SELECT brand_name,primary_color,background_color,logo_media_id,hide_memboux FROM event_branding WHERE event_id=?")
    .bind(eventId).first<EventBranding>().catch(() => null) ?? defaultEventBranding;
}

export function eventBrandingStyle(branding: EventBranding) {
  return `<style>:root{--event-brand-primary:${esc(branding.primary_color)};--event-brand-background:${esc(branding.background_color)}}.event-brand-surface{background:var(--event-brand-primary)!important}.event-brand-action{background:var(--event-brand-primary)!important}.event-brand-accent{color:var(--event-brand-primary)!important}.event-brand-soft{background:var(--event-brand-background)!important}</style>`;
}

export function eventBrandIdentity(branding: EventBranding, fallbackName: string | { light?: boolean } = "Memboux") {
  const name = branding.brand_name || (typeof fallbackName === "string" ? fallbackName : "Memboux");
  const logo = branding.logo_media_id
    ? `<img src="/media/${encodeURIComponent(branding.logo_media_id)}?variant=thumb" alt="" class="h-10 w-10 rounded-xl bg-white object-cover">`
    : "";
  return `<span class="inline-flex items-center gap-2">${logo}<strong class="text-sm">${esc(name)}</strong>${branding.hide_memboux ? "" : `<small class="text-[10px] opacity-55">by Memboux</small>`}</span>`;
}

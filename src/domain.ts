import type { AuthEnv } from "./auth";
import type { Locale } from "./i18n";

export type EventRole = "owner" | "editor" | "viewer";

export type Bindings = AuthEnv & {
  MEDIA: R2Bucket;
  ASSETS: Fetcher;
  ADMIN_PASSWORD?: string;
};

export type EventRow = {
  id: string;
  code: string;
  eventName: string;
  admin_token_hash: string;
  created_at: number;
  expires_at: number;
  status: "active" | "archived";
  notes: string;
  updated_at: number | null;
  default_locale: Locale;
  event_start_date: string | null;
  event_end_date: string | null;
  gallery_pin_hash: string | null;
  deleted_at: number | null;
  purge_at: number | null;
};

export type MediaRow = {
  id: string;
  event_id: string;
  object_key: string;
  media_type: "image" | "video";
  content_type: string;
  uploaded_by: string;
  uploaded_at: number;
  captured_at: number | null;
  content_hash: string | null;
  reported_at: number | null;
  size_bytes: number;
  title: string | null;
  deleted_at: number | null;
  purge_at: number | null;
  upload_consent_at: number | null;
  upload_policy_version: string | null;
};

export type EventMemberRow = {
  user_id: string;
  name: string;
  email: string;
  role: EventRole;
  created_at: number;
};

export type EventInvitationRow = {
  id: string;
  email: string;
  role: "editor" | "viewer";
  created_at: number;
  expires_at: number;
};

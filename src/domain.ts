import type { AuthEnv } from "./auth";
import type { EventType } from "./event-types";
import type { Locale } from "./i18n";

export type EventRole = "owner" | "editor" | "viewer";
export type CloudProvider = "google_drive" | "dropbox";

export type Bindings = AuthEnv & {
  MEDIA: R2Bucket;
  IMAGES: ImagesBinding;
  ASSETS: Fetcher;
  DRIVE_BACKUP_WORKFLOW: Workflow;
  DROPBOX_BACKUP_WORKFLOW: Workflow;
  DROPBOX_APP_KEY?: string;
  DROPBOX_APP_SECRET?: string;
  GOOGLE_MAPS_API_KEY?: string;
  ADMIN_PASSWORD?: string;
  BUSINESS_LEGAL_NAME?: string;
  BUSINESS_POSTAL_ADDRESS?: string;
  PRIVACY_EMAIL?: string;
  SUPPORT_EMAIL?: string;
};

export type CloudConnectionRow = {
  id: string;
  user_id: string;
  provider: CloudProvider;
  encrypted_refresh_token: string;
  token_iv: string;
  scope: string;
  root_folder_id: string | null;
  created_at: number;
  updated_at: number;
};

export type EventBackupStatus = "queued" | "running" | "completed" | "failed";

export type EventBackupRow = {
  id: string;
  event_id: string;
  user_id: string;
  provider: CloudProvider;
  status: EventBackupStatus;
  workflow_instance_id: string | null;
  provider_folder_id: string | null;
  total_items: number;
  completed_items: number;
  failed_items: number;
  total_bytes: number;
  completed_bytes: number;
  error_message: string | null;
  created_at: number;
  started_at: number | null;
  completed_at: number | null;
  updated_at: number;
};

export type EventBackupItemRow = {
  backup_id: string;
  media_id: string;
  sequence_no: number;
  object_key: string;
  content_type: string;
  size_bytes: number;
  filename: string;
  status: "pending" | "completed" | "failed";
  provider_file_id: string | null;
  error_message: string | null;
  completed_at: number | null;
  updated_at: number;
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
  event_type?: EventType | null;
  location?: string | null;
  location_place_id?: string | null;
  location_lat?: number | null;
  location_lng?: number | null;
  location_provider?: "google_places" | "map_coordinates" | null;
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
  canonical_hash?: string | null;
  reported_at: number | null;
  size_bytes: number;
  title: string | null;
  deleted_at: number | null;
  purge_at: number | null;
  upload_consent_at: number | null;
  upload_policy_version: string | null;
  origin: "guest" | "official";
  uploaded_by_user_id: string | null;
};

export type EventMemberRow = {
  user_id: string;
  name: string;
  email: string;
  role: EventRole | "professional";
  created_at: number;
  access_status?: "invited" | "accepted" | null;
};

export type EventInvitationRow = {
  id: string;
  event_id: string;
  email: string;
  role: "editor" | "viewer";
  created_at: number;
  expires_at: number;
  accepted_at: number | null;
  declined_at: number | null;
  invitation_kind: "member" | "professional";
};

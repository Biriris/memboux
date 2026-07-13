export const PRIVACY_REQUEST_TYPES = ["access", "correction", "deletion", "restriction", "objection", "other"] as const;
export type PrivacyRequestType = typeof PRIVACY_REQUEST_TYPES[number];

export function validPrivacyRequestType(value: string): value is PrivacyRequestType {
  return PRIVACY_REQUEST_TYPES.includes(value as PrivacyRequestType);
}

export function validPrivacyEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

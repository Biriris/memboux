import type { Locale } from "./i18n";

const AUTOCOMPLETE_URL = "https://places.googleapis.com/v1/places:autocomplete";
const PLACE_ID_PATTERN = /^[A-Za-z0-9_-]{5,300}$/;

export type PlaceSuggestion = {
  placeId: string;
  label: string;
};

export type ResolvedPlace = PlaceSuggestion & {
  lat: number;
  lng: number;
  provider: "google_places";
};

export type StoredEventPlace = {
  location: string | null;
  location_place_id: string | null;
  location_lat: number | null;
  location_lng: number | null;
  location_provider: "google_places" | "map_coordinates" | null;
};

export class PlaceInputError extends Error {
  constructor(public readonly reason: "selection_required" | "unavailable") {
    super(reason);
  }
}

export class GooglePlacesError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly requestId: string,
  ) {
    super(`Google Places request failed (${status}, ${code}, ${requestId})`);
  }
}

function validSessionToken(value?: string | null) {
  const token = String(value ?? "").trim();
  return /^[A-Za-z0-9_-]{8,100}$/.test(token) ? token : undefined;
}

async function googleJson(response: Response) {
  const data = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok) {
    const requestId = response.headers.get("x-request-id") ?? "unknown";
    const upstream = data?.error && typeof data.error === "object" ? data.error as Record<string, unknown> : null;
    const code = typeof upstream?.status === "string" ? upstream.status : `HTTP_${response.status}`;
    throw new GooglePlacesError(response.status, code.slice(0, 80), requestId.slice(0, 120));
  }
  if (!data) throw new GooglePlacesError(502, "INVALID_RESPONSE", "unknown");
  return data;
}

export async function searchGooglePlaces(
  apiKey: string,
  input: string,
  locale: Locale,
  sessionToken?: string | null,
  fetcher: typeof fetch = fetch,
): Promise<PlaceSuggestion[]> {
  const query = input.trim().slice(0, 100);
  if (query.length < 2) return [];
  const token = validSessionToken(sessionToken);
  const response = await fetcher(AUTOCOMPLETE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text",
    },
    body: JSON.stringify({ input: query, languageCode: locale, ...(token ? { sessionToken: token } : {}) }),
  });
  const data = await googleJson(response) as {
    suggestions?: Array<{ placePrediction?: { placeId?: unknown; text?: { text?: unknown } } }>;
  };
  return (data.suggestions ?? []).flatMap(({ placePrediction }) => {
    const placeId = typeof placePrediction?.placeId === "string" ? placePrediction.placeId : "";
    const label = typeof placePrediction?.text?.text === "string" ? placePrediction.text.text.trim() : "";
    return PLACE_ID_PATTERN.test(placeId) && label ? [{ placeId, label: label.slice(0, 200) }] : [];
  }).slice(0, 6);
}

export async function resolveGooglePlace(
  apiKey: string,
  placeId: string,
  locale: Locale,
  sessionToken?: string | null,
  fetcher: typeof fetch = fetch,
): Promise<ResolvedPlace> {
  const canonicalId = placeId.trim();
  if (!PLACE_ID_PATTERN.test(canonicalId)) throw new Error("Invalid Google Place ID");
  const params = new URLSearchParams({ languageCode: locale });
  const token = validSessionToken(sessionToken);
  if (token) params.set("sessionToken", token);
  const response = await fetcher(`https://places.googleapis.com/v1/places/${encodeURIComponent(canonicalId)}?${params}`, {
    headers: {
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "id,displayName,formattedAddress,location",
    },
  });
  const data = await googleJson(response) as {
    id?: unknown;
    displayName?: { text?: unknown };
    formattedAddress?: unknown;
    location?: { latitude?: unknown; longitude?: unknown };
  };
  const resolvedId = typeof data.id === "string" ? data.id : "";
  const lat = Number(data.location?.latitude);
  const lng = Number(data.location?.longitude);
  const formattedAddress = typeof data.formattedAddress === "string" ? data.formattedAddress.trim() : "";
  const displayName = typeof data.displayName?.text === "string" ? data.displayName.text.trim() : "";
  const label = formattedAddress || displayName || (Number.isFinite(lat) && Number.isFinite(lng) ? `${lat.toFixed(6)}, ${lng.toFixed(6)}` : "");
  if (!PLACE_ID_PATTERN.test(resolvedId) || !label || !Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new Error("Google Places returned an incomplete location");
  }
  return { placeId: resolvedId, label: label.slice(0, 200), lat, lng, provider: "google_places" };
}

export async function resolveEventPlaceInput(options: {
  apiKey?: string;
  location: unknown;
  placeId: unknown;
  latitude?: unknown;
  longitude?: unknown;
  clearLocation?: unknown;
  locale: Locale;
  sessionToken?: unknown;
  current?: StoredEventPlace;
  fetcher?: typeof fetch;
}): Promise<StoredEventPlace> {
  const label = String(options.location ?? "").trim().slice(0, 200);
  const placeId = String(options.placeId ?? "").trim();
  const clear = String(options.clearLocation ?? "0") === "1";
  const latitude = Number(String(options.latitude ?? "").trim());
  const longitude = Number(String(options.longitude ?? "").trim());
  const hasMapCoordinates = Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
    && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180
    && String(options.latitude ?? "").trim() !== "" && String(options.longitude ?? "").trim() !== "";
  if (clear || (!label && !hasMapCoordinates)) {
    return { location: null, location_place_id: null, location_lat: null, location_lng: null, location_provider: null };
  }
  if (options.current && label === (options.current.location ?? "") && (!placeId || placeId === options.current.location_place_id)
    && (!hasMapCoordinates || (latitude === options.current.location_lat && longitude === options.current.location_lng))) {
    return options.current;
  }
  if (!placeId && hasMapCoordinates) {
    return {
      location: label || `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
      location_place_id: null,
      location_lat: latitude,
      location_lng: longitude,
      location_provider: "map_coordinates",
    };
  }
  if (!placeId) {
    if (!options.apiKey) {
      return { location: label, location_place_id: null, location_lat: null, location_lng: null, location_provider: null };
    }
    throw new PlaceInputError("selection_required");
  }
  if (!options.apiKey) throw new PlaceInputError("unavailable");
  try {
    const resolved = await resolveGooglePlace(
      options.apiKey,
      placeId,
      options.locale,
      String(options.sessionToken ?? ""),
      options.fetcher,
    );
    return {
      location: resolved.label,
      location_place_id: resolved.placeId,
      location_lat: resolved.lat,
      location_lng: resolved.lng,
      location_provider: resolved.provider,
    };
  } catch (error) {
    if (error instanceof PlaceInputError) throw error;
    throw new PlaceInputError("unavailable");
  }
}

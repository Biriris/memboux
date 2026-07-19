import { describe, expect, it, vi } from "vitest";
import { GooglePlacesError, PlaceInputError, resolveEventPlaceInput, resolveGooglePlace, searchGooglePlaces } from "../src/places";

describe("Google Places integration", () => {
  it("returns only valid place predictions", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ suggestions: [
      { placePrediction: { placeId: "ChIJ12345", text: { text: "Athens, Greece" } } },
      { queryPrediction: { text: { text: "ignored" } } },
    ] }), { status: 200 })) as unknown as typeof fetch;
    await expect(searchGooglePlaces("secret", "Athens", "en", "session_12345", fetcher)).resolves.toEqual([
      { placeId: "ChIJ12345", label: "Athens, Greece" },
    ]);
    expect(fetcher).toHaveBeenCalledWith(
      "https://places.googleapis.com/v1/places:autocomplete",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("keeps the upstream status without exposing the API key", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      error: { code: 403, status: "PERMISSION_DENIED", message: "API key rejected" },
    }), { status: 403, headers: { "x-request-id": "maps-request-1" } })) as unknown as typeof fetch;

    await expect(searchGooglePlaces("super-secret-key", "Athens", "en", null, fetcher)).rejects.toMatchObject<Partial<GooglePlacesError>>({
      status: 403,
      code: "PERMISSION_DENIED",
      requestId: "maps-request-1",
    });
    await expect(searchGooglePlaces("super-secret-key", "Athens", "en", null, fetcher)).rejects.not.toThrow("super-secret-key");
  });

  it("resolves canonical coordinates on the server", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      id: "ChIJ12345",
      formattedAddress: "Athens, Greece",
      location: { latitude: 37.9838, longitude: 23.7275 },
    }), { status: 200 })) as unknown as typeof fetch;
    await expect(resolveGooglePlace("secret", "ChIJ12345", "en", "session_12345", fetcher)).resolves.toEqual({
      placeId: "ChIJ12345",
      label: "Athens, Greece",
      lat: 37.9838,
      lng: 23.7275,
      provider: "google_places",
    });
  });

  it("keeps coordinates when a church has no formatted street address", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      id: "ChIJChurch123",
      displayName: { text: "Church of Saint Nicholas" },
      location: { latitude: 36.3932, longitude: 25.4615 },
    }), { status: 200 })) as unknown as typeof fetch;
    await expect(resolveGooglePlace("secret", "ChIJChurch123", "en", null, fetcher)).resolves.toEqual({
      placeId: "ChIJChurch123",
      label: "Church of Saint Nicholas",
      lat: 36.3932,
      lng: 25.4615,
      provider: "google_places",
    });
    expect(fetcher).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      headers: expect.objectContaining({ "X-Goog-FieldMask": "id,displayName,formattedAddress,location" }),
    }));
  });

  it("requires a selected prediction when Places is configured", async () => {
    await expect(resolveEventPlaceInput({
      apiKey: "secret",
      location: "Typed but not selected",
      placeId: "",
      locale: "en",
    })).rejects.toMatchObject<Partial<PlaceInputError>>({ reason: "selection_required" });
  });

  it("preserves a previously locked location when unrelated details change", async () => {
    const current = {
      location: "Athens, Greece",
      location_place_id: "ChIJ12345",
      location_lat: 37.9838,
      location_lng: 23.7275,
      location_provider: "google_places" as const,
    };
    await expect(resolveEventPlaceInput({
      apiKey: "secret",
      location: current.location,
      placeId: current.location_place_id,
      locale: "en",
      current,
    })).resolves.toEqual(current);
  });

  it("accepts an exact point selected from the map", async () => {
    await expect(resolveEventPlaceInput({
      apiKey: "secret",
      location: "Small countryside chapel",
      placeId: "",
      latitude: "37.1234567",
      longitude: "23.7654321",
      locale: "en",
    })).resolves.toEqual({
      location: "Small countryside chapel",
      location_place_id: null,
      location_lat: 37.1234567,
      location_lng: 23.7654321,
      location_provider: "map_coordinates",
    });
  });
});

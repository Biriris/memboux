import { describe, expect, it } from "vitest";
import {
  commerceLaunchReady,
  commerceAlbumLimit,
  complimentaryEventActivationAvailable,
  commerceProductDescription,
  commerceProductName,
  formatCommerceMoney,
  type CommerceProduct,
} from "../src/commerce";
import {
  commerceCheckoutCopy,
  commercePlanSelectionAssets,
} from "../src/routes/commerce";

const product: CommerceProduct = {
  product_key: "event_pass",
  scope: "event",
  billing_model: "one_time",
  name_en: "Event Pass",
  name_el: "Πακέτο Event",
  name_fr: "Pass Événement",
  name_de: "Event-Pass",
  name_es: "Pase de Evento",
  name_it: "Pass Evento",
  description_en: "Unlock one event.",
  description_el: "Ξεκλείδωσε ένα event.",
  description_fr: "Débloquez un événement.",
  description_de: "Schalte ein Event frei.",
  description_es: "Desbloquea un evento.",
  description_it: "Sblocca un evento.",
  amount_minor: 1900,
  currency: "EUR",
  media_limit: 500,
  event_duration_days: 365,
  guest_access_enabled: 1,
  original_downloads_enabled: 1,
  active: 1,
  checkout_enabled: 0,
  sort_order: 10,
};

describe("provider-neutral commerce catalog", () => {
  it("maps event packages to their custom album entitlement", () => {
    expect(commerceAlbumLimit({ product_key: "event_free", album_limit: null })).toBe(1);
    expect(commerceAlbumLimit({ product_key: "event_pass", album_limit: null })).toBe(3);
    expect(commerceAlbumLimit({ product_key: "event_plus", album_limit: null })).toBe(5);
    expect(commerceAlbumLimit({ product_key: "event_pass", album_limit: 7 })).toBe(7);
  });

  it("localizes immutable product presentation", () => {
    expect(commerceProductName(product, "el")).toBe("Πακέτο Event");
    expect(commerceProductName(product, "en")).toBe("Event Pass");
    expect(commerceProductDescription(product, "el")).toContain("Ξεκλείδωσε");
    expect(commerceProductName(product, "fr")).toBe("Pass Événement");
    expect(commerceProductDescription(product, "de")).toContain("Event");
    expect(commerceProductName(product, "es")).toBe("Pase de Evento");
    expect(commerceProductName(product, "it")).toBe("Pass Evento");
  });

  it("stores money in minor units and formats it only for display", () => {
    expect(formatCommerceMoney(product.amount_minor, product.currency, "en")).toContain("19.00");
    expect(formatCommerceMoney(product.amount_minor, product.currency, "el")).toContain("19,00");
  });

  it("keeps checkout disabled until legal launch", () => {
    expect(product.checkout_enabled).toBe(0);
    expect(commerceLaunchReady({
      payments_enabled: 0,
      legal_entity_ready: 1,
      tax_registration_ready: 1,
      invoicing_ready: 1,
      refund_policy_ready: 1,
      sales_terms_ready: 1,
      stripe_account_ready: 1,
      updated_at: 1,
    })).toBe(false);
    expect(commerceLaunchReady({
      payments_enabled: 1,
      legal_entity_ready: 1,
      tax_registration_ready: 1,
      invoicing_ready: 1,
      refund_policy_ready: 1,
      sales_terms_ready: 1,
      stripe_account_ready: 1,
      updated_at: 1,
    })).toBe(true);
  });

  it("offers complimentary activation from preview, Free or expiry, but not after unlock", () => {
    expect(complimentaryEventActivationAvailable({ accessState: "preview", launchReady: false, owner: true })).toBe(true);
    expect(complimentaryEventActivationAvailable({ accessState: "free", launchReady: false, owner: true })).toBe(true);
    expect(complimentaryEventActivationAvailable({ accessState: "expired", launchReady: false, owner: true })).toBe(true);
    expect(complimentaryEventActivationAvailable({ accessState: "unlocked", launchReady: false, owner: true })).toBe(false);
    expect(complimentaryEventActivationAvailable({ accessState: "free", launchReady: true, owner: true })).toBe(false);
    expect(complimentaryEventActivationAvailable({ accessState: "free", launchReady: false, owner: false })).toBe(false);
  });

  it("presents the direct event unlock journey in every supported language", () => {
    for (const locale of ["en", "el", "fr", "de", "es", "it"] as const) {
      const localized = commerceCheckoutCopy[locale];
      expect(localized.title.length).toBeGreaterThan(20);
      expect(localized.noCart.length).toBeGreaterThan(20);
      expect(localized.trialFiles).toContain("50");
      expect(localized.trialDays).not.toContain("37");
      expect(localized.savedNotice.length).toBeGreaterThan(35);
      expect(localized.noChargeLabel).toContain("0");
      expect(localized.draftReference.length).toBeGreaterThan(5);
    }
    expect(new Set(["en", "el", "fr", "de", "es", "it"].map((locale) => commerceCheckoutCopy[locale as keyof typeof commerceCheckoutCopy].savedNotice)).size).toBe(6);
  });

  it("updates the selected package immediately without submitting the draft", () => {
    for (const locale of ["en", "el", "fr", "de", "es", "it"] as const) {
      const assets = commercePlanSelectionAssets(locale);
      expect(assets.style).toContain('[data-product-card][data-selected="true"]');
      expect(assets.style).toContain('[data-product-card][data-selected="false"]');
      expect(assets.script).toContain("radio.addEventListener('input'");
      expect(assets.script).toContain("radio.addEventListener('change'");
      expect(assets.script).toContain("card.dataset.selected=String(on)");
      expect(assets.script).toContain("card.setAttribute('aria-selected',String(on))");
      expect(assets.script).not.toContain("submit()");
      expect(assets.script).not.toContain("fetch(");
      expect(assets.script).toContain(JSON.stringify(commerceCheckoutCopy[locale].selected));
      expect(assets.script).toContain(JSON.stringify(commerceCheckoutCopy[locale].select));
    }
  });
});

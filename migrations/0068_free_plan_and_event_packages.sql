-- Introduce the first Memboux package foundation without enabling payments.
-- The existing `trial` state is retained as an internal compatibility name;
-- product surfaces present it as the Memboux Free plan.

UPDATE event_access
SET media_limit = MAX(media_limit, 50),
    trial_ends_at = CASE
      WHEN access_state = 'trial' AND trial_ends_at IS NOT NULL
        THEN MAX(trial_ends_at, unixepoch('now') * 1000 + 37 * 86400000)
      ELSE trial_ends_at
    END,
    updated_at = unixepoch('now') * 1000
WHERE enforcement_state = 'enforced'
  AND access_state IN ('preview', 'trial');

UPDATE commerce_products SET
  name_en='Moments', name_el='Moments', name_fr='Moments', name_de='Moments', name_es='Moments', name_it='Moments',
  description_en='One complete event gallery with guest uploads, slideshow, guestbook and original downloads.',
  description_el='Ένα ολοκληρωμένο event gallery με uploads καλεσμένων, slideshow, ευχολόγιο και λήψη πρωτότυπων.',
  description_fr='Une galerie complète avec ajouts invités, diaporama, livre d’or et téléchargement des originaux.',
  description_de='Eine vollständige Event-Galerie mit Gäste-Uploads, Slideshow, Gästebuch und Original-Downloads.',
  description_es='Una galería completa con subidas de invitados, presentación, libro de visitas y originales.',
  description_it='Una galleria completa con upload degli invitati, slideshow, guestbook e download originali.',
  amount_minor=3900, media_limit=5000, event_duration_days=365, sort_order=10, checkout_enabled=0,
  updated_at=unixepoch('now') * 1000
WHERE product_key='event_pass';

UPDATE commerce_products SET
  name_en='Celebration', name_el='Celebration', name_fr='Celebration', name_de='Celebration', name_es='Celebration', name_it='Celebration',
  description_en='The complete premium event experience with extended capacity and long-term access.',
  description_el='Η ολοκληρωμένη premium εμπειρία event με αυξημένη χωρητικότητα και μακροχρόνια πρόσβαση.',
  description_fr='L’expérience événement premium avec capacité étendue et accès longue durée.',
  description_de='Das komplette Premium-Event-Erlebnis mit mehr Kapazität und langfristigem Zugriff.',
  description_es='La experiencia premium completa con mayor capacidad y acceso prolongado.',
  description_it='L’esperienza premium completa con capacità estesa e accesso prolungato.',
  amount_minor=7900, media_limit=20000, event_duration_days=730, sort_order=20, checkout_enabled=0,
  updated_at=unixepoch('now') * 1000
WHERE product_key='event_plus';

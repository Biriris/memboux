ALTER TABLE commerce_products ADD COLUMN name_fr TEXT NOT NULL DEFAULT '';
ALTER TABLE commerce_products ADD COLUMN name_de TEXT NOT NULL DEFAULT '';
ALTER TABLE commerce_products ADD COLUMN name_es TEXT NOT NULL DEFAULT '';
ALTER TABLE commerce_products ADD COLUMN name_it TEXT NOT NULL DEFAULT '';
ALTER TABLE commerce_products ADD COLUMN description_fr TEXT NOT NULL DEFAULT '';
ALTER TABLE commerce_products ADD COLUMN description_de TEXT NOT NULL DEFAULT '';
ALTER TABLE commerce_products ADD COLUMN description_es TEXT NOT NULL DEFAULT '';
ALTER TABLE commerce_products ADD COLUMN description_it TEXT NOT NULL DEFAULT '';

UPDATE commerce_products SET
  name_fr='Pass Événement',
  name_de='Event-Pass',
  name_es='Pase de Evento',
  name_it='Pass Evento',
  description_fr='Débloquez un événement pour les invités, les ajouts et le téléchargement des originaux.',
  description_de='Schalte ein Event für Gäste, Uploads und Original-Downloads frei.',
  description_es='Desbloquea un evento para invitados, subidas y descargas de originales.',
  description_it='Sblocca un evento per invitati, caricamenti e download degli originali.'
WHERE product_key='event_pass';

UPDATE commerce_products SET
  name_fr='Événement Plus',
  name_de='Event Plus',
  name_es='Evento Plus',
  name_it='Evento Plus',
  description_fr='Capacité étendue pour les grandes célébrations et la livraison professionnelle.',
  description_de='Mehr Kapazität für größere Feiern und professionelle Auslieferung.',
  description_es='Capacidad ampliada para grandes celebraciones y entregas profesionales.',
  description_it='Capacità estesa per grandi celebrazioni e consegne professionali.'
WHERE product_key='event_plus';


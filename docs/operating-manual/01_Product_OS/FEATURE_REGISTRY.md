# Feature Registry

## Implemented foundation

Use the [Repository Audit](../../repository-audit/README.md) for verified routes,
schema and behavior. Relevant existing foundations include self-service event
creation, event membership, guest access, professional profiles/assignments,
event access states, account entitlements/subscription/payment snapshots,
commerce catalog/order drafts and provider-neutral fulfillment logic.

## Approved, not implemented

| Capability | Direction | Authority |
|---|---|---|
| Useful free event package | Free with transparent fair-use limits | [Hybrid model](HYBRID_COMMERCIAL_MODEL.md) |
| One-time premium wedding | Event-scoped direct purchase | [Hybrid model](HYBRID_COMMERCIAL_MODEL.md) |
| Professional subscription | Organization capacity, monthly/annual | [ADR-0008](../14_ADRs/ADR_0008_HYBRID_COMMERCE_OWNERSHIP_AND_ROLES.md) |
| Professional event credit | One premium client event without subscription | [Hybrid model](HYBRID_COMMERCIAL_MODEL.md) |
| Professional organization | Owner, billing, manager and staff boundaries | [ADR-0008](../14_ADRs/ADR_0008_HYBRID_COMMERCE_OWNERSHIP_AND_ROLES.md) |
| Couple ownership handoff | Dedicated, atomic and auditable | [ADR-0008](../14_ADRs/ADR_0008_HYBRID_COMMERCE_OWNERSHIP_AND_ROLES.md) |
| Planner manager | Event-scoped and narrower than owner | [ADR-0008](../14_ADRs/ADR_0008_HYBRID_COMMERCE_OWNERSHIP_AND_ROLES.md) |
| Hosted payment activation | One-time and recurring, webhook fulfilled | [Hybrid model](HYBRID_COMMERCIAL_MODEL.md) |
| Marketplace | Later, separately designed commission channel | Separate future ADR required |

Candidate prices and limits remain validation inputs, not implemented product
facts.

## Event media hub

Migration [`0069_event_media_hub.sql`](../../../migrations/0069_event_media_hub.sql)
establishes the implemented event media hub:

- owners can create public, PIN-protected, or private-link albums with separate
  upload and download policies;
- guests can navigate the album collection and upload into an eligible album;
- uploads retain guest-session attribution and an explicit moderation state;
- owners can configure moderation, guest downloads, guestbook privacy,
  slideshow source album, and slideshow interval;
- the Media Center links albums, aggregate analytics, slideshow, QR Studio, and
  a streaming ZIP export;
- analytics stores aggregate activity and pseudonymous visitor hashes, not raw
  IP addresses, contact details, private media payloads, or user agents.

The ZIP is a bounded-memory HTTP stream, not a Queue/Workflow background archive,
and is not retained in R2. Video-guestbook columns are schema groundwork only;
the capture workflow is not implemented and must not be marketed as available.

## QR Template Studio

The authenticated event dashboard includes a native QR Template Studio at
`GET /dashboard/:code/qr-templates`. It generates 216 editable combinations
from 12 design families, six print/social formats and three copy presets. The
editor automatically uses the event name, date and QR destination, and supports
the guest gallery, event website, official album and event album destinations.

Exports are available as vector SVG, high-resolution PNG and browser print/PDF.
No Canva account, Canva API integration or generated-image service is required.
Export actions are emitted as structured Worker logs through the authenticated
`POST /api/account/events/:code/qr-template-activity` endpoint. Cross-device
design draft persistence and Canva Autofill export are not implemented.

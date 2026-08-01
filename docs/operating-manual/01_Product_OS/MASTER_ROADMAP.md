# Master Roadmap

## P0 — Protect the foundation

- Preserve current event owners and production access.
- Resolve ownership-transfer, free-event lifecycle, retention, and payment-readiness ambiguities.
- Define product analytics and operational metrics before changing business rules.

## P1 — Commercial policy and entitlement foundation

- Validate direct packages, professional tiers, fair-use limits and unit
  economics.
- Define event-scoped one-time entitlements and organization-scoped subscription
  capacity.
- Keep self-service wedding creation available.
- Separate billing, organization, event and guest permission planes.
- Add last-owner protection, migration policy and grandfathering.

## P2 — Self-service and professional platform

- Adapt the existing catalog/order foundation to free and one-time premium
  self-service weddings.
- Add verified professional lifecycle and admin review.
- Add organizations, billing roles, planners and assigned staff.
- Active-wedding capacity and subscription enforcement.
- Add event credits for low-volume professionals.
- Dedicated couple invitation and atomic ownership handoff.
- Restricted planner-manager permissions.
- Professional dashboard for awaiting-handoff, active, archived, and revoked weddings.
- Payment grace/cancellation behavior that never removes couple ownership.
- Complimentary/manual beta plans before broad card billing.
- Free lifecycle and fair-use policy for supported events.

## P3 — Payment activation and growth

- Hosted direct checkout, subscriptions, customer portal and replay-safe signed
  webhooks after legal/tax readiness.
- Limited paid rollout behind the existing fail-closed launch guard.
- Professional teams and organization roles.
- White-label branding and custom domains.
- Archive extensions and validated event add-ons.
- Planner discovery/referral experiments; marketplace payments require a
  separate ADR.
- Prints, albums, and adjacent memory commerce as separate validated products.

## P4 — Innovation

- Privacy-preserving AI assistance and memory organization.
- Photobooth partner ingestion into an event-bound gallery, so couples can keep
  the photobooth photographs together with the rest of their Memboux memories.
- Enterprise integrations and API access.
- Advanced event engagement and professional analytics.

### Future photobooth partner integration — proposal

This is a future product direction, not current repository behavior. Memboux may
work with photobooth companies so an authorized provider can deliver a session's
photographs directly to the correct wedding or other supported event. The couple
should receive the photographs in a clearly identified photobooth collection
inside Memboux, without needing to collect download links or transfer files
manually after the event.

Any implementation proposal must define and verify:

- event-scoped partner authorization with no access to unrelated events or media;
- a secure event/session pairing flow that prevents delivery to the wrong couple;
- retryable bulk upload, idempotency, duplicate detection and partial-failure
  recovery;
- clear media provenance, provider attribution and an owner-controlled collection;
- consent, moderation, deletion, retention, original-download and storage rules;
- upload limits, supported formats, image processing and operational cost controls;
- audit logs, revocation, rate limits and incident handling for compromised partner
  credentials; and
- a commercial model for partners, event owners and any storage or processing
  add-on.

Provider API shape, authentication method, gallery UX, pricing and rollout partners
are intentionally unknown until discovery with photobooth companies is completed.

The detailed scope, risks, gates and success metrics are in the
[Hybrid commercial model](HYBRID_COMMERCIAL_MODEL.md). Roadmap ordering is
directional until individual implementation phases are approved.

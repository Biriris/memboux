# ADR-0008: Hybrid commerce, ownership and role boundaries

## Status

Accepted product and architecture direction; implementation pending

## Date

2026-08-01

## Context

ADR-0007 proposed that only verified professionals could create new weddings.
That approach created recurring B2B revenue but unnecessarily excluded direct
self-service couples and weakened organic acquisition.

Memboux needs a model that supports consumer reach, professional distribution,
recurring revenue and trust without charging guests or tying ownership of
private memories to a third party's subscription.

Current implementation facts remain those recorded in the
[Repository Audit](../../repository-audit/README.md). Payment-provider checkout,
professional organizations, planner-manager permissions and ownership handoff
are not implemented.

The detailed approved product direction is documented in the
[Hybrid commercial model](../01_Product_OS/HYBRID_COMMERCIAL_MODEL.md).

## Decision

1. Guests do not pay for ordinary viewing or contribution permitted by an
   event's access policy.
2. Self-service event and wedding creation remains available to ordinary
   authenticated users under the applicable free or paid package policy.
3. Premium direct weddings use a one-time, event-scoped entitlement.
4. Verified professionals may use a monthly/annual workspace subscription or a
   one-time event credit to create and manage client weddings.
5. Professional subscriptions are metered primarily by active-wedding capacity.
6. Professionals choose the retail price they charge independently sourced
   clients, and Memboux takes no percentage of that external transaction.
7. A future marketplace may charge a transparent commission only for
   Memboux-originated and Memboux-facilitated transactions. Marketplace
   architecture requires a separate ADR.
8. Platform administration, professional organization membership, event
   permissions and guest access are separate authorization planes.
9. Billing authority never grants event-content access by itself.
10. The couple has durable event ownership. A planner is a restricted manager,
    not a platform admin or unrestricted co-owner.
11. A professional's cancellation, payment failure, suspension or removal does
    not delete client data or revoke couple ownership.
12. A purchased event entitlement remains event-scoped when the payer's event
    role changes.
13. Existing event owners and access are grandfathered through rollout.
14. Provider-verified, replay-safe server state is the source of truth for
    fulfillment; browser success state is never sufficient.
15. Private media and participant behavior are not used as advertising
    inventory.

## Role boundary

The target role planes are:

- Memboux platform workforce roles;
- professional organization owner, billing, manager and staff responsibilities;
- event-scoped couple owner, planner manager, media editor and viewer
  responsibilities; and
- guest viewing/contribution capabilities derived from the event access policy.

These are capability boundaries, not approved database enum names. Schema and
API identifiers require a separate implementation design. The existing global
`editor` role must not be broadened to simulate a planner manager.

## Entitlement boundary

- One-time consumer purchases and professional event credits grant an
  entitlement to a specific event.
- Professional subscriptions grant organization workspace capacity.
- Entitlement controls package capability; authorization controls who may use
  that capability.
- Losing a payer, planner or subscription does not remove the event's valid
  owners or unexpectedly delete media.

## Payment boundary

Initial payment work will use the existing provider-neutral commerce model and
prefer hosted provider surfaces for checkout and customer billing management.
Fulfillment must be signature-verified, idempotent, auditable and gated behind
the existing fail-closed launch setting.

A shopping cart is not required for initial one-event purchases. It may be
introduced when independent add-ons make multi-item checkout a real user need.

## Consequences

### Positive

- Preserves both direct consumer and professional acquisition channels.
- Combines one-time event revenue with recurring professional revenue.
- Gives professionals a strong resale incentive without taxing their own leads.
- Keeps guest participation friction low.
- Protects couple ownership and data continuity.
- Supports future teams, white label, add-ons and marketplace growth.

### Negative

- Requires more entitlement paths than a professional-only model.
- Requires explicit organization, event and billing role separation.
- Requires careful capacity, handoff, cancellation and payer-change handling.
- Makes product catalog and lifecycle migration more complex.
- Requires unit-economics validation for a useful free tier.

## Alternatives considered

### Professional-only wedding creation

Superseded because it prevents direct self-service conversion and creates a
gatekeeper for couples who do not use a planner.

### Direct consumer purchases only

Rejected because one-time wedding purchases alone do not create the desired
recurring professional revenue or distribution loop.

### Guests pay to view or upload

Rejected because it damages event activation, viral distribution and trust.

### Commission on every planner-client transaction

Rejected because Memboux should not tax independently sourced relationships it
did not originate or facilitate.

### Planner remains the event owner

Rejected because business closure, disputes or subscription failure could
strand the couple's private memories.

### Billing roles imply content access

Rejected as a least-privilege and privacy violation.

## Implementation conditions

Before production rollout, the relevant phase must define and test:

- final packages, prices, limits and unit economics;
- schema and forward-only migrations;
- professional verification and organization membership;
- event-scoped entitlement and active-capacity rules;
- two-owner/last-owner safeguards and professional handoff recovery;
- payment, webhook, refund, failure and reconciliation behavior;
- legal, tax, invoicing, terms and retention requirements;
- migration and grandfathering for current events; and
- rollout, observability and rollback boundaries.

This ADR accepts the direction, not unreviewed conceptual route, table, role or
provider names.

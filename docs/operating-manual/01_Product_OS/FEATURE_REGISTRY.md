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

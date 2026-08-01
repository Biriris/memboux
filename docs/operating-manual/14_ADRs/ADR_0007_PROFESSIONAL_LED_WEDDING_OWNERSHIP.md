# ADR-0007: Professional-led wedding creation and couple ownership

## Status

Superseded by [ADR-0008](ADR_0008_HYBRID_COMMERCE_OWNERSHIP_AND_ROLES.md)

This proposal was never implemented. It is retained as decision history. The
professional-only creation rule was replaced by a hybrid model that keeps
self-service wedding creation available.

## Context

The current application allows any authenticated user to create a wedding, makes the creator an event `owner`, and treats professional assignment primarily as official-album access. There is no registered ownership-transfer flow. Professional profiles are self-activated and do not currently prove verification or subscription eligibility.

The proposed business model requires verified professionals to create weddings under a recurring Memboux subscription, while couples retain durable ownership and guests participate for free. Supported non-wedding events are intended to remain free for ordinary users.

The detailed product proposal and verified repository starting point are documented in [Professional-led weddings](../01_Product_OS/PROFESSIONAL_LED_WEDDINGS.md).

## Proposed decision

1. Only a server-verified, eligible professional may initiate a new wedding after the rollout boundary.
2. Wedding creation establishes an event-scoped planner-management relationship; it does not grant platform-administrator authority.
3. A dedicated invitation and atomic handoff operation establishes the couple as durable event owner.
4. The planner remains a restricted manager and cannot transfer ownership, remove the last couple owner, or permanently delete the wedding.
5. Professional subscription state controls creation of new weddings and active-wedding capacity, not the couple's continued access to an existing wedding.
6. Cancellation, payment failure, suspension, or removal of a professional must not delete the wedding or revoke the couple's ownership.
7. Ordinary event invitations remain non-owner invitations. Ownership handoff is a separate high-risk contract.
8. Existing weddings and current owners are grandfathered; no role is inferred or rewritten automatically.
9. Supported non-wedding events use a separate free-event eligibility/lifecycle policy.
10. Historical migrations remain unchanged; implementation uses forward migrations and explicit backfill policy.

## Permission boundary

The future planner role must be narrower than owner and broader than the current editor. It may manage wedding configuration and assigned collaborators, but ownership, permanent deletion, and last-owner protection remain couple-controlled.

The implementation may extend professional assignments, introduce an event role, or move toward capability grants. This ADR does not select the database representation until schema design verifies the safest fit with current constraints.

## Consequences

### Positive

- Establishes recurring B2B revenue without charging guests.
- Gives professionals freedom to price and bundle their client service.
- Preserves couple trust and data continuity.
- Creates organic user acquisition when couples and guests later create free events.
- Separates business subscription entitlement from event ownership.
- Provides a foundation for professional teams, white label, and marketplace discovery.

### Negative

- Requires new schema, authorization, invitation, lifecycle, admin, and billing work.
- Introduces a high-risk ownership handoff that requires transaction and audit guarantees.
- Requires explicit handling for cancellation, archive, account deletion, capacity reconciliation, and unaccepted invitations.
- Restricting self-service wedding creation may reduce direct consumer conversion and must be measured during rollout.
- The current trial/access model cannot become a free-event model through UI changes alone.

### Operational implications

- Professional verification requires an accountable admin workflow.
- Support must be able to resolve ownership disputes without silently rewriting membership.
- Billing incidents must never cascade into loss of couple data.
- Analytics must measure the professional-to-couple funnel without collecting unnecessary private-event data.

## Alternatives considered

### Couples purchase wedding events directly

Rejected as the primary model because it produces one-time consumer revenue and makes every couple a separate acquisition problem. It may remain a future fallback if professional-only creation blocks meaningful demand.

### Planner remains permanent owner

Rejected because subscription cancellation, business closure, or disputes could strand the couple's private memories and create unacceptable trust and privacy risk.

### Couple and planner are unrestricted co-owners

Rejected because either party could remove the other or perform destructive actions without a clear final authority.

### Reuse the current editor role for planners

Rejected because editor currently manages media only. Broadening it globally would change permissions for every existing event and collaborator.

### Allow any self-declared professional to create weddings

Rejected because the current professional checkbox is not sufficient to protect plan enforcement, quality, fraud, or platform reputation.

## Acceptance conditions

This ADR can move to Accepted only when Product and Engineering approve:

- couple ownership cardinality;
- professional verification criteria;
- planner permission matrix;
- active-wedding capacity definition;
- subscription grace and cancellation behavior;
- free-event lifecycle and fair-use policy;
- existing-event migration/backfill policy; and
- ownership-handoff recovery and support procedure.

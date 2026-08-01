# Hybrid commercial model

**Status:** Approved product direction; implementation pending  
**Approved:** 2026-08-01  
**Implementation state:** Product direction partially implemented; billing and professional commercial roles pending

## Purpose

This document is the product authority for future work on Memboux pricing,
payments, professional subscriptions, event entitlements, commercial roles and
marketplace revenue. It replaces the professional-only wedding proposal with a
hybrid direct-to-consumer and business-to-business model.

This document does not describe current production behavior. The current
implementation remains authoritative and is documented in the
[Repository Audit](../../repository-audit/README.md). Conceptual role, plan and
entitlement names in this document are not existing schema or API identifiers.

## Decision summary

Memboux will use complementary acquisition and revenue channels:

1. Guests participate without paying and without a mandatory account for
   ordinary event viewing or contribution.
2. Couples and other organizers can create events directly. Self-service
   weddings are not restricted to professionals.
3. A useful free event experience drives adoption and trust.
4. Couples can purchase a premium wedding license with a one-time payment.
5. Professionals can subscribe monthly or annually for a workspace with a
   defined number of active weddings.
6. Low-volume professionals can purchase an event credit instead of a
   subscription.
7. Professionals set and retain the price they charge their own clients.
8. Memboux charges a marketplace commission only when Memboux originates and
   facilitates the transaction through a future marketplace.
9. Event ownership, content access and billing authority remain separate.
10. Private memories and participant data are never advertising inventory.

## Product promise

> Everyone contributes for free. Couples keep their memories. Professionals
> build a better client experience.

## Why hybrid

The direct channel preserves self-service demand, organic discovery and a
low-friction path for couples who do not use a planner. The professional channel
adds recurring revenue and distribution through planners, photographers,
venues and agencies. Neither channel is allowed to make a couple's continued
access depend on a professional's subscription.

The model intentionally avoids:

- charging guests;
- forcing every wedding through a professional;
- recurring consumer billing for a naturally one-off event without a separate
  recurring service;
- taking a fee from a professional's independently sourced client contract;
- selling private media or behavioral data; and
- disabling or deleting client memories after a failed professional payment.

## Verified current starting point

The following statements are repository facts as of 2026-08-01:

- Any authenticated user can create a supported event type, including
  `wedding`, through `POST /api/account/events` in
  [`src/routes/account.ts`](../../../src/routes/account.ts).
- The event creator becomes an `owner` in `event_members`.
- Current event roles are `owner`, `editor` and `viewer`, with capabilities in
  [`src/access.ts`](../../../src/access.ts).
- Current platform-admin roles and permissions are implemented in
  [`src/admin-rbac.ts`](../../../src/admin-rbac.ts).
- Professional profiles and event assignments exist, but there is no verified
  organization/team subscription model or planner-manager capability.
- Account entitlements, subscriptions and payments exist through migrations
  [`0015_entitlements_and_storage_usage.sql`](../../../migrations/0015_entitlements_and_storage_usage.sql)
  and
  [`0020_account_subscriptions_and_payments.sql`](../../../migrations/0020_account_subscriptions_and_payments.sql).
- The commerce catalog, immutable order snapshots and provider-neutral
  fulfillment infrastructure exist. The registered routes in
  [`src/routes/commerce.ts`](../../../src/routes/commerce.ts) currently stop at
  checkout display and draft creation.
- No production Stripe checkout or payment-provider webhook route is registered.
- Event access currently uses preview, trial, unlocked and expired states. The
  exact current behavior is documented in the
  [Event lifecycle audit](../../repository-audit/EVENT_LIFECYCLE.md).
- Wedding completion now remains a private draft. Explicit publication requires
  a completed setup and active trial/unlocked guest access; owners can unpublish
  without deleting event data.
- Wedding catalog prices are snapshotted per event for the active price-lock
  interval, including add-ons that can be selected after initial setup.
- Event-scoped wedding guest groups, contacts, secure personal invitation links,
  RSVP synchronization and capacity-aware table assignments exist in migration
  [`0061_wedding_guest_planning.sql`](../../../migrations/0061_wedding_guest_planning.sql)
  and [`src/routes/wedding-planning.ts`](../../../src/routes/wedding-planning.ts).
- SMS delivery, payment-provider checkout, professional organizations,
  subscriptions/capacity, ownership handoff, bulk guest import and visual venue
  layouts remain pending.

## Customer and revenue channels

| Channel | Customer | Commercial relationship | Primary revenue |
|---|---|---|---|
| Guest participation | Guest | Free | Acquisition and activation |
| Self-service event | Couple or organizer | Free core experience | Conversion funnel |
| Premium wedding | Couple or organizer | One-time event purchase | Direct event revenue |
| Professional workspace | Planner, studio or agency | Monthly or annual subscription | Recurring revenue |
| Professional event credit | Low-volume professional | One-time per-event purchase | Pay-as-you-go revenue |
| Marketplace | Couple and professional | Memboux-originated facilitated transaction | Transparent commission |
| Add-ons | Event owner or professional | One-time or clearly recurring service | Expansion revenue |

The initial product must launch the first five channels independently of a
marketplace. Marketplace payments, prints, albums, archive extensions, custom
domains and white-label services are separate later products.

## Packaging policy

### Free core

Free must be useful enough to demonstrate the shared-memory outcome. It must not
be a deceptive preview that collects media and then withholds every reasonable
export path. Free usage can still have transparent limits for media count,
video, upload window, storage duration, abuse prevention and support level.

The final free limits require cost modelling and product validation before they
become implementation requirements.

### Direct premium weddings

A direct premium wedding is purchased once for a defined event entitlement.
The entitlement belongs to the event, not merely to the account that paid. It
must state the upload window, media limits, video support, original export,
hosting period, included experiences and renewal options before payment.

Candidate packages for pricing research are:

| Candidate package | Candidate price | Positioning |
|---|---:|---|
| Free Memories | EUR 0 | Useful limited event and conversion path |
| Essential | EUR 49 one-time | Core wedding collection and export |
| Signature | EUR 99 one-time | Full wedding experience and longer hosting |
| Luxe | EUR 179 one-time | Premium presentation, support and branding |

These names, prices and limits are hypotheses, not production commitments. They
must be tested against willingness to pay, storage cost, support cost, VAT and
competitor positioning. Prices must live in server-controlled catalog data or
configuration, never scattered through view code.

Memboux must not promise indefinite hosting until retention cost, backup,
business-continuity and legal obligations are explicitly funded. A fixed archive
term with a clearly priced extension is safer than an undefined "forever" plan.

### Professional workspace

Professional subscriptions are metered primarily by concurrent active wedding
capacity, not guest count. Candidate tiers for validation are:

| Candidate tier | Candidate monthly price | Candidate active weddings |
|---|---:|---:|
| Solo | EUR 49 | 2 |
| Pro | EUR 99 | 5 |
| Studio | EUR 179 | 15 |
| Agency | EUR 299 | 30 |
| Enterprise | Contract | Custom |

Annual billing may offer a transparent discount. The final discount and renewal
policy remain commercial decisions. Usage beyond the included capacity must
fail predictably or use an explicitly purchased upgrade; it must never create
an accidental charge.

### Professional event credits

An event credit gives a verified low-volume professional one premium wedding
without an ongoing subscription. Candidate pricing is EUR 49 per event, subject
to validation. Credits must have clear expiry and refund rules and must not
silently renew.

### Professional resale

Professionals may include Memboux in their own service package and set any
retail price they choose. Memboux does not take a percentage when the
professional sourced the client and collected payment outside Memboux. The
professional remains responsible for their client contract, taxes, promises and
service delivery.

### Marketplace

A future marketplace may charge a candidate commission of 8–12 percent only
when Memboux sourced the lead and facilitated the payment. Exact commission,
payout timing, refunds, disputes, negative balances, identity verification and
tax responsibilities require a separate accepted ADR and legal review before
implementation.

## Ownership, roles and permissions

Roles are separated into four planes. A role in one plane never implies a role
in another.

### Platform administration

The existing platform roles remain Memboux workforce roles: `owner`,
`administrator`, `operations`, `support`, `finance`, `moderator` and `analyst`.
They must not be reused for professionals, couples or event collaborators.

### Professional organization

The following target responsibilities are conceptual and require schema and API
design:

| Responsibility | Billing | Team | Create weddings | Event access |
|---|---:|---:|---:|---:|
| Organization owner | Yes | Yes | Yes, within entitlement | Assigned/owned only |
| Billing admin | Yes | No by default | No | No by default |
| Manager/planner | No by default | Limited | Yes, within entitlement | Assigned only |
| Staff member | No | No | No by default | Assigned only |

The subscription or credit belongs to the professional organization. Removing
an employee from the organization must revoke their organization-derived event
access centrally without changing couple ownership.

### Event roles

| Responsibility | Configure | Media | Collaborators | Ownership/destruction |
|---|---:|---:|---:|---:|
| Couple owner | Yes | Yes | Yes | Yes, with safeguards |
| Planner manager | Yes | Yes | Limited | No |
| Media editor | No | Yes | No | No |
| Viewer | No | No | No | No |

A wedding should support two independent couple owners. The implementation must
prevent removal of the last valid couple owner. `planner manager` must not be
implemented by broadening the existing `editor` role for all event types.

A self-service purchaser becomes a couple owner directly. For a professional-
created wedding, a dedicated, expiring, single-use and auditable handoff grants
the couple durable ownership while the professional remains a restricted
planner manager.

### Guest access

Ordinary guests use an event link or QR code, plus a PIN when configured. Guest
contribution and viewing are access-policy capabilities, not platform or event
staff roles. An account must not be required solely to contribute to an event
unless a future safety policy documents a narrowly justified exception.

## Entitlement boundaries

Billing answers what has been purchased. Authorization answers who may perform
an action. These decisions must remain independent.

| Entitlement | Scope | Survives purchaser role change | Typical termination effect |
|---|---|---:|---|
| Free event allowance | Event/account policy | Product decision | Transparent limits apply |
| One-time premium event | Event | Yes | Defined archive/renewal policy |
| Professional subscription | Organization | Not applicable | No new capacity after policy boundary |
| Professional event credit | Created event | Yes | Event retains its defined term |
| Marketplace purchase | Order/event/service | Contract-specific | Never silently removes memories |

An event license must not disappear because the original payer leaves the
event. A professional subscription controls future creation and professional
capacity; it does not control the couple's ownership or basic access.

## Payment architecture policy

### Initial provider approach

Stripe is the preferred initial provider after the legal entity, payment
account, tax, invoicing, terms and refund policy are ready. The existing
provider-neutral commerce boundary must be preserved.

- Use hosted checkout for one-time event purchases, credits and subscriptions.
- Use subscription billing for monthly and annual professional plans.
- Use a hosted customer portal for invoices, payment methods and cancellation.
- Do not store raw card details in Memboux.
- Treat verified provider webhooks, not browser redirects, as the source of
  truth for payment state and fulfillment.
- Verify webhook signatures against the raw request body.
- Make checkout creation and fulfillment idempotent and replay-safe.
- Record immutable order terms, amount, currency, tax and entitlement snapshot.
- Keep `commerce_launch_settings.payments_enabled` false until every launch gate
  passes.

An initial purchase is a direct checkout, not a shopping cart. A cart may be
introduced later only when customers regularly combine independent products
such as prints, albums and add-ons.

### Subscription failure

Candidate professional policy:

- a `past_due` subscription receives a 7–14 day grace period;
- creation of new weddings is blocked no later than the end of the grace period;
- existing client weddings and couple access remain unchanged;
- professional management follows a documented closeout policy;
- payment recovery notices are clear and do not use threatening memory-loss
  language; and
- cancellation takes effect according to the terms displayed at purchase.

The exact grace duration is an operational decision before billing launch.

### Refunds, renewals and transparency

Before accepting money, Memboux must publish and enforce:

- the total price and applicable taxes;
- exactly what is included and for how long;
- subscription renewal timing and cancellation flow;
- event-credit expiry;
- refund eligibility and operational owner;
- data access after refund, chargeback or subscription cancellation; and
- archive/export behavior after the paid period.

No paid entitlement may rely only on client-side state. Manual support
adjustments require existing admin billing permissions and an audit trail.

## Event lifecycles

### Self-service wedding

`Account -> Wedding draft -> Free/private preview -> Free activation or premium checkout -> Guest participation -> Archive/export -> Optional archive extension`

### Professional-created wedding

`Verified professional -> Subscription/capacity or credit check -> Private wedding setup -> Couple invitation -> Atomic ownership handoff -> Guest participation -> Archive/export -> Professional capacity released`

### Free non-wedding event

`Account -> Event draft -> Free activation within fair use -> Guest participation -> Archive/export policy`

The point at which a professional wedding stops consuming capacity must be
defined before capacity enforcement. Capacity release must not delete content or
remove couple access.

## Reputation safeguards

- Never charge a guest to view or contribute under the event's access policy.
- Never use private media, faces, guest messages or behavior for unrelated ads.
- Never surprise a customer with an undisclosed renewal or usage charge.
- Never remove couple ownership because a planner stopped paying.
- Provide a clear original-export path under the purchased/free policy.
- Show retention and deletion dates before they take effect.
- Preserve at least one valid owner and provide a controlled recovery process.
- Use verified-professional badges only after a real review process exists.
- Describe fair-use limits in plain language before uploads begin.
- Keep marketplace ranking and commissions transparent when that channel exists.

## Rollout plan

### Phase 0 — Validate and specify

- Validate package names, prices, limits and willingness to pay.
- Model D1, R2, egress, processing, support and payment-provider unit costs.
- Approve tax, invoicing, refund, privacy, terms and retention policies.
- Define analytics without private media payloads.
- Approve the future schema/API design and migration/backfill plan.

### Phase 1 — Commercial domain and permission foundation

- Separate event ownership, professional organization membership and billing
  authority.
- Define event-scoped commercial entitlements and active-wedding capacity.
- Introduce last-owner protection and audit requirements.
- Preserve all existing event owners and access during migration.

### Phase 2 — Self-service packaging

- Adapt the current preview/trial/catalog/order infrastructure to the approved
  free and one-time premium packages.
- Keep self-service wedding creation available.
- Enforce limits and exports server-side and atomically.
- Measure free activation, checkout conversion, paid activation and storage cost.

### Phase 3 — Professional platform

- Add professional verification lifecycle.
- Add organizations, billing roles, planners and assigned staff.
- Add subscription capacity and event credits.
- Add dedicated couple handoff and planner-manager permissions.
- Add professional workspaces for setup, handoff, active and archived weddings.

### Phase 4 — Billing activation

- Integrate hosted checkout, subscriptions, portal and signed webhooks.
- Test duplicate, delayed, missing and out-of-order provider events.
- Exercise payment failure, cancellation, refund and rollback runbooks.
- Start with complimentary/manual beta entitlements, then a limited paid cohort.
- Enable the launch guard only after legal and operational approval.

### Phase 5 — Expansion

- Add annual plans, archive extensions, custom domains and white label.
- Evaluate prints, albums and privacy-preserving premium AI features.
- Design marketplace contracts and payments in a separate ADR.
- Add enterprise agreements and APIs only after core economics are proven.

## Metrics

### Consumer funnel

- event drafts and free activations;
- guest contributors and uploads per activated event;
- free-to-premium conversion;
- average order value and refund/chargeback rate;
- original-export completion; and
- direct customer acquisition cost and referral rate.

### Professional funnel

- application-to-verification conversion;
- trial/credit-to-subscription conversion;
- monthly and annual recurring revenue;
- professional retention and expansion;
- active-wedding capacity utilization;
- wedding creation-to-couple-handoff time and failure rate; and
- weddings created per active professional.

### Trust and unit economics

- storage and processing cost per active and archived event;
- support incidents involving payment, ownership or lost access;
- percentage of weddings with at least one valid couple owner;
- data-export success and deletion completion; and
- payment success, recovery, refund and dispute rates.

Analytics must not contain raw invitation tokens, photo/video content, guest
messages, unnecessary contact data or precise private locations.

## Required implementation test categories

- Guests are never sent to checkout for ordinary permitted participation.
- Self-service users can create weddings under the current approved package
  policy.
- An entitlement cannot be forged through a client request or success redirect.
- Duplicate and out-of-order provider events do not duplicate fulfillment.
- A one-time event entitlement remains attached to the correct event after payer
  membership changes.
- Professional capacity is enforced server-side across concurrent requests.
- Staff can access only events assigned through their organization relationship.
- Billing admins do not gain private-event content access by default.
- Couple ownership survives planner cancellation, suspension, removal and
  account closure.
- A planner manager cannot transfer ownership, remove the last couple owner or
  permanently delete the wedding.
- Existing event owners and access remain unchanged through rollout.
- Free limits do not bypass privacy, upload safety, rate limits or abuse controls.
- Refund and chargeback transitions follow the approved access policy without
  deleting media unexpectedly.

## Decisions still required before implementation

1. Final free media, video, upload-window and retention limits.
2. Final direct package names, prices and included capabilities.
3. Final professional prices, capacity and annual discount.
4. Exact definition and release point for an active professional wedding.
5. Professional categories and evidence eligible for verification.
6. Exact past-due grace period and professional closeout access.
7. Refund, chargeback and archive-extension policy.
8. VAT, invoicing and supported-country launch policy.
9. Whether event credits expire and whether unused credits are refundable.
10. Marketplace legal, payout, dispute and commission model.

## Implementation gate

No implementation may treat names or prices in this document as existing code.
Every phase starts with repository inspection, a scoped plan, permission and
data-migration review, tests, observability and an approved rollout/rollback
boundary. Historical migrations must not be edited.

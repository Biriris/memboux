# Professional-led weddings

**Status:** Superseded proposal  
**Last reviewed:** 2026-08-01  
**Implementation state:** Not implemented

> This professional-only proposal was superseded by the approved
> [Hybrid commercial model](HYBRID_COMMERCIAL_MODEL.md) and
> [ADR-0008](../14_ADRs/ADR_0008_HYBRID_COMMERCE_OWNERSHIP_AND_ROLES.md).
> Self-service wedding creation remains part of the approved direction. This
> file is retained only as decision history.

## Purpose

This document records the earlier Memboux proposal in which verified wedding
professionals would exclusively create and manage wedding experiences. It is no
longer the planning authority for wedding creation, pricing or payments.

This document does not describe current production behavior. Repository facts remain authoritative until this proposal is implemented and its ADR is accepted.

## Product thesis

Memboux should not charge guests to contribute memories. Wedding planners and other approved professionals should pay for a recurring business workspace that helps them create a premium client experience and serve multiple couples.

The professional may bundle or resell that experience at any price. Memboux does not set the professional's retail price and does not participate in the professional-client contract unless a future marketplace explicitly introduces that relationship.

After a professional creates a wedding and invites the couple:

1. the couple receives durable ownership of the wedding;
2. the professional continues as a restricted manager;
3. guests can participate without payment;
4. the couple can create supported non-wedding events for free; and
5. the professional continues the subscription to create weddings for future clients.

## Product promise

> Professionals create the experience. Couples keep the memories. Guests participate for free.

## Verified current state

The following statements are verified against the current repository and identify the starting point for implementation:

- Authenticated users currently create any supported event type, including `wedding`, through `POST /api/account/events` in [`src/routes/account.ts`](../../../src/routes/account.ts).
- The creator is inserted into `event_members` as `owner` by the same route.
- Event roles are currently `owner`, `editor`, and `viewer`; their capabilities are defined in [`src/access.ts`](../../../src/access.ts).
- Owners can invite members or professionals through routes in [`src/routes/events.ts`](../../../src/routes/events.ts) and the invitation flow in [`src/invitations.ts`](../../../src/invitations.ts).
- Ownership transfer is not exposed by a registered route.
- A user can currently activate a professional profile from their account. `professional_profiles.status` supports only `active` and `suspended` through migration [`0016_professional_official_albums.sql`](../../../migrations/0016_professional_official_albums.sql).
- Professional assignments currently support Studio and official-album work; they do not grant wedding-planner management capabilities.
- Subscription and entitlement tables exist through migrations [`0015_entitlements_and_storage_usage.sql`](../../../migrations/0015_entitlements_and_storage_usage.sql) and [`0020_account_subscriptions_and_payments.sql`](../../../migrations/0020_account_subscriptions_and_payments.sql).
- Card payment initiation and payment-provider webhooks are not registered production routes. Commerce currently stops at draft-order infrastructure.
- New events currently begin in an enforced preview/trial lifecycle with a lifetime trial media limit. The verified current lifecycle is documented in the [Repository Audit](../../repository-audit/EVENT_LIFECYCLE.md).

## Target customer model

### Wedding professional

A verified wedding planner, event-planning studio, or other approved professional who pays Memboux for a recurring workspace. The professional can create wedding experiences only while their professional eligibility and plan permit it.

### Couple

The durable owner of the wedding experience and its private content. A couple may be represented initially by one account and later by multiple owner-equivalent participants, subject to a future explicit ownership policy.

### Professional staff

Members of the professional's organization who work on assigned weddings within the limits of their organization role. Organization/team support is a later phase and must not be simulated with platform-admin roles.

### Collaborator

A photographer, videographer, venue representative, or trusted person granted event-scoped capabilities. Collaboration does not imply ownership.

### Guest

A person who views or contributes to an event through its guest access policy. Guests do not pay Memboux and should not need a Memboux account for ordinary participation.

## Non-negotiable product invariants

1. **The couple owns the wedding.** The professional may create it and manage it, but cannot permanently retain ownership over the couple's private memories.
2. **Guests remain free.** Guest viewing and contribution must not require payment by the guest.
3. **Subscription loss must not delete client data.** Cancellation, payment failure, suspension, or removal of a professional must not remove the couple's access.
4. **Professional permissions are event-scoped.** A professional cannot access a wedding after their assignment is revoked.
5. **Platform administration is separate.** Memboux admin roles must never be reused as professional, organization, or event roles.
6. **Retail pricing belongs to the professional.** Memboux controls the subscription price charged to the professional, not the price charged by the professional to the couple.
7. **Existing weddings are grandfathered.** No existing owner may be silently demoted or transferred during rollout.
8. **Handoff is atomic and auditable.** A failed invitation or handoff must never leave a wedding without a valid owner.
9. **Private media is not an advertising dataset.** Photos, videos, faces, contact details, and guest behavior must not be sold or repurposed for unrelated advertising.
10. **Free does not mean unbounded abuse.** Technical fair-use, retention, upload-safety, and anti-abuse controls remain necessary even when a feature has no price.

## Target permission model

The names below describe product responsibilities, not final database enum values. Final identifiers require an accepted schema and API design.

| Responsibility | View | Manage media | Configure wedding | Manage collaborators | Transfer ownership | Delete wedding |
|---|---:|---:|---:|---:|---:|---:|
| Couple owner | Yes | Yes | Yes | Yes | Policy-controlled | Yes, with safeguards |
| Planner manager | Yes | Yes | Yes | Limited | No | No |
| Professional staff | Assigned scope | Assigned scope | Assigned scope | No by default | No | No |
| Collaborator | Yes | Assigned scope | No | No | No | No |
| Viewer | Yes | No | No | No | No | No |
| Guest | Guest-policy only | Upload-policy only | No | No | No | No |

The planner-manager capability must not be implemented by broadening the current `editor` role for every event. It requires an explicit professional/event relationship or a new event-scoped capability model.

## Wedding lifecycle

### 1. Professional eligibility

Before creating a wedding, the server must establish all required conditions:

- authenticated account;
- approved professional category;
- verified professional state;
- subscription/complimentary eligibility;
- available active-wedding capacity; and
- account and platform status that permit creation.

Client-side hiding of the wedding option is not authorization. Every creation route must enforce the rule server-side.

### 2. Professional creates the wedding

The creation operation records the professional origin, reserves plan capacity, creates the event and access state, and establishes a planner-management relationship. It must be idempotent or safely recoverable from partial failure.

The event can remain in a private setup state before the couple accepts. The professional must not gain platform-wide or unrelated-event access.

### 3. Couple invitation

The professional enters the couple's email address and sends a time-limited, single-purpose invitation. The invitation must:

- be token-hashed at rest;
- expire;
- bind acceptance to the intended email/account policy;
- identify that acceptance grants wedding ownership;
- resist replay; and
- preserve a complete audit record without logging the raw token.

### 4. Atomic ownership handoff

On valid acceptance, one transaction or equivalent atomic boundary must:

1. establish the couple as the durable owner;
2. retain the professional as planner manager;
3. mark the handoff invitation accepted;
4. reconcile ownership and plan counters;
5. create notifications/audit evidence; and
6. guarantee that at least one valid owner remains.

The couple must never become only an `editor`. Existing invitation normalization currently prevents invitations from granting `owner`; implementation must introduce a dedicated, narrower handoff operation rather than weakening ordinary invitations.

### 5. Active wedding

While planning or guest uploads are active, the wedding consumes capacity from the professional's plan. The couple and planner see the same event through role-appropriate workspaces. Couple ownership and professional subscription entitlement remain separate concepts.

### 6. Completion and archive

After the defined active period:

- the wedding stops consuming an active professional slot under the selected plan policy;
- the couple retains access to the wedding and permitted exports;
- the planner retains or loses access according to the couple's decision and the assignment policy;
- retention and upload behavior follow an explicit archive policy; and
- no transition deletes content merely to free a professional slot.

## Professional subscription model

The initial model should meter active wedding capacity, not guest seats or basic wedding features.

Candidate commercial tiers for validation, not hard-coded product facts:

| Tier | Intended customer | Candidate active capacity |
|---|---|---:|
| Starter | Independent planner | 2 weddings |
| Professional | Established planner | 5 weddings |
| Studio | Small team | 15 weddings |
| Agency | Larger organization | 30 weddings |
| Enterprise | Contracted organization | Custom |

Final prices, capacities, taxes, invoicing rules, and billing-provider behavior remain open commercial decisions. They must live in data/configuration rather than scattered view code.

### Subscription state rules

| State | Create wedding | Manage existing active wedding | Couple access |
|---|---:|---:|---:|
| Active or approved complimentary | Yes, within capacity | Yes | Unchanged |
| Trialing, if offered | Product decision | Yes | Unchanged |
| Past due | No new weddings; grace policy | Time-limited grace | Unchanged |
| Canceled | No | Handoff/closeout policy | Unchanged |
| Professional suspended | No | Denied or supervised remediation | Unchanged |

The source of truth for billing status must be provider-verified server state, not a client request. Payment integration requires idempotent webhooks, replay protection, auditability, and compliance with the existing commerce launch guard.

## Free non-wedding lifecycle

Supported non-wedding event types should be creatable by ordinary authenticated users without a professional subscription. This proposal intends core event creation, guest participation, and memory collection to be free.

Before implementation, Product must define:

- fair-use media/storage policy;
- active upload window and archive behavior;
- whether original downloads remain available indefinitely;
- abuse and rate limits;
- treatment of current preview/trial events;
- whether free events require email verification; and
- whether every supported non-wedding vertical follows the same lifecycle.

The current D1 triggers enforce trial media limits. Free-event implementation therefore requires a new migration and updated server policy; hiding checkout UI is insufficient.

## Professional verification

The current self-service professional checkbox is not sufficient authorization to create weddings. Initial verification may be manually administered, but the state model must distinguish at least:

- application/pending review;
- verified/eligible;
- rejected, if retained for audit;
- suspended; and
- closed.

Verification criteria, evidence retention, reviewer permissions, appeal handling, and privacy/legal review are open operational decisions. A platform admin action affecting professional eligibility must be audited.

## Existing-user migration policy

- All weddings created before the launch boundary remain owned by their current owners.
- No migration infers a wedding planner from an existing professional assignment.
- Existing owners may optionally invite a verified planner under the new model.
- Existing professional profiles do not become verified automatically merely because their current status is `active`.
- Existing non-wedding events require an explicit access-state migration policy; they must not be silently expired or deleted.
- Historical migrations must not be edited. Every schema transition uses a new forward migration.

## Proposed implementation areas

The following current areas will require design or implementation work. This is not a promise that new routes, tables, or files already exist.

| Area | Current repository evidence | Required direction |
|---|---|---|
| Event creation | `src/routes/account.ts` | Separate ordinary free-event eligibility from professional wedding eligibility. |
| Event capabilities | `src/access.ts`, `event_members` | Introduce planner-management boundaries without weakening current roles globally. |
| Invitations | `src/invitations.ts`, event invitation routes | Add a dedicated ownership-handoff contract. |
| Professional identity | `professional_profiles` | Add verified category/lifecycle and admin review. |
| Professional assignments | `event_professional_assignments` | Distinguish planner management from official-album assignment. |
| Subscription/entitlements | `account_subscriptions`, `account_entitlements` | Enforce creation eligibility and active-wedding capacity. |
| Event lifecycle | `event_access`, trial triggers | Define and migrate free non-wedding access behavior. |
| Wedding UI | account dashboard, Studio, wedding setup | Make wedding creation professional-led and present handoff state. |
| Administration | existing admin RBAC and audit log | Add permission-gated professional verification and remediation. |
| Notifications/email | existing invitation/email infrastructure | Add handoff-specific delivery, expiry, resend, and acceptance messages. |
| Analytics | no current provider contract | Define events before rollout and avoid personal-media payloads. |

## Rollout plan

### Phase 0 — Decisions and instrumentation

- Resolve the open decisions in this document.
- Accept or revise the proposed ADR.
- Define analytics and operational metrics.
- Define migration/backfill and rollback boundaries.
- Select a small professional beta cohort.

### Phase 1 — Professional eligibility

- Introduce verified professional lifecycle.
- Add admin review and audit behavior.
- Gate new wedding creation server-side.
- Grandfather existing weddings.

### Phase 2 — Couple handoff

- Add handoff invitation lifecycle.
- Implement atomic couple ownership.
- Introduce planner-manager authorization.
- Cover revocation, expiry, resend, duplicate account, and account-deletion cases.

### Phase 3 — Professional workspace and capacity

- Separate active, awaiting-handoff, archived, and revoked weddings.
- Add plan capacity and usage reconciliation.
- Add cancellation and payment-grace behavior without affecting couple access.

### Phase 4 — Free non-wedding events

- Define the free lifecycle and fair-use policy.
- Replace trial-only assumptions with event-type-aware policy.
- Migrate existing eligible events safely.

### Phase 5 — Billing activation

- Complete legal, tax, invoicing, policy, and provider readiness.
- Implement idempotent checkout and webhook fulfillment.
- Run complimentary/manual beta plans before charging broadly.

### Phase 6 — Teams, white label, and marketplace

- Add professional organizations and staff roles.
- Add branding/custom-domain policy.
- Consider planner discovery and lead/referral economics as a separate product decision.

## Success metrics

The minimum product funnel is:

`verified professional -> wedding created -> couple invited -> ownership accepted -> guests activated -> wedding archived -> professional creates another wedding`

Required metrics should include:

- professional application-to-verification rate;
- verified professional activation rate;
- weddings created per active professional;
- median time from creation to couple handoff;
- handoff acceptance and failure rate;
- active guest contributors per wedding;
- professional month-1/month-3 retention;
- active-wedding capacity utilization;
- free-event creation by couples after a wedding;
- support incidents involving ownership or access;
- storage and processing cost per active/archive wedding; and
- percentage of weddings that retain at least one valid couple owner.

Analytics must not include raw invitation tokens, photo contents, guest messages, precise private locations, or unnecessary personal data.

## Required test categories

- Ordinary users cannot create new weddings.
- Unverified, suspended, canceled, over-capacity, and past-due professionals cannot bypass creation policy.
- Eligible professionals can create within capacity.
- Existing weddings remain accessible to existing owners.
- Handoff acceptance is single-use, expiring, atomic, and bound to the intended identity policy.
- Couple ownership survives planner cancellation, suspension, removal, and account deletion.
- Planner manager cannot transfer ownership, remove the last couple owner, or permanently delete the wedding.
- Capacity counters reconcile after creation failures, archive, restore, deletion, and handoff.
- Free non-wedding events bypass only the intended commercial restrictions, not security, privacy, upload-safety, or abuse controls.
- Admin professional-verification mutations require the correct permission and produce audit records.
- Billing/webhook retries are idempotent when payment integration is introduced.

## Open decisions

These questions must be answered before the corresponding phase is implemented:

1. Which professional categories may create weddings at launch?
2. Can a wedding have one couple-owner account or two independent owners?
3. When does a wedding stop consuming professional capacity?
4. What access does a planner retain after archive?
5. What is the grace period for a past-due subscription?
6. What is the fair-use and retention policy for free events?
7. Can a couple without a planner request or discover a professional through Memboux?
8. Will photographers be able to create weddings, or only planners/agencies?
9. Which professional-verification evidence is required and how long is it retained?
10. Are professional teams part of launch scope or a later phase?
11. What happens when the couple invitation is never accepted before the event date?
12. Does Memboux ever facilitate the planner-couple payment, or remain subscription-only?

## Implementation gate

No implementation task should treat conceptual names in this document as existing routes, services, repositories, tables, migrations, or bindings. Every phase must begin by re-reading `AGENTS.md`, this guide, the accepted ADRs, and the current repository. Schema and API names must be proposed and reviewed against the implementation that exists at that time.

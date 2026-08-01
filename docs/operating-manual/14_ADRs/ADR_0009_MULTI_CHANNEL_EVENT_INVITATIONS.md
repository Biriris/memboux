# ADR-0009: Multi-channel event invitations

- Status: Proposed
- Date: 2026-08-01
- Scope: wedding and baptism guest invitations; future event types may opt in

## Context

Memboux currently sends wedding invitations through Resend and stores retryable email state on `event_wedding_guests`. The guest directory, groups, RSVP synchronization and seating tables are also stored in wedding-prefixed tables. The application now reuses that workflow for baptism without renaming existing tables, preserving deployed data and URLs.

SMS is not configured in `wrangler.jsonc`, `src/domain.ts` has no SMS binding or provider secret, and no provider webhook route or channel-level delivery table exists. A phone number in the guest directory is contact data; it is not evidence that the guest has consented to every category of messaging.

## Decision

Invitation delivery will become a provider-neutral, multi-channel workflow:

1. The owner selects one guest or a reviewed bulk audience.
2. Memboux shows the available channels for every guest and an estimated maximum SMS cost before confirmation.
3. The default product policy is `email + SMS when both are available`, matching the requested experience. The confirmation screen must also allow email-only or SMS-only delivery so the owner can control cost and avoid duplicate contact where appropriate.
4. Each email and SMS is recorded as a separate delivery attempt. A combined status must never hide a failed channel.
5. Bulk work is placed on Cloudflare Queues. The consumer is idempotent, uses bounded concurrency and sends terminal failures to a dead-letter queue.
6. Provider callbacks update accepted, delivered, failed and undeliverable states after signature verification and replay protection.
7. Phone numbers are normalized to E.164 before sending. Invalid or ambiguous numbers are held for owner correction.
8. The invitation URL is a high-entropy bearer capability. D1 stores only its SHA-256 hash. The public invitation and its cover image require the token, a published event and active guest access.
9. The owner may record an RSVP and party size for a guest who cannot use the digital form. This synchronized owner override must preserve seating capacity rules.
10. No SMS provider is enabled until the legal sender identity, message classification, consent/lawful-basis text, retention, opt-out handling, provider DPA and monthly spend ceiling are approved.

## Provider research snapshot

Prices were checked on 2026-08-01 and must be rechecked immediately before contracting. SMS is billed per segment; Greek characters can reduce the characters available in one segment, so product cost estimates must use the encoded segment count rather than treating one invitation as one billable SMS.

| Provider | Public pricing evidence | Current assessment |
|---|---|---|
| Twilio | The official Greece page lists outbound SMS at **USD 0.0657 per segment**, a free alphanumeric sender ID and international numbers from USD 1.15/month. It also notes possible carrier fees and a USD 0.001 processing fee for messages ending as failed. <https://www.twilio.com/en-us/sms/pricing/gr> | Recommended for the first controlled pilot because Greece-specific pricing, delivery tooling and sender options are explicit. This is an integration/reliability recommendation, not a claim that it is cheapest. |
| Telnyx | The public page lists a generic base rate from **USD 0.004 per message part plus carrier fees**, but the static public result does not establish the final Greece route price. <https://telnyx.com/pricing/messaging> | Keep as the main price challenger. Obtain an account/API quote for Greece, sender-ID support and delivery-route quality before comparison. |
| Vonage | Official Communications API pricing is usage-based and offers a trial, but the public page does not expose a verified Greece amount in the repository research snapshot. <https://www.vonage.com/communications-apis/pricing/> | Viable fallback; require a written Greece quote and sender-ID requirements. |
| Bird / MessageBird | The official Pricing API documentation demonstrates operator/default-country lookup and includes a Greece default-rate example, but an example is not a durable commercial quote. <https://developers.messagebird.com/quickstarts/pricingapi/list-outbound-sms-prices/> | Compare through the live pricing API only; do not hard-code the documentation example into product pricing. |
| AWS SNS | Official pricing is pay-as-you-go and destination/carrier dependent. The exact Greece table is rendered dynamically; AWS supports an account spend limit and documents a USD 1 default quota in SMS preferences. <https://aws.amazon.com/sns/sms-pricing/> and <https://docs.aws.amazon.com/sns/latest/dg/sms_preferences.html> | Strong cost-control primitives, but adds a second cloud vendor and more operational surface than the initial pilot requires. |

There is no verified free production SMS route. Trials or credits are useful for development but carrier delivery has a real per-segment cost. Email should remain the no-SMS-cost channel; SMS spending should be funded by the event package, a professional plan allowance or prepaid credits.

## Required implementation sequence

1. Finish the shared guest-domain UI for wedding and baptism while retaining backward-compatible wedding-prefixed storage.
2. Add a new append-only `event_invitation_deliveries` model with channel, provider, provider message ID, status, segment count, estimated/actual cost, timestamps and idempotency key. Do not overload the existing email-only columns for SMS.
3. Add phone normalization and channel eligibility validation.
4. Add the provider interface and a fake/test adapter; secrets remain Wrangler secrets.
5. Add Cloudflare Queue producer, consumer, retry policy and dead-letter queue. Cloudflare documents `waitUntil()` as limited to 30 seconds after the response and recommends Queues for longer reliable work: <https://developers.cloudflare.com/workers/runtime-apis/context/>.
6. Add signed provider webhook handling and idempotent status transitions.
7. Add bulk cost preview, explicit confirmation, per-event and account monthly caps, and an emergency kill switch.
8. Run a small internal Twilio pilot, compare actual delivery/cost against Telnyx, then accept or supersede this ADR with the production provider decision.

## Consequences

- Invitation reliability and cost are observable per channel.
- Baptism and wedding share one product workflow without an immediate high-risk data migration.
- Queue delivery is at least once, so upstream/provider idempotency is mandatory.
- The current wedding-prefixed tables remain transitional technical debt. A later migration may introduce generic guest tables only with verified backfill, dual-read/dual-write strategy and rollback coverage.
- SMS cannot ship as an unmetered free feature. Product packaging must include explicit allowances or pass-through credits.

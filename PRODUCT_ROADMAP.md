# Memboux Product Roadmap

This is the durable product backlog and priority order for the Memboux platform.

## P0 — Reliability and support

- [x] Role-based admin access and department permissions.
- [x] Internal support inbox with assignment, replies and escalation.
- [x] AI-first support chat with human handoff.
- [x] Ground common AI answers in the live product state so event creation, trial limits and disabled payments cannot be hallucinated; keep sensitive cases on the human-escalation path.
- [x] Fail closed on unclassified or product-contradicting model output and hand the conversation to staff instead of publishing an unsafe AI answer.
- [x] Guarantee an in-chat handoff acknowledgement when AI is unavailable or a human already owns the conversation, preserving unread state, department and staff notification.
- [x] Route localized support forms with stable department identifiers instead of translated labels.
- [x] Keep drafts stable while the support conversation refreshes.
- [x] Preserve visitor support-form and reply drafts across polling, chat close/reopen and full page reload without sending them to the server.
- [x] Show an animated typing indicator while AI or support is preparing a reply.
- [x] Keep role-based ticket assignment independent from optional employee email alerts.
- [x] Preserve every helpdesk reply in-app and expose email delivery status with manual retry.
- [x] Track each staff-assignment alert as pending, sent, failed, disabled, invalid or unassigned and expose secure retry from the role-scoped helpdesk.
- [x] Show live Admin Readiness diagnostics for MX, SPF, Resend DKIM and DMARC without exposing secrets.
- [x] Ingest signed, replay-safe Resend delivery events and surface accepted, delivered, delayed, bounced, complained or failed outcomes in the helpdesk.
- [x] Verify active Cloudflare routing rules for `support@` and `info@`, add strict alias tests, and expose 30-day delivery metrics in Admin Readiness.
- [x] Route real inbound `support@` and `info@` email into the role-based helpdesk, deduplicate provider retries and keep customer or authorized staff email replies in the same auditable ticket.
- [x] Make assignment and SLA notification emails safely replyable from each employee's registered personal address, with ticket threading, role/assignment verification and a complete audit trail.
- [x] Import verified screenshots and PDFs from inbound support email into private R2 storage, and expose them only through ticket-authorized customer and admin download routes.
- [x] Publish a staged DMARC monitoring policy for `memboux.com` without changing the active MX, SPF or DKIM records.
- [x] Configure the signed Resend webhook secret before declaring email delivery fully production-ready.
- [x] Complete production email delivery for `support@memboux.com` and `info@memboux.com`.
- [x] Establish tested Support route/service/repository boundaries for customer conversations, role-scoped inbox and thread reads, claim/reassignment, single-attempt email retries, staff replies, private attachments and status transitions.

## P1 — Event lifecycle and monetization foundation

- [x] Add provider-neutral event access states: preview, trial, unlocked, expired.
- [x] Preserve unrestricted access for existing events until payments are legally enabled.
- [x] Define and wire the trial: full private owner preview, 14-day guest activation, 20 media and no original downloads.
- [x] Protect trial activation with a dedicated review, explicit acknowledgement, exact start/end dates, event-date warning, atomic database media limits and endpoint-level enforcement across direct media URLs, Wedding, Studio, trash, guest actions and expired access.
- [x] Reconcile trials automatically every day with idempotent 3-day, 24-hour and expiry notifications; expiry disables guest access without deleting media.
- [x] Add product catalog, immutable order snapshots and checkout state without activating card charges.
- [x] Replace the unnecessary cart concept with a direct per-event unlock journey, clear trial-versus-paid value and localized package presentation in all six languages.
- [x] Make package selection visibly active immediately, while keeping Save as the explicit persistence step.
- [x] Add a fail-closed database launch guard, Admin Readiness checklist and explicit zero-charge draft summary before any Stripe integration.
- [x] Add replay-safe, provider-neutral paid-order fulfillment that applies only the immutable purchased entitlement snapshot to the correct event.
- [ ] Integrate Stripe/Visa/Mastercard only after the company and payment account are ready.

## P2 — Wedding product quality

- [x] Replace the legacy green product chrome with a consistent violet/plum design system across public, account, admin, support, checkout and wizard flows, while preserving event-template art direction.
- [x] Reorganize the wedding workspace around Website, Operations and Publish.
- [x] Add live responsive preview, readiness checks and draft persistence.
- [x] Redesign the public wedding pages into 15 distinct art directions across five responsive layout families.
- [x] Make the 15-template Wedding picker expose exactly one accessible selected state and keep its radio, badge and live preview synchronized after draft recovery.
- [x] Finish the six-step wedding wizard with draft protection, readiness checks and exact responsive previews.
- [x] Turn the Wedding “Add to calendar” option into private, access-controlled ceremony and reception calendar files.
- [x] Remove residual English labels from the live Wedding guest experience, navigation and upload picker in all six supported languages.
- [x] Replace mixed Greek and Italian Wedding terminology with natural native copy across the live experience, menus and interactive demo.

## P3 — Event expansion

- [x] Launch the wedding landing-page framework.
- [x] Create focused landing pages for every supported event type.
- [x] Create a tailored wizard for every event type.
- [x] Protect every wizard draft against refresh, failed saves and out-of-order autosave responses so newer typing cannot be replaced by stale data.
- [x] Add full feature and appearance previews before event creation.
- [x] Make every demo-preview language switch, gallery link and guest upload action interactive without fake event routes, dead controls or accidental data submission.
- [x] Complete a six-language public-funnel copy audit and replace unnatural Greek placeholder jargon in shared UI, bachelor, party, engagement and community experiences.
- [x] Localize the real RSVP, guestbook and media-comment experience in all six supported languages, including accessible field and control names.
- [x] Localize the real gallery, upload queue and errors, sharing, media reactions and lightbox controls in all six supported languages.
- [x] Localize the real event-preview language selector instead of exposing an English-only accessible label.

## Product principles

- Memboux exists to rescue shared memories from the separate phones where they would otherwise disappear.
- The product is not merely an event-gallery builder: it helps every participant discover photos and videos of themselves, their family and their friends from perspectives they may never receive otherwise.
- Emotional permanence matters: a photograph can become irreplaceable years later, so collecting, preserving and returning originals must remain central to every event experience.
- This promise applies beyond formal events: weddings, birthdays, bachelor parties, holidays and everyday group trips all suffer from the same “I will send them later” problem.
- Product copy should lead with the human outcome — no meaningful moment or point of view left unseen — and explain links, QR codes, uploads and galleries only as the simple mechanism that makes it happen.
- Owners can safely explore the complete experience before paying.
- Guests never see unfinished event configuration.
- AI handles common questions; uncertain or sensitive cases reach the correct department.
- Staff work from the admin helpdesk according to their role, with optional personal-email notifications.
- Payment providers remain replaceable and billing state stays separate from access permissions.

# Product Roadmap

Maintain a living roadmap aligned with business priorities and customer outcomes.

## Wedding operations sequence

1. **Delivered:** event-scoped guest groups, contacts, personalized invitation links, RSVP synchronization and capacity-aware table assignments.
2. **Delivered:** searchable 50-row guest directory with atomic CSV import (maximum 200 rows/1 MB) and spreadsheet-safe CSV export.
3. **Delivered:** editable groups/tables, retryable bulk email invitations and a privacy-minimized A4 seating plan for venue handoff or PDF save.
4. **Delivered in repository; pending release verification:** individual email delivery, owner-assisted RSVP/party-size updates, a token-bound event invitation layout and shared wedding/baptism dashboard entry.
5. **Next:** complete baptism regression coverage and remove wedding-specific presentation copy while retaining backward-compatible storage/routes.
6. **After that:** visual seating canvas using the existing table coordinates and assignment model; include keyboard-accessible non-drag controls.
7. **After seating:** reusable venue layouts and professional ownership/workspace rules.
8. **Proposed in [ADR-0009](../14_ADRs/ADR_0009_MULTI_CHANNEL_EVENT_INVITATIONS.md):** SMS provider adapter, channel delivery records, Queue/DLQ, consent and opt-out handling, delivery webhooks and hard cost controls.

Payment-provider checkout remains a separate launch gate and must not be enabled before the legal company and payment configuration are ready.

# Product Analytics

Track user behavior, funnels, feature adoption and business outcomes.

## Wedding guest operations

The Worker emits privacy-minimized structured operational events from [`src/routes/wedding-planning.ts`](../../../src/routes/wedding-planning.ts):

| Event | Trigger | Fields | Product question |
|---|---|---|---|
| `wedding_guest_search_used` | An event manager loads the directory with a non-empty query. | `event_id`, `result_count` | Are larger directories using discovery tools successfully? |
| `wedding_guest_csv_imported` | An atomic CSV import succeeds. | `event_id`, `imported_count` | Is bulk onboarding adopted and how large are successful imports? |
| `wedding_guest_csv_exported` | An authorized manager exports the directory. | `event_id`, `exported_count` | Is the directory used interoperably with external planning workflows? |
| `wedding_guest_group_renamed` / `wedding_guest_group_deleted` | A manager changes the group structure. | `event_id`, `group_id` | Are organizers actively maintaining households and groups? |
| `wedding_table_updated` / `wedding_table_deleted` | A manager changes the seating structure. | `event_id`, `table_id`; update also includes `capacity` | Is seating management used and revised? |
| `wedding_seating_plan_opened` | The protected print/PDF view is opened. | `event_id`, `guest_count` | Is the venue-handoff workflow adopted? |
| `wedding_guest_invitation_batch_queued` / `wedding_guest_invitation_batch_completed` | A bulk delivery starts or finishes. | `event_id`, `queued_count` or `attempted_count` | Are organizers using bulk invitations and how large are batches? |
| `wedding_guest_invitation_failed` | One background invitation send fails. | `event_id`, `guest_id`, bounded error category/message | Where does transactional delivery require retry or operational attention? |

Search text, names, email addresses, phone numbers and raw invitation tokens must never be included in these events. Failed imports are currently visible through request/error telemetry but do not have a dedicated product event; durable product analytics infrastructure remains to be selected.

## Multi-file selection

All enhanced multi-file upload forms dispatch the browser event `memboux:multi-file-selection` after the selection changes. Its detail contains only the current `count`; filenames, media contents and file metadata are excluded. This makes adoption measurable once a consent-aware client analytics collector is selected. The event is not currently transmitted or persisted.

## Wedding template readiness

Public wedding pages dispatch the browser event `memboux:wedding-template-ready` after motion capability detection. Its detail contains only `theme`, whether reveal motion is enabled, and the number of reveal elements. Names, event identifiers, media identifiers and guest data are excluded. The event is not currently transmitted or persisted; it is an integration point for a future consent-aware analytics collector and automated visual monitoring.

## Wedding menu editing

Successful automatic updates to an existing structured menu item dispatch `memboux:wedding-menu-autosaved`. Its detail contains only the canonical `courseType`; titles, descriptions, event identifiers and other user-entered content are excluded. The event is not currently transmitted or persisted and remains an integration point for a future consent-aware analytics collector.

## Public acquisition journeys

Primary calls to action on the public homepage dispatch the browser event
`memboux:marketing-action`. Its detail contains only a fixed `action` value
defined by the rendered link, such as an event type, demo, package or
professional-profile journey. It excludes visitor identifiers, URLs, form
values and event content. The event is not currently transmitted or persisted;
it is a privacy-minimized integration point for a future consent-aware
analytics collector.

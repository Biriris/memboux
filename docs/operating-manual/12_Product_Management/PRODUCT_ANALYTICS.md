# Product Analytics

Track user behavior, funnels, feature adoption and business outcomes.

## Wedding guest operations

The Worker emits privacy-minimized structured operational events from [`src/routes/wedding-planning.ts`](../../../src/routes/wedding-planning.ts):

| Event | Trigger | Fields | Product question |
|---|---|---|---|
| `wedding_guest_search_used` | An event manager loads the directory with a non-empty query. | `event_id`, `result_count` | Are larger directories using discovery tools successfully? |
| `wedding_guest_csv_imported` | An atomic CSV import succeeds. | `event_id`, `imported_count` | Is bulk onboarding adopted and how large are successful imports? |
| `wedding_guest_csv_exported` | An authorized manager exports the directory. | `event_id`, `exported_count` | Is the directory used interoperably with external planning workflows? |

Search text, names, email addresses and phone numbers must never be included in these events. Failed imports are currently visible through request/error telemetry but do not have a dedicated product event; durable product analytics infrastructure remains to be selected.

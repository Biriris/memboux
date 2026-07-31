# Support Architecture

## Implemented request boundary

Customer chat requests use the following flow:

`support route -> SupportService -> SupportRepository -> D1`

The route owns HTTP-only concerns: request parsing, rate limiting, the signed-in user or
visitor-cookie context, validation responses, `Set-Cookie`, and scheduling the AI task with
`executionCtx.waitUntil()`.

`SupportService` owns orchestration and business decisions that do not require HTTP or SQL:

- choosing signed-in-user identity before visitor-token identity;
- assembling the customer-safe conversation result;
- enforcing assignment/department access before an admin status transition;
- loading inbox rows and aggregate metrics inside the same role/assignment scope;
- loading admin thread messages and attachments only after ticket authorization;
- validating single-owner claim and administrator-only reassignment transitions;
- coordinating single-attempt customer and staff email retries;
- coordinating customer messages, staff replies and human ownership.

`SupportRepository` owns the corresponding D1 statements and batched writes. Creating a
conversation and its first message, adding a customer message and reopening the ticket,
and persisting a staff reply with human ownership are each submitted as one D1 batch.
Claim uses a conditional update so an already assigned ticket cannot be overwritten. Manual
reassignment validates the active target member and category eligibility before resetting stale
notification delivery state.

Admin thread reads update `admin_read_at` only after assignment/department authorization.
Customer and staff retry preparation uses conditional D1 updates, so concurrent retry requests
cannot both acquire the same failed attempt. Starting a new attempt clears stale provider IDs,
delivery outcomes and event timestamps before calling the existing email provider integration.

## Security invariants

- A signed-in user can load only their latest conversation by `user_id`.
- A guest can load only the conversation matching the SHA-256 hash of their HttpOnly token.
- The raw visitor token is never stored in D1.
- Admin status changes pass assignment/department access checks before persistence.
- Non-owner inbox queries expose only assigned tickets or unassigned tickets for the admin role.
- Claim never overwrites an existing assignee.
- Only owners and administrators can reassign, and only to an active role eligible for the category.
- Unauthorized thread polling does not return messages and does not mutate the read marker.
- Email retries can acquire only records currently in the `failed` state.
- Private attachment metadata is selected by both attachment ID and authorized conversation ID.
- R2 attachment responses remain private, non-cacheable and `nosniff`.

## Background work

AI answering remains background work scheduled from the route with `waitUntil()`. The promise
is passed directly to the Workers execution context. AI failures retain the existing human
handoff behavior.

## Remaining extraction work

The following Support paths still access D1 directly and should be migrated in later vertical
slices with behavior-preserving tests:

1. AI reply persistence;
2. automatic assignment, SLA and notification persistence;
3. inbound email ingestion and delivery-event updates.

These are documented as remaining work, not as implemented repository boundaries.

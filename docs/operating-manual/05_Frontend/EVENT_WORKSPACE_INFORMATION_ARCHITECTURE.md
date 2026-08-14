# Event Workspace Information Architecture

## Purpose

The authenticated event workspace follows the organizer's real workflow rather
than exposing an unstructured list of product features. Existing capabilities
remain available through stable routes, but their placement must answer one
question: _what should the organizer do next?_

## Navigation model

`GET /dashboard/:code` is the orientation page. It shows the event identity,
verified status information, a single recommended action, and the six-stage
journey. It is not a storage area for unrelated settings.

The owner journey is:

1. **Set up** — event page, design, details, preview, and the wedding menu when
   applicable (`/website`; wedding menu remains available at `/menu`).
2. **Guests** — directory, personal invitations, RSVP, groups, and seating
   (`/guests`, with wedding/baptism planning in the existing wedding guest
   workflow).
3. **Collect memories** — media, albums, uploads, moderation, originals, and
   cover selection (`/media`).
4. **Event experience** — guestbook, comments, live slideshow, presentation
   branding, and operational analytics (`/experience`).
5. **Share and print** — public links, surface PINs, QR Studio, album links, and
   relevant printable handoffs (`/share`).
6. **Archive and backup** — package/capacity selection, portable event archive,
   cloud backup, and recovery (`/lifecycle`).

Team membership is a separate access-control utility (`/team`). It is not a
stage of creating or running an event.

## Interaction rules

- Show one recommended action on the orientation page. Do not show several
  actions with equal visual priority.
- Mark genuinely verified progress only. Unknown or optional work must not be
  displayed as failed or incomplete.
- Keep advanced tools discoverable inside the stage where they are used.
- Preserve server-side authorization. Hiding a navigation item is not an
  authorization control.
- Mobile navigation is horizontally scrollable, keeps the active destination
  visible, and uses the same information order as desktop.
- Navigation emits `memboux:workspace-navigation`; workspace actions also emit
  `memboux:workspace-action`. These are local DOM events and do not imply that
  an analytics provider is configured.
- Routes and public event links remain stable unless a separately approved
  migration plan exists.

## Role views

Owners see the complete journey and Team & roles. Editors and viewers retain
the verified reduced workspace: orientation, media, and sharing. Requests for
owner-only workspace pages are rejected server-side in
[`src/routes/events.ts`](../../../src/routes/events.ts).

## Source of truth

- Navigation and phase metadata:
  [`src/views/event-workspace-shell.ts`](../../../src/views/event-workspace-shell.ts)
- Panels and recommendation logic:
  [`src/views/event-workspace.ts`](../../../src/views/event-workspace.ts)
- Authenticated route boundaries:
  [`src/routes/events.ts`](../../../src/routes/events.ts)
- Behavior tests:
  [`test/event-workspace.test.ts`](../../../test/event-workspace.test.ts) and
  [`test/event-routes.test.ts`](../../../test/event-routes.test.ts)

This reorganization does not add a table, migration, Worker binding, service,
or repository. The server remains the source of truth for event, plan, media,
and permission state.

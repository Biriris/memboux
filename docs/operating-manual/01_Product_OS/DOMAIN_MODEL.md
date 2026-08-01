# Domain Model

## Current core

Current repository concepts include User, Event, Event Membership, Event Access,
Invitation, Media, Gallery, Album, Notification, Account Entitlement,
Subscription, Payment, Commerce Product and Commerce Order. Exact implemented
tables and relationships are documented in the
[Database schema audit](../../repository-audit/DATABASE_SCHEMA.md).

## Target commercial concepts

The approved hybrid direction requires the following concepts to be designed;
they are not assertions that matching tables or APIs exist:

- **Professional organization:** subscription and team boundary.
- **Organization membership:** owner, billing, manager and staff responsibility.
- **Event entitlement:** event-scoped commercial capabilities and term.
- **Organization entitlement:** active-event capacity and workspace capability.
- **Event credit:** one-time professional right to create a premium event.
- **Planner assignment:** restricted event-management relationship.
- **Couple ownership handoff:** auditable transfer/grant of durable ownership.
- **Marketplace transaction:** future lead, order, payout and commission boundary.

Billing state, organization membership and event authorization remain separate
even if implementation reads them together to authorize an operation.

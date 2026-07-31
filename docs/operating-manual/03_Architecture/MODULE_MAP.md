Modules: routes, services, repositories, domain, views.

## Audited Support vertical slice

The customer conversation lifecycle now follows these concrete boundaries:

- `src/routes/support.ts`: HTTP parsing, rate limits, cookies, response status and HTML rendering.
- `src/support-service.ts`: actor resolution, conversation/thread orchestration, role-scoped inbox loading, assignment decisions, retry state machines, admin access decisions and status transitions.
- `src/support-repository.ts`: D1 persistence for customer conversations, messages, customer/admin read state, inbox queries/metrics, claim/reassignment, delivery attempts, staff replies, status and private attachment records.
- `src/support-access.ts`: assignment and department access predicate.
- `src/support-routing.ts`: classification, assignment and escalation/email notification workflow.
- `src/support-ai.ts`: grounded AI answer policy.

The extraction is intentionally incremental. AI persistence, assignment/SLA notification
delivery and inbound email persistence still contain direct D1 access in their existing
modules and are not yet represented as fully isolated repository/service slices.

# Manual Status

## Current maturity

Version 1.1 is a **governance and process baseline**. It is useful now for:

- guiding Codex behavior;
- establishing engineering, security, review, and release expectations;
- providing repeatable checklists and runbooks;
- organizing future repository-specific documentation.

It is not yet authoritative for:

- the exact route inventory;
- the live D1 schema and migration order;
- actual Workers, bindings, queues, workflows, or R2 buckets;
- real service, repository, and component names;
- environment variables and deployment topology;
- implemented permissions and business workflows.

## Usage decision

Codex may begin working with Version 1.1 now, but every implementation-specific decision must be verified from the repository. Version 2 should be developed in parallel by documenting discovered facts as work proceeds.

## Document labels

Use these labels in future updates:

- **Policy** — mandatory rule or standard.
- **Repository Fact** — verified against the current codebase.
- **Decision** — accepted ADR.
- **Runbook** — operational procedure.
- **Proposal** — not yet approved or implemented.
- **Template** — reusable structure, not current system truth.

# Codex Start Guide

## Purpose

Use the Operating Manual to understand Memboux policies and intended conventions. Use the repository itself to discover implementation details.

## Before every task

1. Read the root `AGENTS.md`.
2. Identify the affected product area and technical layers.
3. Read the relevant manual sections.
4. Inspect current source files, tests, migrations, and configuration.
5. Search for an existing implementation pattern before creating a new abstraction.
6. Check accepted ADRs for constraints.

## Context by task type

| Task | Required sections |
|---|---|
| Product behavior | Product OS, Architecture, relevant feature code |
| Backend change | Engineering OS, Architecture, Backend, Database/API as applicable |
| Frontend change | Engineering OS, Frontend, API contract, Accessibility |
| Schema change | Database, Backend, ADRs, migration runbook |
| API change | API, Security, Backend, tests |
| Authentication/permissions | Security, Permission Model, API Authorization |
| Deployment/configuration | DevOps, Security, relevant Cloudflare configuration |
| Incident/hotfix | Operations and Runbooks |

## Required output from Codex

For each completed task, report:

- What changed
- Why it changed
- Files modified
- Tests/checks executed and their actual results
- Documentation updated
- Remaining assumptions, risks, or follow-up work

## Prohibited behavior

Do not:

- invent repository structures or APIs;
- assume the V1 manual exactly matches the codebase;
- add a dependency without checking existing alternatives;
- create a new service/repository/component when an existing one can be extended cleanly;
- alter database history;
- weaken security or validation to make a task pass;
- perform broad unrelated refactors.

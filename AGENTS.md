# Memboux AI Agent Instructions

This file is the primary entry point for Codex and other coding agents.

## Mandatory reading order

Before changing code, read:

1. `docs/operating-manual/00_Start_Here/CODEX_START_HERE.md`
2. `docs/operating-manual/02_Engineering_OS/AI_CONSTITUTION.md`
3. `docs/operating-manual/02_Engineering_OS/ENGINEERING_STANDARDS.md`
4. `docs/operating-manual/02_Engineering_OS/CODING_STANDARDS.md`
5. `docs/operating-manual/03_Architecture/README.md`
6. The documentation section relevant to the task.

## Repository truth rule

The repository is the source of truth for implementation details. Version 1 of the Operating Manual contains policies and intended conventions, but it is not yet a complete description of the live codebase.

Never invent routes, tables, bindings, environment variables, services, repositories, components, workflows, or dependencies. Inspect the repository first.

## Required workflow

1. Inspect the relevant files and nearby patterns.
2. State the implementation plan and assumptions.
3. Make the smallest coherent change.
4. Add or update tests.
5. Run the relevant checks.
6. Update documentation when behavior or architecture changes.
7. Summarize changed files, checks run, and unresolved risks.

## Safety rules

- Do not expose, print, or commit secrets.
- Do not modify production data manually.
- Do not rewrite historical migrations.
- Do not introduce a breaking API or schema change without a migration plan.
- Do not bypass authorization, validation, or audit requirements.
- Do not claim a test passed unless it was actually executed.

## Documentation precedence

When documents conflict, use this order:

1. Explicit task requirements
2. Current repository behavior and tests
3. Accepted ADRs
4. Architecture documentation
5. Engineering standards
6. General reference documentation

Report conflicts rather than silently choosing an interpretation.

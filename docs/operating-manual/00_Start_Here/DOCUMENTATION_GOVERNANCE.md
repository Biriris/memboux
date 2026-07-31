# Documentation Governance

## Ownership

Every material code or architecture change must update the relevant documentation in the same pull request.

## Accuracy rules

- Verify repository facts before documenting them.
- Include file paths, configuration keys, route names, or migration identifiers when describing implementation.
- Mark future-state ideas as proposals.
- Do not convert assumptions into facts.
- Supersede architectural decisions through a new ADR; do not silently rewrite history.

## Review triggers

Documentation review is required when changing:

- public or internal APIs;
- database schema or retention rules;
- authentication or authorization;
- deployment configuration or Cloudflare bindings;
- event/media lifecycle;
- operational procedures;
- user-visible business behavior.

## Version 2 approach

Version 2 is not a separate pile of documents. Upgrade the existing manual incrementally: replace generic statements with verified repository facts, while preserving policies that remain valid.

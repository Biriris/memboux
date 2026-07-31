# Service Pattern

## Responsibility
Services implement business rules.

## Rules
- No HTTP-specific logic.
- No SQL embedded in services.
- Services orchestrate repositories.
- One business capability per service.
- Return domain results, not UI models.

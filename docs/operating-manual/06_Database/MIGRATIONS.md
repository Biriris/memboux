# Migration Strategy

Rules:
- Every schema change uses a versioned migration.
- Never edit historical migrations.
- Test migrations before deployment.
- Preserve backwards compatibility during rollout.

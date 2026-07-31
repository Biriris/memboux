# Schema Evolution

Schema evolution must be incremental.

Every release should support rolling upgrades and safe rollback where practical.

## D1 parent-table rebuilds

**Repository Fact:** D1 keeps foreign-key actions such as `ON DELETE CASCADE`
active when `PRAGMA defer_foreign_keys` is enabled. A migration must not drop and
recreate a parent table unless it also proves that every dependent row is
preserved.

Migration `0060_expand_event_types_and_locales.sql` uses additive canonical
columns for the heavily referenced `events` table instead of rebuilding it. The
original constrained columns remain as `default_locale_legacy` and
`event_type_legacy`; application reads and writes use the new
`default_locale` and `event_type` columns. This keeps all event-owned foreign-key
relationships intact while expanding support to six locales and the bachelor
event type.

The migration rebuilds `cloud_oauth_states` because it has no dependent tables.
Its existing rows are copied before the old table is removed.

## Required compatibility coverage

When TypeScript unions or public options correspond to D1 `CHECK` constraints,
tests must execute the migration and insert every supported application value.
The compatibility test for migration `0060` also verifies preservation of an
existing event membership and runs `PRAGMA foreign_key_check`.

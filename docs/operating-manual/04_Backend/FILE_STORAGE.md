# File Storage

Media lifecycle:
Upload -> Validation -> Storage (R2) -> Metadata (D1) -> Delivery.

Original files are immutable.

Original delivery and export are separate from preview delivery. Cloud backup
is an original export and must pass the same event-access entitlement check
before a backup snapshot is created and again before background processing
starts.

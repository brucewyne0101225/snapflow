# Security Notes (MVP Baseline)

## Data Handling

- Secrets are environment variables only (`.env`), never hardcoded.
- Database stores only required event/user/photo metadata.
- Selfie retention policy: selfie uploads for Find Me are processed in memory and are not persisted.
- Access control policy: photographer-managed event access + guest public read for published photos.

## Storage

- Original photo binaries will be stored in S3-compatible object storage.
- Photos are uploaded using short-lived signed `PUT` URLs.
- Gallery access uses short-lived signed `GET` URLs.
- Draft photos are hidden from guest/public gallery endpoints.
- Rekognition indexing stores provider face identifiers mapped to photo IDs in DB (`FaceEmbedding`), not selfie files.
- Paid downloads require purchase-token-validated API access before issuing short-lived original-file URLs.

## Audit and Logging

- Avoid logging secrets, tokens, or raw payment payloads.
- Log minimum event metadata for debugging.
- Stripe webhook signatures are verified before payment state updates.

## User Privacy Controls

- Planned endpoint/admin action for "Delete my data" as required by MVP constraints.

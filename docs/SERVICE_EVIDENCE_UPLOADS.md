# Private service evidence uploads

Service evidence accepts JPEG, PNG, WebP and PDF files from 1 byte through 15 MiB. File bytes now go directly to Supabase Storage, avoiding the hosting function request-body limit. The app endpoint accepts only JSON instructions up to 16 KiB. Old multipart clients must reload the service editor.

The browser creates one UUID for each chosen upload, prepares its actor/submission/metadata binding, uploads to the exact private signed destination without app credentials, and asks the server to complete. Completion checks Storage object metadata and then executes a locked database transaction. The transaction independently verifies object size and MIME type and records evidence, activity and its completed receipt together. No byte-signature or malware inspection is claimed.

`prepare_service_evidence_upload` and `commit_service_evidence_upload` are service-role-only RPCs. Providers can create evidence for their own draft or changes-requested submission. The existing trusted administrator override remains. Completed receipts can replay after a submission closes, subject to current account and actor permission checks. A delete creates a receipt tombstone in the existing evidence transaction so delayed completion cannot recreate the deleted attachment. Direct client/table access remains denied.

The control response binds `uploadId`, `submissionId`, `actorId`, `bucket` and `storagePath`. Its phase is `upload` (signed URL), `uploaded` (matching bytes already present), or `committed` (original evidence result). Retries using the same UUID cannot change metadata or duplicate a committed row. After an unknown outcome, **Reload the saved version** reconciles the original bound attempt before unlocking new uploads. An ordinary submission read cannot settle an in-flight commit. Another file cannot replace an unresolved attempt.

Recovery is retained for the current service-editor controller's lifetime. Original bytes can be retried within the same account session; account transitions discard those bytes and clear displayed private data. Original metadata remains isolated to its actor so that returning to that account can reconcile an arrived or committed file. If bytes are still absent after an account transition, the editor keeps the attempt blocked and explains that limitation. This is not durable recovery across a full browser-page reload or navigation away.

Private reads and deletion keep their existing participant permissions and short-lived preview links. A failed upload completion never deletes a potentially committed object. Abandoned prepared receipts and uncommitted private objects have no automatic retention cleanup in this release. Deletion can report physical cleanup pending after its metadata transaction succeeds. Any future cleanup must coordinate with upload receipts and active signed capabilities.

Apply `20260917210000_service_evidence_uploads.sql` and `20260917211000_release_readiness.sql` after the historical `.4` migrations. Promote only when the `.5` readiness contract passes all 14 checks. It covers exact functions, receipt columns, constraints, indexes, triggers, permissions and the private bucket's size/MIME settings. The production migration adds protocol objects without uploading files or changing customer records.

Validation commands:

```text
npm run test:service-evidence --workspace @qrguitar/web
npm run test:provider-workbench --workspace @qrguitar/web
npm run test:release-readiness --workspace @qrguitar/web
```

These exercise browser orchestration, API behavior, actual SQL with synthetic Storage metadata, and catalog fault injection. The Service evidence upload concurrency GitHub workflow additionally requires eight observed lock barriers across independent PostgreSQL 17 connections. These checks do not replace a hosted Storage upload or physical-device acceptance.

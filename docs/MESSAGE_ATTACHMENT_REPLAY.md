# Message attachment receipt replay

The owner approved only the reviewed preparation-function correction. It was applied through a conflict-guarded transaction and independently read back on 30 September 2026 UTC. Frontend production remains 9d28ac8. No customer QA records, grants, payment, CMS or other functions changed.

The correction reuses an existing matching prepared receipt before charging the new-receipt quotas. Four-file and hourly limits still apply to new receipts. Existing tuple, actor, conversation, file, state and sent-operation guards remain.

Approved proposal SHA-256: 99f22e57cfd56c3f4bd24596e228804f992b74a0270dfe9fbbe52934acb6e70e. New function-body SHA-256: 298ef6a5e0b0e967bde93fc1958533982d8293715dbbcb5fe8a2f7b77c4eb839. The migration differs from the reviewed SQL only in its introductory comment.

Run npm run test:member-message-upload-replay from apps/web. Its 26 isolated cases cover original boundaries, quota replay, denied new receipts, rollback and real route handlers using synthetic Storage. This in-memory single-connection test is not real Auth/Storage/browser or independent-transaction concurrency evidence.

The historical rollback fixture is for isolated tests only. Production rollback must use the captured conflict-guarded rollback in outputs/profile-editor-usability-20260929/M1-captured-guarded-rollback.sql, after independently confirming current function identity. Do not use db push to repeat the production change. No migration ledger row was written during the scoped apply.

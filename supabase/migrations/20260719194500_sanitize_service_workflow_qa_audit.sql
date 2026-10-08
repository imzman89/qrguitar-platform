update public.admin_audit_events
set
  actor_email = null,
  reason = 'TEMP SERVICE WORKFLOW QA (sanitized)',
  metadata = jsonb_build_object('qa', true, 'sanitized', true)
where created_at >= timestamptz '2026-07-19 18:00:00+00'
  and action in (
    'service_provider.verified',
    'service_submission.draft_created',
    'service_submission.approved',
    'service_submission.evidence_reviewed'
  );

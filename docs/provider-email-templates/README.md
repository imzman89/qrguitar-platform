# Supabase Auth email install artifacts

These are the three provider-owned templates used by the current application:

| Supabase template | Subject | Source artifact | Application trigger |
| --- | --- | --- | --- |
| Confirm signup | `Confirm your QRguitar account` | `supabase-confirmation.html` | `supabase.auth.signUp` |
| Reset password | `Reset your QRguitar password` | `supabase-recovery.html` | `supabase.auth.resetPasswordForEmail` |
| Magic link | `Sign in to QRguitar` | `supabase-magic-link.html` | transfer invitation through `supabase.auth.signInWithOtp` |

Every artifact preserves Supabase's required `{{ .ConfirmationURL }}` Go-template placeholder in both the button and visible fallback URL. The files use the same charcoal, white, and orange responsive family as the application-rendered service-review email. They do not add a campaign, security alert, receipt, or other trigger.

## Controlled install

1. Export or copy the current provider subject and body for rollback.
2. Diff the provider value against the matching artifact.
3. Paste only the reviewed subject and HTML body into the matching Supabase Auth template.
4. Save, then reopen the template and confirm the subject, HTML, and `{{ .ConfirmationURL }}` placeholder survived exactly.
5. Use a disposable, explicitly approved recipient for one provider-owned flow. Confirm the redirect stays on an allowed QRguitar URL.
6. Record provider acceptance and inbox rendering separately. A saved template or accepted request does not prove delivery.

Content Studio does not synchronize these files into Supabase. Its related fields are review references; the provider console remains the delivery authority.

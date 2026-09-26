# QRguitar Supabase Auth email templates

The reviewed, directly installable HTML is maintained as separate provider artifacts:

- [Confirm signup](./provider-email-templates/supabase-confirmation.html)
- [Password recovery](./provider-email-templates/supabase-recovery.html)
- [Magic link / transfer sign-in](./provider-email-templates/supabase-magic-link.html)
- [Subjects, trigger ownership, and controlled install procedure](./provider-email-templates/README.md)

Use these only in Supabase under `Authentication -> Emails -> Templates`. Keep the sender name `QRguitar`, the verified sender address, and the approved support reply-to configured in the provider. Do not paste these into Brevo or create duplicate application sends.

Content Studio does not synchronize Auth templates into Supabase. The related CMS fields are review references. Provider configuration, request acceptance, and inbox delivery are separate evidence.

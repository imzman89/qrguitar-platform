# QRguitar customer walkthrough and safe review

Use this guide alongside [Content Studio owner instructions](CONTENT_STUDIO_OWNER_GUIDE.md), the [content map](content-studio-map.json), and the [release runbook](RELEASE_2026_09.md). The release acceptance record identifies the tested source and remaining limitations; this walkthrough is not evidence that a task passed.

## Understand the product

1. Open the homepage, then Catalog. Open a real instrument and browse its photos, details and recorded history.
2. Use the permanent Profile link or its QR to return to that same Profile. A scan does not change ownership.
3. Verification, authenticity, condition and ownership describe different facts. A free Profile may receive a free QRguitar review; that does not grant an authenticity-confirmed status.

## Create and maintain a Profile

In the disposable review environment, sign in with a synthetic account. From Dashboard choose Create a Profile. Add the required identification, a real instrument photo and the intended visibility. Optional details can be added later. Save, then use View Profile or Open Print Suite. Additional work remains under Add more to this Profile.

Reopen from Dashboard to edit. After saving, reload and check the value and image. A success message alone does not establish persistence. Private and unlisted Profiles are different: unlisted is accessible to someone with its link; private requires authorized access. Serial-field visibility cannot remove a serial already contained in an existing permanent identifier.

For a collection, use Account's collection section. Public collection identity and instrument Profile information are separate. A collection includes only eligible public Profiles; changing the collection does not publish private instruments.

## Print and hand off

Open Print Suite from the Profile or Dashboard. Choose the supported format and paper size, inspect the preview, then print. Optional appearance settings are in the settings drawer. Keep the QR high contrast with its clear surrounding margin. Browser PDF verification does not establish physical printer or phone performance.

For a buyer, use the existing ownership request or transfer workflow. The current owner and intended recipient have different actions. Sending a link, scanning a QR, or describing an instrument as sold does not complete a transfer. An invited transfer completes only after the authorized recipient accepts it. An ownership request is a separate reviewed process; submitting one does not change ownership.

To withdraw your own pending ownership request, open Ownership Requests and choose Withdraw request on that request. Review the confirmation; Keep request leaves it unchanged. A completed withdrawal closes the request without changing the instrument's owner, permanent link, or evidence. Closed requests cannot be withdrawn. If the request changed in another session, review its refreshed status before taking another action.

For service work, the provider records the work and submits it for owner review. The owner decides whether to accept it into the Profile history. Provider contributions do not automatically establish ownership or authenticity.

## Edit website wording

Open Admin and Content Studio with an authorized administrator account. Select the page and section; use the content map to locate the intended wording. Save a draft, inspect the actual route preview, and publish only the intended reviewed changes. A draft is not live content. On a conflict, reload the current revision and reconcile it; do not overwrite someone else's draft. The owner guide covers restoring a revision.

Ordinary interface wording is distinct from people's Profile fields, messages, private records and protected security/legal disclosures. Auth-provider email templates and browser-generated labels are not automatically editable through Content Studio. Follow the content map's publication boundary rather than assuming every email-shaped field changes provider emails.

## Safe testing boundary

The operator must verify Auth, database/API, Storage, captured email and payments before any mutation. A localhost address alone is not proof of isolation. Use synthetic accounts, photos and documents. Do not copy customer data, enter real payment details, send real email, or create production QA Profiles.

The existing September 26 disposable runtime uses loopback API 55431, database 55432, captured email 55434/55435, and a dedicated HTTPS test application at localhost:55440. These are recorded runtime coordinates, not permission to reset or seed an unknown database. Confirm the current runtime and source before reuse. Dedicated automated test contexts handle its temporary certificate; do not change Windows trust or everyday browser validation to open it.

Production https://www.qrguitar.com is a separate environment. Workflow testing there remains read-only during release verification. The automated test operator is responsible for the test work; this walkthrough does not shift unfinished verification to the customer.

## Operational evidence and limits

The read-only /api/build-info identifies the deployed source. /api/health checks database compatibility and readiness; it does not prove email arrival, upload completion, ownership acceptance or payment fulfillment. Check those through the applicable isolated workflow evidence and authorized provider operations.

Application service-review emails use published CMS templates and the configured Brevo transport. Transport rejection or missing configuration must remain a visible failure, never a claim that email arrived. Signup/recovery delivery is the Auth provider's separate configuration. Captured local email does not prove production inbox placement.

Commercial promises remain five free owned Profiles, approved additional Profile credit packs, free transfers and separately approved business exceptions. This review changes none of those terms and activates no payment provider. Pilot observations and revenue measures in [OPERATING_PILOT.md](OPERATING_PILOT.md) are future operating work, not completed acceptance results.

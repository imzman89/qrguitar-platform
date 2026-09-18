# Optional tracking integration boundary

QRguitar does not load analytics or advertising code by default. Search metadata,
structured data, the sitemap, and `robots.txt` are ordinary site output and do not
depend on tracking consent.

Set `NEXT_PUBLIC_OPTIONAL_TRACKING_PURPOSES` only when a reviewed provider is ready:

- `analytics`
- `advertising`
- `analytics,advertising`

Any blank or partly invalid value disables the optional system and keeps the notice
hidden. A saved choice applies only to the exact configured purposes. Changing the
purposes or consent schema makes the old choice stale, so loading fails closed and
the visitor is asked again.

Provider code must enter through `activateOptionalTracking(purpose, loader)` from
`apps/web/lib/optional-tracking-consent.ts`. The loader runs only after a verified
`accepted` choice and at most once while that activation remains active. Missing,
denied, malformed, stale, or inaccessible browser storage never authorizes the
loader. Do not import a provider from the root layout or include a remote script
before this callback runs. Do not queue or replay events that happened before
acceptance.

The loader may return a cleanup function. QRguitar invokes that cleanup immediately
when the visitor withdraws consent and when the activation is disposed. A provider
that starts timers, listeners, automatic page views, storage, or network activity
must return cleanup that stops those behaviors. When a loader returns no cleanup,
the boundary can stop future QRguitar event dispatch but cannot claim that the
provider itself was unloaded or that data already sent was erased.

The consent change event is `qrguitar:optional-tracking-consent`. Integration code
can use `subscribeToOptionalTrackingConsent` rather than reading browser storage
directly. The compact `Privacy choices` control remains available whenever optional
tracking is configured. An accepted visitor can turn tracking off in one step.

Product events cross one provider-neutral boundary:

- `dispatchOptionalTrackingProductEvent` validates a fixed event/property schema,
  requires configured and accepted `analytics`, and rejects unexpected fields.
- `subscribeToOptionalTrackingProductEvents` receives only the sanitized event
  detail. A provider adapter should subscribe inside `activateOptionalTracking` and
  return the unsubscribe/provider cleanup function.
- Business success events require a private business dedupe key. The boundary derives
  a stable `qrg_evt_v1_...` SHA-256 token using the event name and key, then stores at
  most 128 tokens for the configured purposes in local browser storage. The raw key is
  never stored or included in event detail. These tokens are pseudonymous rather than
  anonymous: a party that already knows a source identifier may be able to link its
  derived token.
- If the browser cannot derive a SHA-256 token, business conversion dispatch fails
  closed. Repeatable public Profile page views do not need this token.
- When the Web Locks API is available, the boundary serializes the same conversion
  across tabs before checking shared local storage. Without cross-context locking or
  durable storage, only same-page best-effort dedupe is possible.
- Every provider adapter **must** pass `idempotencyToken` as that provider's event,
  transaction, or dedupe identifier. This is what suppresses the same conversion
  across devices and after local storage is cleared. Do not enable a provider that
  cannot honor the token for business conversion events.
- Denying optional tracking clears the local conversion markers. If the visitor later
  accepts again, QRguitar may emit the same stable token; the provider must still
  dedupe it. Clearing browser storage has the same limitation.
- `public_profile_viewed` is a normal repeatable page-view event. It has no business
  dedupe key or `idempotencyToken`.

Use the exported `optionalTrackingProductEvents` constants for registration and
conversion events:

| Export | Event name | Emit only when |
| --- | --- | --- |
| `publicProfileViewed` | `public_profile_viewed` | A public or unlisted Profile has rendered successfully; sends only `visibility` and remains repeatable. |
| `qrLandingViewed` | `qr_landing_viewed` | **Reserved and intentionally blocked.** No trustworthy QR-origin marker exists yet, so QRguitar does not emit this event or infer a scan from a Profile visit. |
| `registrationCompleted` | `account_registration_completed` | Supabase confirms a genuinely new identity; sends `confirmation` (`email_pending` or `session_ready`) plus `idempotencyToken`. |
| `profileCreated` | `profile_creation_completed` | The Profile creation API confirms its committed record; sends `visibility` plus `idempotencyToken`. |
| `checkoutStarted` | `credit_checkout_started` | The payment server confirms a valid checkout order; sends the fixed pack's `credits` and `valueUsd` plus `idempotencyToken`. |
| `purchaseCompleted` | `credit_purchase_completed` | An authoritative status read shows the server ledger has fulfilled the order; sends `credits` and `valueUsd` plus `idempotencyToken`. |
| `ownershipTransferCompleted` | `ownership_transfer_completed` | The transfer transaction confirms `accepted`; sends `method` (`email_link`, `buyer_code`, or `review`) plus `idempotencyToken`. |

Never emit a success event from a button click, optimistic screen, return URL, or
client-only payment result. Do not send names, email addresses, authentication data,
instrument serial numbers, public Profile URLs, free-form text, or raw QRguitar,
transfer, payment, or order identifiers to an optional tracking provider. Extend the
typed runtime sanitizer and its tests before adding any event property.

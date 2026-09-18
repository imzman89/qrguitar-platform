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
  transaction, or correlation identifier. Provider behavior must be documented
  accurately. The local boundary suppresses recent duplicates in the same browser,
  but a token does not by itself guarantee provider-side or cross-device deduplication.
  GA4 documents `transaction_id` deduplication for `purchase`; QRguitar uses the token
  for that field. QRguitar also sends the token as `event_id` on every business event,
  but GA4 does not promise equivalent automatic deduplication for other web events.
- Denying optional tracking clears the local conversion markers. If the visitor later
  accepts again, QRguitar may emit the same stable token. GA4 deduplicates a repeated
  purchase transaction ID, while its other events may be counted again. Clearing
  browser storage has the same limitation.
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

## Google Analytics 4 adapter

The built-in GA4 adapter remains disabled unless both settings are valid in the same
build:

```dotenv
NEXT_PUBLIC_OPTIONAL_TRACKING_PURPOSES=analytics
NEXT_PUBLIC_GA4_MEASUREMENT_ID=G-XXXXXXXXXX
```

The Measurement ID must be uppercase and match the bounded `G-...` format. A blank or
invalid ID does not load a script, create Google storage, expand Content Security
Policy, or show an analytics-only consent prompt. Never commit a real Measurement ID
to an example file.

`GoogleAnalyticsRuntime` enters only through `activateOptionalTracking("analytics",
loader)`. Once that boundary verifies a saved acceptance, the loader subscribes to
sanitized product events before inserting `https://www.googletagmanager.com/gtag/js`.
This ordering keeps initial accepted-session events while dropping, rather than
buffering, everything that occurred before consent. The adapter uses basic consent
mode: advertising storage, advertising user data, advertising personalization, Google
signals, and ad-personalization signals stay denied or disabled.

Page views are manual. Dynamic paths are mapped locally to coarse categories such as
`public_profile`, `public_collection`, `ownership_transfer`, or `billing`. GA4 receives
only a synthetic URL below `https://www.qrguitar.com/_measurement/`, a fixed title,
an empty referrer, and the category. It never receives the routed QRG code, collection
handle, transfer token, query string, fragment, or actual dynamic URL from QRguitar's
adapter. Product events receive that same coarse page context.

The event mapping is deliberately small:

| QRguitar event | GA4 event | Provider parameters |
| --- | --- | --- |
| `public_profile_viewed` | `public_profile_viewed` | `profile_visibility` only |
| `account_registration_completed` | `sign_up` | fixed `method`, bounded confirmation, `event_id` |
| `profile_creation_completed` | `profile_created` | bounded visibility, `event_id` |
| `credit_checkout_started` | `begin_checkout` | fixed USD pack value and synthetic pack item, `event_id` |
| `credit_purchase_completed` | `purchase` | fixed USD pack value and synthetic pack item, `event_id`, matching `transaction_id` |
| `ownership_transfer_completed` | `ownership_transfer_completed` | bounded method, `event_id` |

Withdrawal stops QRguitar dispatch, sends a denied consent update, sets Google's measurement-disable flag, removes the injected script, and makes a best-effort attempt
to expire `_ga` cookies for the current QRguitar host. Executed third-party JavaScript
cannot be unloaded perfectly, and withdrawal does not erase data already transmitted.

### Required GA4 launch settings

Before setting the two environment values in production:

1. In the GA4 web data stream, turn off Enhanced Measurement. At minimum, disable
   **Page changes based on browser history events**. Google's documentation states that
   these automatic history page views can still fire when `send_page_view: false`; they
   would bypass QRguitar's coarse route mapper. Keep outbound-click and form measurement
   off as well so URLs and free-form values cannot enter through provider automation.
2. Keep Google Ads links, Google signals, ad personalization, User-ID, and enhanced
   conversions off. This adapter is analytics-only.
3. Deploy the valid Measurement ID and `analytics` purpose together. Verify that a clean
   browser makes no request to Google and has no `_ga` cookie before acceptance.
4. After acceptance, verify the synthetic page location and bounded event parameters in
   GA4 DebugView. Verify that the real URL, query, referrer, QRG code, handle, serial,
   name, email, and payment/transfer identifiers are absent.
5. Turn tracking off and verify that no later route or product event is dispatched, the
   measurement-disable flag is set, the injected script is removed, and `_ga` cookies
   are expired where the browser permits it.

Official implementation references: [basic consent mode](https://developers.google.com/tag-platform/security/concepts/consent-mode),
[manual page views](https://developers.google.com/analytics/devguides/collection/ga4/views),
[configuration controls](https://developers.google.com/analytics/devguides/collection/ga4/reference/config),
[ecommerce events](https://developers.google.com/analytics/devguides/collection/ga4/ecommerce),
and [Google's CSP guidance](https://developers.google.com/tag-platform/security/guides/csp).

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
`accepted` choice and at most once for that activation. Missing, denied, malformed,
stale, or inaccessible browser storage never authorizes the loader. Do not import a
provider from the root layout or include a remote script before this callback runs.
Do not queue or replay events that happened before acceptance.

The consent change event is `qrguitar:optional-tracking-consent`. Future integration
code can use `subscribeToOptionalTrackingConsent` rather than reading browser storage
directly.

Use the exported `optionalTrackingProductEvents` constants for registration and
conversion events:

| Export | Event name | Emit only when |
| --- | --- | --- |
| `registrationCompleted` | `account_registration_completed` | The server-confirmed new account is available. |
| `profileCreated` | `profile_creation_completed` | The Profile creation transaction has committed. |
| `checkoutStarted` | `credit_checkout_started` | A checkout order or session was created successfully. |
| `purchaseCompleted` | `credit_purchase_completed` | The server ledger has durably granted the purchased credits. |
| `ownershipTransferCompleted` | `ownership_transfer_completed` | The authoritative ownership transfer transaction has committed. |

Never emit a success event from a button click, optimistic screen, return URL, or
client-only payment result. Do not send names, email addresses, authentication data,
instrument serial numbers, QRguitar IDs, public Profile URLs, transfer tokens, or
free-form text to an optional tracking provider. Define and review a minimal typed
property schema before adding any event properties.

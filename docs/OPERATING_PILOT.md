# QRguitar operating pilot

Use this alongside [the release runbook](RELEASE_2026_09.md). The current product already has Profile creation, service review, ownership handoff, printing, and account roles. This pilot measures whether those workflows are useful without changing entitlements or promising new features.

## First use

Ask five people unfamiliar with QRguitar to create a Profile with a photo, open its QR, and find the Print Suite. Give the task, then observe without coaching. Record completion, elapsed time, hesitation points, errors, and whether help was needed. Use a synthetic or expressly authorized instrument. The proposed target is at least four of five completing a useful Profile without coaching and a median under three minutes; this is a target, not a measured result.

## Shop to owner

Pilot with independent shops or builders. For each real job, record time spent entering service work, any details entered twice, whether the owner reviewed it, whether a handoff was sent and accepted, and whether the shop returned for another instrument without a reminder. Do not treat an email sent, QR scanned, or owner-entered description as proof of completed ownership or verified service.

## Weekly operating scorecard

Keep aggregate counts and minutes, without raw serials, private documents, claim links, or personal messages:

| Measure | Source to reconcile | Why it matters |
| --- | --- | --- |
| First useful Profiles completed without coaching | Observed pilot sessions | Initial usability |
| Median Profile creation and routine service-entry minutes | Timed pilot sessions | Work saved or added |
| Invitations sent and accepted | Authoritative transfer states | Handoff completion |
| Independent shops returning for a second job | Shop follow-up record | Repeat workflow value |
| Repeat paid purchases and support minutes | Verified billing ledger and support log | Unit economics |
| Restored data and media opened successfully | Isolated restore exercise | Durability of permanent records |

Separate credits, assisted services, provider fees, hardware/shipping, onboarding labor, and a storage/support provision when calculating package margin. The 5 free owned Profiles and free transfers are current promises; measure credit use before changing future offers. One-time purchases are not recurring revenue.

## Data and media recovery gate

The database and Storage objects must be recoverable together. In an isolated environment, restore a compatible database snapshot and the corresponding actual media bytes. Open a restored public Profile and a private owner Profile with an authorized test account; inspect ownership and service history, render photos, download a private document, and verify another account cannot access it. Record snapshot times, media object counts, failures, restoration time, and the responsible operator. A database-only restore or metadata-only file listing is not a pass. Do not copy customer data to the disposable browser test backend or perform a production restore as a trial.

## Repeatable release

Use the current checkout and [release runbook](RELEASE_2026_09.md) to record commit, environment, migrations if required, checks, deployment identity, and rollback target. Keep one current acceptance record. A second operator should rehearse a small fix and rollback on an isolated deployment without relying on conversation history. Any real production rollback must respect current database contracts and CMS revisions.

The next product changes should come from the three largest observed sources of wasted time or repeated entry. Keep verification, ownership, sale status, and physical custody distinct in both copy and data.

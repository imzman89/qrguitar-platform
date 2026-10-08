# Android photo selection recovery

Android photo selection uses the local `QrguitarPhotoPicker` module and a request-identified durable result protocol. The JavaScript coordinator and Create-screen tests pass locally and in clean CI. The Kotlin module compiled and its 15 native tests passed in [the first isolated Android run](https://github.com/imzman89/qrguitar-platform-live/actions/runs/35348187838), bound to source `4d8bbee47924fd56cd1e6f9a9c6a7abde1adc7cc`. No Android device acceptance or native release is claimed. Photo recovery never uploads images or creates a Profile, and does not change signing or the existing upload/create contracts.

## New selections and durable acknowledgement

The Android facade requires native protocol version 1 before starting a new selection. A missing module leaves the saved draft available and reports that the installed app needs an update. It never falls back to launching Expo's anonymous Android picker.

1. Save the latest editable draft, then persist an encrypted account-scoped selection intent. The intent binds the account, selection ID, draft upload/create identities, existing photo IDs, remaining photo capacity, and remaining byte allowance. Failure to save the intent prevents native launch.
2. Call `startSelectionAsync(selectionId, options)`. Native code persists that identity before dispatching its dedicated `PhotoSelectionActivity`. Start can return `pending` promptly. A repeated start cannot replace the options or launch the same request again.
3. Native code records selected URI identities and a result ID, acquires selected-URI access, and prepares the image bytes. The request journal and image files use AES-GCM with an Android Keystore key in the app's no-backup directory. `readSelectionAsync(selectionId)` reads the exact request without consuming a ready result. Captured work can resume on a later read.
4. The coordinator validates the response identity and applies photos only to the original, still-editable draft under a current account lease. Photos and `lastPhotoSelectionId` are committed in one encrypted draft write. An uncertain, frozen, replaced, or other account's draft cannot receive them.
5. Only after that draft commit succeeds does the coordinator call `acknowledgeSelectionAsync(selectionId, resultId)`. Native acknowledgement requires the exact result ID and durably records the terminal state before image/grant cleanup. The JavaScript intent is cleared only after acknowledged status is observed.

A failed draft write leaves the native result readable. A lost acknowledgement or cleanup response can be reconciled after restart using the same selection and receipt without appending photos again. Native cleanup failures retain the terminal record and cleanup manifest for retry; they do not turn a completed request back into a ready one. Corrupt or unavailable encrypted storage is an explicit error, not evidence that a request is missing.

`pending` or `missing` keeps the intent available for recovery or deliberate discard. Cancellation clears only that selection's intent. A failed result remains identifiable and discardable. No timeout silently abandons a selection.

The existing draft limits remain eight photos, 12 MiB per image, and 16 MiB combined decoded photo bytes. The new request receives the capacity left by existing draft photos; native delivery and draft validation both enforce their limits. Invalid results are not copied into the JavaScript intent as image bytes.

## Recovery, editing, and account changes

Create checks for recovery on restoration, foregrounding, and `onSelectionChanged`. Native events contain only the selection ID and status. They are hints to read durable state, not photo deliveries. The coordinator filters them against the current account's persisted request; another account's event cannot authorize a read or attachment.

The screen queues and coalesces recovery events arriving during restoration, picker work, or a draft mutation. Before every recovery, choosing photos again, or confirmed pending-selection discard, it saves dirty editable fields, including edits made before the 600 ms autosave. If that save fails, recovery does not consume or apply a result. When recovered photos are shown, the latest input/photo references update synchronously so a queued save cannot overwrite them with the previous rendered list. Unmount unsubscribes and invalidates queued work.

Each account has its own encrypted intent. An account switch invalidates outstanding leases, including an A-to-B-to-A switch; returning to the original account can recover its original request. Native storage uses opaque request IDs and receives no account IDs or authentication tokens.

Confirmed selection discard calls `discardSelectionAsync` before removing the JavaScript intent. Native code writes a durable terminal record even when the ID has not yet reached native start. That record fences a delayed start, callback, or image-processing completion for the same ID. Discard preserves saved draft fields, photos, and any create attempt. Discarding a selection is separate from discarding the draft.

## Upgrading existing anonymous selections

The old Expo ImagePicker adapter is retained only to recover or discard an existing legacy intent for its original account. New Android selections always use the identified module. With no matching legacy intent, the facade does not drain Expo's pending-result slot.

Previously checkpointed photos and account-scoped legacy archives remain recoverable under their original draft binding. Invalid legacy results retain a readable terminal receipt without invalid image bytes. An unresolved legacy intent can now be explicitly discarded by its owner because the anonymous launch channel is retired. Another account neither consumes nor discards that intent and can use its own identified request. A late anonymous callback is never assigned to a new identified selection.

The upgrade cannot reconstruct bytes already lost by the old implementation between a destructive Expo pending-result read and its durable JavaScript checkpoint. Old null results do not prove that platform work completed. The identified protocol prevents new selections from sharing that anonymous slot; it does not retroactively make old results durable.

## Local verification and its limits

Run from `apps/mobile`:

```sh
node --test scripts/test-native-core.mjs
node --test scripts/test-native-ui.mjs
npm run typecheck
npm run lint
```

The core suite executes the actual coordinator and draft controller with injected native/auth/storage boundaries. Relevant named cases include:

- `identified native result is acknowledged only after the real encrypted draft receipt commits`
- `identified result survives process loss when application storage fails before commit` and its after-commit counterpart
- `native ack failure before commit reconciles without duplicate photos or launching a replacement` and its after-commit counterpart
- `native request IDs keep unresolved selections separate across accounts and reject an old A-B-A lease`
- `identified pending and missing requests can be deliberately discarded with draft preserved`
- `legacy unresolved selection can be abandoned only by its owner after the anonymous launch channel is retired`

The React UI suite executes the actual Create screen. It includes real facade/module-mock integration as well as isolated scheduling fixtures. Named cases cover `actual Android facade launches an identified request and filters native completion events before applying and acknowledging`, `identified event during picker work queues recovery instead of dropping the result`, `native event during queued draft mutation waits and preserves the dirty fields being committed`, `field edit and identified event in the same turn preserve input before React effects run`, and `dirty-draft save failure prevents recovery consumption and a later event retries the latest form`. It also checks unmount/account replacement, module absence without anonymous fallback, and legacy recovery-only behavior.

Native test sources are included under `modules/qrguitar-photo-picker/android/src/test/java/com/qrguitar/picker`:

- `SelectionPolicyTest`: callback eligibility, exact receipt acknowledgement, active statuses, request bounds, and per-image/combined byte limits.
- `SelectionStoreTest`: encrypted repeatable reads across store recreation; exact acknowledgement; missing-ID discard tombstones; late callback/processing rejection; cleanup and compaction failures; shared URI grants; request-file isolation; and corrupt or wrong-key records. The store tests exercise the store/AtomicFile/AES-GCM implementation with injected key, URI-grant, and image-decoding boundaries.

The isolated Android Gradle run compiled the module, assembled its debug library, and passed all five policy tests and ten actual-store Robolectric tests without failures or skips. It used the standard Ubuntu runner's preinstalled SDK and NDK, with a 30-minute timeout and no uploaded artifacts. These results do not establish a complete installed app build, real Keystore behavior, Android permission retention, picker lifecycle behavior, or device acceptance.

The extended `Android photo recovery` workflow builds an additional test-only offline debug app with an embedded Hermes bundle and runs a disposable API 35 emulator. Its generated-project overlay disables developer-server loading and removes the app's INTERNET permission; the workflow verifies the final APK has the environment-specific offline bundle, no ordinary network fixture, no network permission, and `testOnly` before installation. The workflow first exports every ordinary networked runtime, then explicitly exports the guarded Android-only offline fixture before Gradle embeds it. Metro validates a separate non-public acceptance-build guard and partitions its transform cache by the complete runtime environment. The exact validated fixture disables the JavaScript auth and API transports before either can call the native fetch implementation. The APK is never published or used as a consumer release. The standard included runner remains capped at 45 minutes, downloads only Android emulator/system-image/CMake tools with already-accepted SDK licenses, and uploads no artifacts.

Ten platform instrumentation cases exercise the production Android Keystore, encrypted AtomicFile storage and bitmap/EXIF paths; selected-URI grant bookkeeping remains injected there. Four app instrumentation cases exercise offline app navigation, actual OS picker cancellation, actual caller Activity recreation followed by OS cancellation, and successful real photo selection with a persisted picker URI grant and exact acknowledgement cleanup. The app tests enter the native picker Activity directly because fixture authentication cannot create a consumer session; they do not establish signed-in end-to-end selection, URI-grant persistence across process death, process-death recovery or physical-device acceptance. Test results are pending until the connected workflow succeeds. See the module's `android/src/androidTest/README.md` and `scripts/android-instrumentation` for the exact boundaries.

## Build and device acceptance before native release

The custom Android module must be included in a newly built development or release binary. A JavaScript-only update or stock Expo Go session cannot add it. Keep the module-unavailable error until a compatible binary is installed; do not enable anonymous fallback to bypass it. This Android change does not replace the existing iOS/web picker path.

After compilation and native tests pass, record the binary, Android versions/devices, picker providers, and results for these acceptance cases:

1. Normal selection, cancellation, background/foreground, **Don't keep activities**, and full process death at distinct stages: before picker launch, while choosing, after URI capture, after ready, after draft commit, and after acknowledgement. Confirm only the original draft receives photos once, with no upload or Profile request until explicit Create.
2. Logout and account switching before and during return, including A-to-B-to-A. Keep separate unresolved requests for both accounts. Confirm each can recover or discard only its own selection.
3. Inject storage failures before and after intent/draft commits, acknowledgement, marker removal, and native cleanup. Restart and retry. Confirm ready bytes remain recoverable until a draft receipt exists and no duplicate photos or create attempts appear.
4. Discard pending, missing, ready, and processing requests, then deliver delayed starts/callbacks. Confirm terminal identity survives restart, prevents resurrection, and preserves the saved draft and any uncertain create.
5. Upgrade with unresolved and checkpointed legacy intents. Recover or explicitly retire them as the owner; deliver a late anonymous result afterward and confirm a new identified request never consumes it.
6. Select too many photos, missing/unsupported images, and values around the per-image and combined byte limits, including existing draft photos. Exercise lost URI permission and corrupt storage. Confirm errors remain recoverable or explicitly discardable without deleting the draft.
7. Edit a field and immediately foreground, complete a native selection, choose photos, or confirm discard before autosave. Deliver completion during another mutation and immediately after unmount. Confirm latest text/photos persist and stale work cannot update the next screen/account.

Retain actual device failures and remaining limitations in the release record. Neither the local suites nor the included Kotlin test sources establish complete Android activity/process-death recovery on consumer devices.

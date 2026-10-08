# Installed app acceptance overlay

This is an acceptance-only offline debug APK overlay, not a production/release build. It does not contain working account credentials. Do not distribute the resulting APK to consumers. The exact CI fixture environment also selects a JavaScript transport that rejects locally without constructing a Supabase client or calling the platform fetch implementation. The Android-only export wrapper requires `--offline-acceptance` and a separate non-public build guard. Metro validates the same guard during Gradle's direct bundle command, injects bundle evidence only after validation, and partitions its cache by runtime environment. The generated APK remains guarded independently by `testOnly` and removal of `INTERNET`.

After Expo generates `apps/mobile/android`, run from repository root:

```sh
node --test apps/mobile/scripts/android-instrumentation/test-prepare.mjs
node apps/mobile/scripts/prepare-installed-test.mjs
```

`--check` validates inputs without writing. The script changes only generated `android/app/build.gradle`, `MainApplication.kt`, the debug manifest, and two owned app-target androidTest files. It embeds JavaScript/Hermes in debug, disables developer-server startup, adds the app test runner/dependencies, removes INTERNET permission, marks the APK `android:testOnly=true`, and adds test-only visibility for the OS photo-picker intent. The ordinary app runner selects only `InstalledAcceptanceTest`; the intentional-death helper is invoked separately by its host controller. Existing signing configuration is retained. Unexpected app identity/configuration or unrelated destination tests fail before writing.

Repeat the exact public fixture and `QRGUITAR_OFFLINE_ACCEPTANCE_BUILD` guard from `offline-acceptance-environment.json` during both the explicit offline Android export and Gradle bundling. Do not load production secrets, sign in, or start a separate Metro server. Before installing, verify the actual APK has `assets/index.android.bundle`, contains the fixture URL/key and Metro-injected bundle evidence, excludes the ordinary network fixture URL/key, lacks INTERNET permission, and is marked test-only. The test-only APK requires installation with test-app support (`-t`), which the connected instrumentation install provides.

From `apps/mobile/android`, expected tasks are:

```sh
./gradlew :app:assembleDebug :app:assembleDebugAndroidTest
./gradlew :app:connectedDebugAndroidTest
```

Keep the CI workflow's existing SDK/NDK, architecture, worker, and download guards on those commands. A fresh API 35 `google_apis` x86_64 emulator is the current target. This folder does not manage the emulator or install a toolchain.

Expected installed app suite: `com.qrguitar.acceptance.InstalledAcceptanceTest`, exactly four tests, all passing with zero skips:

1. `embeddedBundleLaunchesOfflineAndNavigationWorks`: actual Browse UI from the embedded bundle, expected offline Catalog error, signed-out collection/Login, manual QR screen, and background/foreground. No credentials submitted or camera permission granted.
2. `realSystemPickerCancellationRetiresOnlyItsRequest`: native target-process entry launches the actual non-exported Activity and OS picker, system Back delivers cancellation to the exact prepared request, and another request remains untouched.
3. `realSystemCancellationSurvivesRequestActivityRecreation`: while the real OS picker is visible, directly recreate its request Activity. Observe old instance destruction, saved state, a distinct restored instance, genuine Back cancellation, no extra caller, and a usable subsequent request. This is activity recreation, not process-death or signed-in Create acceptance.
4. `realSystemPickerSelectionPersistsGrantAndAcknowledgesExactReceipt`: insert one UUID-owned synthetic JPEG, select it through the actual OS picker, validate repeated ready bytes/receipt and red/blue pixels, require one real persisted picker-URI read grant and open that returned URI, reject a wrong receipt, then acknowledge exactly and confirm grant/image cleanup. Delete only that inserted MediaStore row in `finally`. No new media permission, fake result Intent, injected grants/decoder, or account is used.

The fourth test requires a fresh emulator with no other picker media. Its default OS resource entries are `picker_tab_recyclerview`, `icon_thumbnail`, and `button_add`, scoped to the dynamically resolved picker package. These are implementation selectors, not an Android API. If the installed picker differs, inspect the failure hierarchy and explicitly supply verified resource entries through instrumentation arguments `qrguitarPickerGridId`, `qrguitarPickerThumbnailId`, and `qrguitarPickerAddId` (Gradle `-Pandroid.testInstrumentationRunnerArguments.<name>=<entry>`). Only simple resource entry names are accepted. A Compose picker without exposed equivalent resource IDs needs an explicit reviewed selector adaptation; the test fails instead of guessing coordinates, skipping, or synthesizing a result. The fixture/indexing, OS UI and persisted-grant behavior remain unconfirmed until emulator execution.

The tests use the actual application package/store/Keystore. They temporarily normalize `always_finish_activities` to zero and restore its previous value in teardown. They do not fabricate picker result Intents, replace crypto keys, or inject an authentication bypass. Direct `Activity.recreate()` avoids ActivityScenario's forced-resume behavior and avoids assuming a partial-height picker stops its caller.

Collect JUnit XML recursively from `apps/mobile/android/app/build/outputs/androidTest-results/connected/**/TEST-*.xml` (AGP may place device directories below `connected/debug`). The corresponding HTML report is under `apps/mobile/android/app/build/reports/androidTests/connected`. Preserve bounded logcat tagged `QRGInstalledAcceptance`, actual app crash diagnostics, and APK hashes. Teardown emits the fixture-only UI hierarchy to that tag with a 23,000-byte total payload cap and at most 2,900 payload characters per chunk, so a failed selector can be inspected without an artifact upload. This logging requires the installed APK to be test-only and have INTERNET denied. Local screenshots/XML also remain under the target app's external-files `installed-acceptance` directory but disappear with the disposable emulator unless separately collected. A secure native window may yield a blank screenshot; lifecycle and exact durable status assertions are the test evidence.

These four tests are separate from the library's ten device store tests. Reject missing XML, fewer than four app tests, failures, errors, or skipped app tests. Once passed, the fourth test establishes successful native selection and URI retention only on the recorded image. It does not establish draft acknowledgement through signed-in JavaScript, account switching, full process death, or broad device support. Releasing a persisted grant also does not imply all temporary read access disappears immediately; the test does not make that assertion.

After both ordinary suites pass, the same disposable emulator runs the separate [durable-ready process-death gate](READY_PROCESS_DEATH.md). Its host verifies the exact offline APK, synthetic checkpoint, PID/UID/start time, abrupt process death and successful recovery with preserved native ciphertext/real URI access and acknowledgement cleanup. The killed staging phase is never counted as a passing test. A successful run requires both the native recovery certificate and the successful recovery instrumentation result, plus the independent host death witness. This proves the ready checkpoint survives that kill/restart sequence; instrumentation death also triggers Android package-stop handling, so it does not establish restoration of a still-pending picker callback.

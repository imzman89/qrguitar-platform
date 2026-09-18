# Installed app acceptance overlay

This is an acceptance-only offline debug APK overlay, not a production/release build. It does not contain working account credentials. Do not distribute the resulting APK to consumers.

After Expo generates `apps/mobile/android`, run from repository root:

```sh
node --test apps/mobile/scripts/android-instrumentation/test-prepare.mjs
node apps/mobile/scripts/prepare-installed-test.mjs
```

`--check` validates inputs without writing. The script changes only generated `android/app/build.gradle`, `MainApplication.kt`, the debug manifest, and the single owned app-target androidTest file. It embeds JavaScript/Hermes in debug, disables developer-server startup, adds the app test runner/dependencies, removes INTERNET permission, marks the APK `android:testOnly=true`, and adds test-only visibility for the OS photo-picker intent. Existing signing configuration is retained. Unexpected app identity/configuration or unrelated destination tests fail before writing.

Repeat the existing public CI fixture environment during Gradle bundling. Do not load production secrets, sign in, start Metro, or rely on the separate runtime export to supply the APK's bundle. Before installing, verify the actual APK has `assets/index.android.bundle`, lacks INTERNET permission, and is marked test-only. The test-only APK requires installation with test-app support (`-t`), which the connected instrumentation install provides.

From `apps/mobile/android`, expected tasks are:

```sh
./gradlew :app:assembleDebug :app:assembleDebugAndroidTest
./gradlew :app:connectedDebugAndroidTest
```

Keep the CI workflow's existing SDK/NDK, architecture, worker, and download guards on those commands. A fresh API 35 `google_apis` x86_64 emulator is the current target. This folder does not manage the emulator or install a toolchain.

Expected installed app suite: `com.qrguitar.acceptance.InstalledAcceptanceTest`, exactly three tests, all passing with zero skips:

1. `embeddedBundleLaunchesOfflineAndNavigationWorks`: actual Browse UI from the embedded bundle, expected offline Catalog error, signed-out collection/Login, manual QR screen, and background/foreground. No credentials submitted or camera permission granted.
2. `realSystemPickerCancellationRetiresOnlyItsRequest`: native target-process entry launches the actual non-exported Activity and OS picker, system Back delivers cancellation to the exact prepared request, and another request remains untouched.
3. `realSystemCancellationSurvivesRequestActivityRecreation`: while the real OS picker is visible, directly recreate its request Activity. Observe old instance destruction, saved state, a distinct restored instance, genuine Back cancellation, no extra caller, and a usable subsequent request. This is activity recreation, not process-death or signed-in Create acceptance.

The tests use the actual application package/store/Keystore. They temporarily normalize `always_finish_activities` to zero and restore its previous value in teardown. They do not fabricate picker result Intents, replace crypto keys, or inject an authentication bypass. Direct `Activity.recreate()` avoids ActivityScenario's forced-resume behavior and avoids assuming a partial-height picker stops its caller.

Collect JUnit XML recursively from `apps/mobile/android/app/build/outputs/androidTest-results/connected/**/TEST-*.xml` (AGP may place device directories below `connected/debug`). The corresponding HTML report is under `apps/mobile/android/app/build/reports/androidTests/connected`. Preserve bounded logcat tagged `QRGInstalledAcceptance`, actual app crash diagnostics, APK hashes, and files under the target app's external-files `installed-acceptance` directory. A secure native window may yield a blank screenshot; lifecycle and exact durable status assertions are the test evidence.

These three tests are separate from the library's ten device store tests. Reject missing XML, fewer than three app tests, failures, errors, or skipped app tests. Successful execution does not establish successful media selection/URI grants, draft acknowledgement through signed-in JavaScript, account switching, full process death, or broad device support.

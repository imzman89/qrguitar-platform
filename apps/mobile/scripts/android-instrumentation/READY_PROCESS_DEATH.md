# Durable-ready process-death gate

Candidate implementation: this helper and protocol have not yet been compiled or executed on an emulator. No process-death acceptance is claimed from source inspection or host-controller tests.

`ReadyProcessDeathAcceptanceTest.java` is a two-phase helper for the disposable offline API 35 emulator. It must be copied into the generated app's `androidTest` source set with the same ownership guard as `InstalledAcceptanceTest.java`. It requires no additional dependency, manifest permission, account, exported component, native implementation change or separate controller APK.

This helper is not part of the ordinary connected suite. Scope the generated **app** Gradle configuration to:

```groovy
defaultConfig {
    testInstrumentationRunnerArguments class: 'com.qrguitar.acceptance.InstalledAcceptanceTest'
}
```

Keep the library's runner arguments untouched. Update the preparation script's exact source allowlist and tests to include this helper. Do not silently replace the ordinary four-test gate with a filter selecting only these phases.

The external host controller invokes the installed app test runner directly, with no reinstall, data reset or permission manipulation between phases:

```text
-e class com.qrguitar.acceptance.ReadyProcessDeathAcceptanceTest#stageReadyResult
-e qrguitarRecoveryPhase stage
-e qrguitarRecoveryScenario <fresh lowercase canonical UUID>

-e class com.qrguitar.acceptance.ReadyProcessDeathAcceptanceTest#recoverReadyResult
-e qrguitarRecoveryPhase recover
-e qrguitarRecoveryScenario <same UUID>
```

Use `adb shell am instrument -w -r` with the actual installed `com.qrguitar.app.test/androidx.test.runner.AndroidJUnitRunner` component. Named picker-resource arguments from the ordinary test are also understood if a verified UI adaptation was required. The stage uses the real OS picker, no injected callback, and no direct permission grant. It is intentionally killed by the host after a checkpoint; a normal stage return is a failure, and the killed stage must not be counted as a completed passing JUnit test.

## Private protocol

Relative to `run-as com.qrguitar.app`'s app-data directory, the only markers are:

```text
no_backup/qrguitar-ready-death/<scenario>/stage.json
no_backup/qrguitar-ready-death/<scenario>/recovery.json
```

Both are bounded, AtomicFile-written JSON. The native production journal/photos remain encrypted in their existing no-backup directory. Marker content contains only synthetic fixture identities and hashes, never image bytes or account credentials. The host must not print marker payloads or URI strings; persist only a safe proof projection.

`stage.json` fields:

- `protocol: 1`, `phase: "ready_waiting_for_kill"`, `scenario`, `packageName: "com.qrguitar.app"`.
- `pid`, `uid` as integers; `processStartTicks` as decimal string from `/proc/self/stat` field 22.
- `holdDeadlineElapsedRealtimeMs`: Android `SystemClock.elapsedRealtime()` milliseconds at checkpoint creation plus 60,000.
- `selectionId: "installed-ready-" + scenario`, UUID `resultId` and `photoId`.
- `sourceSha256`, `normalizedSha256`, `recordCiphertextSha256`, `imageCiphertextSha256`: lowercase 64-hex hashes.
- `fixtureUri`, `fixtureName: "qrguitar-ready-" + scenario + ".jpg"`, `selectedGrantUri`, `baselineGrants: [{uri, flags}]`.
- `readyRecordBytes` as positive integer and `callerCreated: 1`, `callerDestroyed: 1`.

The stage first proves one real selection/ready receipt, repeatable bytes, a new persisted read grant and readable picker URI identifying the synthetic source. The marker is written only afterwards. The stage then holds for at most 60 seconds; its method deadline is 150 seconds. On ordinary failure/timeout it changes any written marker phase to `stage_aborted` and cleans only its owned request and media row. SIGKILL prevents that cleanup, preserving the ready state for recovery.

The host must validate the exact marker/scenario, offline test-only app and emulator, live PID UID/start ticks/cmdline, and enough remaining hold time before signalling that exact PID using the debuggable app's `run-as` UID. Record an independent witness that the original process identity disappeared and staging instrumentation terminated. A marker, a changed PID, a successful recovery method, or the adb exit code alone is insufficient evidence that the host executed this sequence. Never use a broad process kill or substitute a new PID if the recorded process has already gone.

`recovery.json` fields:

- `protocol: 1`, `phase: "verified_acknowledged"`, `scenario`, `packageName`, `uid`.
- `oldPid`, new `pid`, `oldProcessStartTicks`, new `processStartTicks`; both process identifiers must change.
- `stageSha256`, the SHA-256 of the exact `stage.json` bytes consumed by recovery.
- Unchanged `selectionId`, `resultId`, `photoId`, `normalizedSha256`, `sourceSha256`.
- All true: `readyCiphertextPreserved`, `realGrantReopened`, `acknowledgementRepeated`, `grantReleased`, `encryptedPhotoDeleted`, `fixtureDeleted`, `nativeTombstoneRetained`.

Recovery has a 60-second method deadline. It requires the same native ciphertext, receipt, photo bytes and actual persisted grant under a new process/default store; then it acknowledges twice, verifies grant/encrypted-image cleanup and retained compact tombstone, and deletes exactly the synthetic MediaStore URI/name. Only after those assertions is the recovery certificate written. The host must also require successful recovery instrumentation results, because a failure during final teardown must invalidate the scenario even if a certificate exists. Android's `am instrument` may return a zero shell exit code for an instrumentation failure; inspect its structured result/test status rather than trusting that exit code.

Store safe host evidence as one separate process-death scenario result, alongside the ordinary four installed tests and ten library device tests. Preserve the intentional stage termination distinctly. Read proof markers before destroying the disposable AVD. On failure, never emit fixture URI/image payloads, accept a partially completed sequence, or claim signed-in acceptance.

## Interpretation and remaining boundary

Once successfully executed, this gate would establish native ready-result ciphertext, Keystore-backed readability and real persisted picker-grant survival across an abruptly killed app process, followed by exact acknowledgement cleanup. Android 15's ActivityManager also finishes instrumentation and normally force-stops its target after instrumentation process death. Consequently this gate must not be described as natural low-memory restoration of an outstanding Activity result. [AOSP Android 15 ActivityManagerService](https://android.googlesource.com/platform/frameworks/base/+/refs/tags/android-15.0.0_r1/services/core/java/com/android/server/am/ActivityManagerService.java)

For death **while the OS picker is still open**, keep the target app uninstrumented when it is killed. An external controller is required, but a new APK is optional: host adb with observed UI hierarchy can control the picker, or the independent library test APK can provide UiAutomator control. A narrowly scoped debug-only bridge would prepare a synthetic request and report lifecycle/status evidence while the target runs normally. That separate scenario must show saved/stopped caller state, the same pending picker task, target death, a new process/restored caller, and a genuinely delivered successful result after the kill. Starting fresh app-target instrumentation, relaunching a new picker, fabricating RESULT_OK, or replacing native bytes would invalidate that proof.

Neither gate establishes account/draft isolation through signed-in JavaScript, server upload/save, physical devices, Android document fallback, iOS or death before the first durable native receipt. Those remain separate acceptance requirements.

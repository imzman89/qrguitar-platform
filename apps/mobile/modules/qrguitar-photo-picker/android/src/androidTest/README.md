# Android platform store acceptance

`SelectionStoreInstrumentedTest` contains 10 tests for a fresh library test APK on an Android emulator/device. They use the actual default Android Keystore key, platform AtomicFile, AES-GCM, ContentResolver, bitmap decoder, EXIF orientation and JPEG encoder. No account, signing service, external service, credentials or real photos are used.

Run from the generated `apps/mobile/android` project with one emulator and one instrumentation shard:

```sh
./gradlew :qrguitar-photo-picker:connectedDebugAndroidTest --no-daemon --console=plain
```

Use the module name printed by Expo autolinking if it differs. The generated project requires its installed Expo/RN Android toolchain, compile SDK 36, a compatible JDK, and a running emulator (API 35 or 36 for CI; the module minimum is API 24). Dependency downloads and emulator provisioning belong to the surrounding bounded build workflow. Run in a fresh disposable emulator/library test APK; do not point this task at an installed consumer application's instrumentation target, reuse its key, or enable parallel shards sharing the same app UID.

The test APK is explicitly test-only. Setup verifies the library test package, process UID and absence of the store's fixed key alias before taking ownership of that alias. A preexisting key causes failure without deletion. Teardown closes store executors, removes only the owned alias, and validates each UUID sandbox's canonical parent before deleting synthetic files. Each test has a 30-second method deadline, image processing waits at most 15 seconds, and each store shutdown has bounded executor waits. A workflow timeout must still bound build/emulator failures.

Coverage:

- Stable ready photo/result IDs and repeatable reads after store reopen, exact/idempotent acknowledgement, compact retained tombstone and encrypted asset deletion.
- Durable discard preventing replay/late capture, with real encrypted records.
- Nonexportable real Android Keystore key, no plaintext URI/JPEG/private metadata in journal files, and failures for absent/replaced keys or altered ciphertext without replacing/erasing records.
- Actual AtomicFile recovery from an unfinished overwrite and actual encrypted terminal cleanup retried after store reopen.
- Synthetic JPEG decode, EXIF rotation and removal of location/private EXIF metadata, large-side sampling and rejection when encoded bytes exceed the remaining draft budget.

Only URI-grant bookkeeping is injected. A private test-only ContentProvider serves synthetic JPEGs and does not grant persistable system-picker permissions. The suite does not establish actual picker selection/cancellation, URI-grant persistence after real process death, Activity callback delivery, account/draft integration, real camera/media formats, physical-device behavior, or hardware-backed Keystore availability. Reopening a store and leaving an unfinished AtomicFile write are deliberate simulations, not evidence that an Android process was killed. These remaining acceptance cases need separate lifecycle/device coverage. Results are unconfirmed until the connected test run reports success.

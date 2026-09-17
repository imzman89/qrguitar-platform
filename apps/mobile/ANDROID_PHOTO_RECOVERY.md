# Android photo selection recovery

This change is a local, actor-bound recovery path for Expo SDK 57 ImagePicker. It has not been accepted on a real Android device. It does not enable native release or change signing, dependencies, uploads, or Profile creation.

Before Android opens the photo picker, the app saves the current draft and an encrypted selection intent containing the authenticated account, draft upload/create identities, selection ID, and existing photo IDs. Recovery uses that original binding. Applying photos and recording the selection receipt is one encrypted draft write; replay cannot append the same photos twice. Recovery never uploads or creates a Profile.

The app checks pending results on Create restoration and foregrounding. It saves dirty editable fields before foreground recovery, choosing photos again, or confirmed pending-selection discard. A pending selection can only append to its original editable draft; it cannot modify a frozen or uncertain create attempt.

Known completed results are checkpointed. If an asset cannot be converted, the app stores a terminal receipt without the invalid image bytes, allowing the original account to deliberately discard that selection. Discard keeps the saved draft and its create attempt. Temporary storage/authentication errors preserve recoverable state. A failure after native result consumption but before durable checkpoint can still lose that result if the process is killed; an in-memory checkpoint supports retries while the process survives.

Already checkpointed foreign selections move into encrypted account-scoped quarantine before another account can select photos. The original account can later restore or explicitly discard its selection. Archive write failure keeps the global selection and blocks a new launch.

## Anonymous native result limit

Expo's Android pending result does not identify its original caller or selection. A null read means only that the slot is empty at that moment: a callback can arrive later. The app therefore retains an unresolved intent after null recovery or null discard, and refuses to replace it. Another account cannot consume it, discard it, or start a replacement selection. The UI explains that the original account must resolve the earlier picker.

A concrete canceled/error/result response, a terminal receipt, or checkpointed photos can resolve a selection. Expo's activity-destruction fallback stores successful results only. A canceled or lost selection after activity/process death can consequently remain blocked with an unresolved intent. Returning to the system picker or restarting the app/device may be necessary to finish platform work, but a restart is not proof of completion and does not authorize deleting that intent. There is no automatic timeout or unsafe "clear everything" workaround. Complete recovery across those cases requires request-identified native recovery/cancellation and remains separate work.

Reference: [Expo SDK 57 ImagePicker](https://docs.expo.dev/versions/v57.0.0/sdk/imagepicker/) and [SDK 57 Android implementation](https://github.com/expo/expo/blob/sdk-57/packages/expo-image-picker/android/src/main/java/expo/modules/imagepicker/ImagePickerModule.kt).

## Local verification

Run from `apps/mobile`:

```sh
node --test scripts/test-native-core.mjs
node --test scripts/test-native-ui.mjs
npm run typecheck
npm run lint
```

The core suite executes the actual picker coordinator and draft persistence controller against injected native/auth/storage boundaries. The React UI suite executes the actual Create screen with bridge/controller fixtures. It is not an Android lifecycle emulator.

Required device acceptance before native release:

1. Enable Android's **Don't keep activities** and select multiple photos. Confirm only the original draft receives them once after restoration; confirm no upload or Profile request happens until explicit Create.
2. Repeat normal selection, cancellation, background/foreground, and full process death separately. Record whether the installed ImagePicker returns success, canceled, error, or null. Confirm unresolved null never permits a replacement intent.
3. Test logout/account switch around picker return. Confirm another account cannot see or attach the original photos; checkpointed photos remain recoverable by the original account.
4. Test storage failure before launch, during result checkpoint, and during receipt cleanup. Retry while the process survives, then repeat after restart; verify no duplicate photos or create attempts.
5. Test missing/unsupported/oversized assets and two images exceeding the combined 16 MiB draft limit. Explicitly discard only the pending selection; verify draft fields/photos and any uncertain create remain unchanged.
6. Edit a field and immediately foreground, choose photos, or confirm selection discard before the 600 ms autosave. Confirm the latest text persists.

Keep unresolved-selection limitations and actual device outcomes in the release record. Do not describe these local tests as complete cross-account activity-death recovery.

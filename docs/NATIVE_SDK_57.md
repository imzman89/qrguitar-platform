# Expo SDK 57 migration

The native workspace migrated incrementally from Expo SDK 51 to SDK 57, retaining the web app's direct React/React DOM 19.3 dependencies. The application entry is now `src/index.ts`, which calls `registerRootComponent`. Native projects are generated with Expo prebuild rather than committed.

| SDK stage | Expo | React Native | React |
| --- | --- | --- | --- |
| 52 | 52.0.49 | 0.76.9 | 18.3.1 |
| 53 | 53.0.27 | 0.79.6 | 19.0.0 |
| 54 | 54.0.37 | 0.81.5 | 19.1.0 |
| 55 | 55.0.31 | 0.83.10 | 19.2.0 |
| 56 | 56.0.21 | 0.85.3 | 19.2.3 |
| 57 | 57.0.21 | 0.86.3 | 19.2.3 |

Each stage used Expo's version recommendations and diagnostic checks. SDK 53/54 required aligning the recommended React types before npm could complete the React Native update; no peer-dependency bypass was used. Intermediate diagnostics exposed the original mixed native runtimes, and SDK 56's known Hermes regression. Final normal deduplication selects one React Native 0.86.3; SDK 57 resolves the Hermes regression. TypeScript 6.0.3 is scoped to mobile; the web workspace retains its own compiler contract.

Sources: [incremental upgrade guide](https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/), [SDK 52](https://expo.dev/changelog/2024-11-12-sdk-52), [SDK 53](https://expo.dev/changelog/sdk-53), [SDK 54](https://expo.dev/changelog/sdk-54), [SDK 55](https://expo.dev/changelog/sdk-55), [SDK 56](https://expo.dev/changelog/sdk-56), [SDK 57](https://expo.dev/changelog/sdk-57).

## Runtime resolution

The web and native apps require different React versions. Expo Doctor reports the two installed React/React DOM versions as a duplicate warning. Do not downgrade the web app or force web React into React Native to silence it. The app explicitly enables Expo's supported `autolinkingModuleResolution` behavior. Actual production bundle source maps are checked by `test:runtime-bundles`: Android/iOS contain only the mobile React and SDK-compatible React Native; Expo web contains only the mobile React and matching React DOM. This verifies bundle contents, not physical-device behavior. [Expo monorepos](https://docs.expo.dev/guides/monorepos/), [documented duplicate-resolution workaround](https://docs.expo.dev/modules/autolinking/#working-around-duplicates)

## Permissions and tools

Camera and photo-picker purpose strings explain the two intended operations. Neither plugin requests microphone access; Android explicitly blocks RECORD_AUDIO. SecureStore's default unused biometric purpose string is disabled, and iOS arbitrary transport loads are disabled. SystemUI supplies the configured dark appearance. `test:config` evaluates the real Expo plugins and checks these settings.

ESLint is real, uses the Expo flat configuration and rejects warnings. Run it directly through the mobile lint script; the workspace's web ESLint version differs. Avoid silently replacing the mobile lint dependency with the hoisted web version. [Expo ESLint configuration](https://docs.expo.dev/guides/using-eslint/)

## Narrow Xcode tooling compatibility override

The root manifest pins **only `xcode`'s `uuid` dependency to 11.1.1**. Xcode 3.0.1 has one UUID callsite, `require('uuid').v4()` with no options. UUID 11.1.1 supports this CommonJS API. Its changed timestamp/binary APIs are not used by Xcode. The override replaces the advisory-affected UUID 7 dependency without changing the Xcode parser/writer implementation. [Xcode source](https://github.com/apache/cordova-node-xcode/blob/3.0.1/lib/pbxProject.js), [UUID 11.1.1 API](https://github.com/uuidjs/uuid/tree/v11.1.1)

Eleven regression tests compare the original Xcode3.0.1/UUID7 project semantics against the replacement: unchanged output, parser/writer round-trip, 2,000 generated project IDs, collision retry, and source/resource/framework/group additions and removals. Portable tests retain SHA-256 snapshots of normalized original output. The complete project fixture comes from Apache Cordova Xcode3.0.1; its Apache2 license is included beside the fixture. These tests must be reviewed if Xcode or its UUID API changes.

The migration removes the old `image-size` dependency path by using SDK-matched Metro0.84. The upstream image-size2.0.2 advisory is not represented as fixed upstream. Preserve this distinction when reviewing future Metro upgrades.

## Validation and remaining native acceptance

From the repository root:

```sh
npm ci
npm run typecheck
npm --workspace apps/mobile run lint
npm --workspace apps/mobile test
npm audit
npm --workspace apps/web run build
```

Set the public Supabase URL and publishable (or legacy anon) key as process environment variables, following `apps/mobile/.env.example`. Production export scripts reject missing configuration and private server keys, disable implicit dotenv loading, and restrict API origins. The API client normalizes production calls to `https://www.qrguitar.com`, because the apex domain redirects there; authenticated requests continue to reject redirects.

From `apps/mobile`:

```sh
npx expo install --check
npx expo-doctor
npm run export:all -- --source-maps
npm run test:runtime-bundles
npx expo prebuild --platform android --no-install
```

Use a macOS/Xcode host for iOS project generation and an actual iOS build:

```sh
npx expo prebuild --platform ios --no-install
npm run ios
```

This Windows migration host successfully generated the Android project and produced Android/iOS Hermes bundles plus the Expo web bundle. It has no Java/Android SDK/device tools; its Expo CLI explicitly refuses iOS prebuild, and WSL/Docker are unavailable. Native binary compilation, signing and physical Android/iOS acceptance remain pending. No EAS builds, store publication, native production sign-in or paid service calls were performed.

Before shipping native binaries, verify camera permissions/denial/recovery and scanning on physical devices, chosen-image handling, encrypted persistence and restart recovery, deep links/cold launch/background transitions, sign-in/sign-out/account switch, upload retry, and public/private profile boundaries. Browser QA and mocked tests support these checks; they do not substitute for native acceptance.

## Implemented native journeys

The app now uses real public/owner API reads, account sessions, QR parsing, photo selection, encrypted partial drafts and idempotent creation. It provides Catalog search, manual ID entry, a permission-aware scanner, instrument details and galleries, private owner views, explicit visibility choices, confirmation-only registration handling, and clear connection/retry states. Service, transfer, editing and QR printing actions open the existing web workspace, with a separate browser sign-in when required.

Private content is obscured while the app is inactive without unmounting photo selection or unsaved forms. Private galleries close in the background; account changes retire prior session operations. Draft creation, discard and navigation use one serialized queue, and ambiguous creation outcomes retain their exact identity and payload. Large files use the shared signed Storage protocol instead of base64 requests through Vercel.

The native test command runs 133 executable checks: 52 core/session/storage/API/draft cases, 28 real React screen interaction cases with native bridges mocked, 6 additional scanner lifecycle cases, 28 QR-input cases, 8 export-environment cases and 11 Xcode UUID compatibility cases. Native plugin configuration and shipped-runtime inspection are separate structural checks. None represents a signed binary or physical-device acceptance result.

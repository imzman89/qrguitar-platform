#!/usr/bin/env bash
set -euo pipefail

# This helper owns only a fresh hosted runner's disposable AVD. Never use a
# developer's connected phone, real account, production configuration or key.
[[ "${GITHUB_ACTIONS:-}" == true && "${RUNNER_ENVIRONMENT:-}" == github-hosted && "${RUNNER_OS:-}" == Linux ]] || {
  echo 'Android acceptance requires a disposable GitHub-hosted Linux runner.' >&2
  exit 1
}
: "${ANDROID_HOME:?}" "${RUNNER_TEMP:?}" "${GITHUB_WORKSPACE:?}"
sdkmanager="$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager"
avdmanager="$ANDROID_HOME/cmdline-tools/latest/bin/avdmanager"
adb="$ANDROID_HOME/platform-tools/adb"
export ANDROID_AVD_HOME="$RUNNER_TEMP/qrguitar-acceptance-avd"
export ANDROID_SERIAL=emulator-5554
image='system-images;android-35;google_apis;x86_64'

case "${1:-}" in
  provision)
    # Standard runners include several multi-GB NDKs. Keep the exact NDK used
    # above; uninstall only these unused versions from this disposable runner.
    for unused_ndk in '28.2.13676358' '29.0.14206865'; do
      if [[ -d "$ANDROID_HOME/ndk/$unused_ndk" ]]; then
        timeout 120 "$sdkmanager" --uninstall "ndk;$unused_ndk" < /dev/null
      fi
    done
    test -d "$ANDROID_HOME/ndk/27.3.13750724"
    # The runner already accepts Android SDK licenses. Refuse new prompts;
    # never pipe yes into a license command or purchase a device service.
    timeout 300 "$sdkmanager" --install 'emulator' "$image" 'cmake;3.22.1' < /dev/null
    test -x "$ANDROID_HOME/emulator/emulator"
    test -d "$ANDROID_HOME/system-images/android-35/google_apis/x86_64"
    test -x "$ANDROID_HOME/cmake/3.22.1/bin/cmake"
    test -e /dev/kvm
    # Grant only this runner user access to its local hardware accelerator.
    sudo setfacl -m "u:$(id -un):rw" /dev/kvm
    "$ANDROID_HOME/emulator/emulator" -accel-check
    mkdir -p "$ANDROID_AVD_HOME"
    printf 'no\n' | "$avdmanager" create avd --name qrguitar-acceptance --package "$image" --abi google_apis/x86_64
    # API 35 defaults to a 6-GiB data image; this fixture needs only a few APKs.
    python3 - <<'PY'
import os
from pathlib import Path
config = Path(os.environ['ANDROID_AVD_HOME']) / 'qrguitar-acceptance.avd/config.ini'
lines = config.read_text().splitlines()
values = dict(line.split('=', 1) for line in lines if '=' in line)
values['disk.dataPartition.size'] = '3G'
config.write_text('\n'.join(f'{key}={value}' for key, value in values.items()) + '\n')
PY
    df -h "$ANDROID_AVD_HOME"
    ;;
  test)
    emulator_pid=''
    cleanup() {
      result=$?
      trap - EXIT
      timeout 10 "$adb" -s "$ANDROID_SERIAL" logcat -d 'QRGInstalledAcceptance:I' '*:S' | tail -n 500 || true
      if [[ "$result" -ne 0 ]]; then
        tail -n 120 "$RUNNER_TEMP/qrguitar-emulator.log" || true
        timeout 10 "$adb" -s "$ANDROID_SERIAL" logcat -d -b crash -t 200 || true
      fi
      timeout 10 "$adb" -s "$ANDROID_SERIAL" emu kill >/dev/null 2>&1 || true
      if [[ -n "$emulator_pid" ]]; then kill "$emulator_pid" 2>/dev/null || true; fi
      exit "$result"
    }
    trap cleanup EXIT
    available_kb=$(df --output=avail "$ANDROID_AVD_HOME" | tail -n 1 | tr -d ' ')
    [[ "$available_kb" -ge 5242880 ]] || { echo 'Insufficient free disk for bounded emulator acceptance (need 5 GiB).' >&2; exit 1; }
    "$adb" start-server
    "$ANDROID_HOME/emulator/emulator" -avd qrguitar-acceptance -port 5554 \
      -no-window -no-audio -no-boot-anim -no-snapshot -wipe-data \
      -gpu swiftshader_indirect -accel on -memory 2048 -cores 2 \
      > "$RUNNER_TEMP/qrguitar-emulator.log" 2>&1 &
    emulator_pid=$!
    # Fail promptly if the emulator exits, instead of waiting for an absent ADB device.
    connected=false
    for attempt in $(seq 1 90); do
      kill -0 "$emulator_pid"
      if [[ "$(timeout 5 "$adb" -s "$ANDROID_SERIAL" get-state 2>/dev/null || true)" == device ]]; then
        connected=true
        break
      fi
      sleep 2
    done
    [[ "$connected" == true ]] || { echo 'Emulator connection deadline exceeded.' >&2; exit 1; }
    booted=false
    for attempt in $(seq 1 90); do
      kill -0 "$emulator_pid"
      if [[ "$(timeout 10 "$adb" -s "$ANDROID_SERIAL" shell getprop sys.boot_completed | tr -d '\r')" == 1 ]]; then
        booted=true
        break
      fi
      sleep 2
    done
    [[ "$booted" == true ]] || { echo 'Emulator boot deadline exceeded.' >&2; exit 1; }
    "$adb" -s "$ANDROID_SERIAL" shell input keyevent 82
    "$adb" -s "$ANDROID_SERIAL" shell settings put global window_animation_scale 0
    "$adb" -s "$ANDROID_SERIAL" shell settings put global transition_animation_scale 0
    "$adb" -s "$ANDROID_SERIAL" shell settings put global animator_duration_scale 0
    "$adb" -s "$ANDROID_SERIAL" shell getprop ro.build.version.sdk
    cd "$GITHUB_WORKSPACE/apps/mobile/android"
    timeout 600 ./gradlew :qrguitar-photo-picker:connectedDebugAndroidTest :app:connectedDebugAndroidTest \
      --continue --no-daemon --max-workers=2 -I /tmp/qrguitar-installed-ndk.gradle \
      -Pandroid.builder.sdkDownload=false -PreactNativeArchitectures=x86_64 --stacktrace
    ;;
  *) echo 'Expected provision or test.' >&2; exit 2 ;;
esac

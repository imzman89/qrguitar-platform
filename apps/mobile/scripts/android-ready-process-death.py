#!/usr/bin/env python3
"""Host-only CI acceptance. Never use with a developer device or a consumer APK.

The interrupted staging instrumentation is deliberately NOT a passing test. This
proves a ready journal survives SIGKILL and a new instrumentation process; it does
not prove natural pending-picker callback restoration (Android may force-stop an
instrumented process after its death). No app data or URI grants are reset.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import time
import uuid

APP = "com.qrguitar.app"
TEST_APP = APP + ".test"
COMPONENT = TEST_APP + "/androidx.test.runner.AndroidJUnitRunner"
TEST_CLASS = "com.qrguitar.acceptance.ReadyProcessDeathAcceptanceTest"
SERIAL = "emulator-5554"
MAX_OUTPUT = 1024 * 1024
LIMITATION = ("Ready-journal and selected-URI grant durability across an explicit "
              "SIGKILL/restart only. Instrumentation death can cause Android to "
              "force-stop the target. Not natural pending-callback restoration.")


class GuardError(Exception):
    """Messages are fixed diagnostic codes, never provider output."""


def require(condition, code):
    if not condition:
        raise GuardError(code)


def canonical_uuid(value):
    require(isinstance(value, str), "invalid-scenario")
    try:
        valid = str(uuid.UUID(value)) == value
    except ValueError:
        valid = False
    require(valid, "invalid-scenario")
    return value


def integer(value, minimum=1, maximum=2**53 - 1):
    require(type(value) is int and minimum <= value <= maximum, "invalid-integer")
    return value


def decimal(value):
    require(isinstance(value, str) and re.fullmatch(r"[1-9][0-9]{0,19}", value), "invalid-ticks")
    return value


def json_object(raw):
    require(len(raw) <= 32768, "certificate-too-large")
    def unique(pairs):
        result = {}
        for key, value in pairs:
            require(key not in result, "duplicate-certificate-key")
            result[key] = value
        return result
    try:
        value = json.loads(raw, object_pairs_hook=unique)
    except (ValueError, UnicodeDecodeError) as exc:
        raise GuardError("invalid-certificate-json") from exc
    require(type(value) is dict, "invalid-certificate-object")
    return value


def process_identity(stat, status, cmdline):
    try:
        text = stat.decode("ascii").strip()
        match = re.fullmatch(r"([1-9][0-9]*) \((.*)\) (.+)", text)
        require(match is not None, "invalid-process-stat")
        fields = match[3].split()
        require(len(fields) >= 20 and fields[0] not in ("Z", "X", "x"), "process-not-live")
        starts = decimal(fields[19])
        uid_lines = re.findall(rb"^Uid:\s+([0-9]+)\s+([0-9]+)\s+([0-9]+)\s+([0-9]+)\s*$", status, re.M)
        require(len(uid_lines) == 1 and len(set(uid_lines[0])) == 1, "invalid-process-uid")
        parts = cmdline.split(b"\0")
        require(parts[0] == APP.encode() and all(not part for part in parts[1:]), "wrong-process-command")
        return {"pid": integer(int(match[1]), maximum=4194304),
                "uid": integer(int(uid_lines[0][0]), minimum=10000, maximum=19999),
                "processStartTicks": starts}
    except (UnicodeDecodeError, ValueError, IndexError) as exc:
        raise GuardError("invalid-process-identity") from exc


def identity_fields(value):
    return {"pid": integer(value.get("pid"), maximum=4194304),
            "uid": integer(value.get("uid"), minimum=10000, maximum=19999),
            "processStartTicks": decimal(value.get("processStartTicks"))}


def sha256(value):
    require(isinstance(value, str) and re.fullmatch(r"[a-f0-9]{64}", value), "invalid-sha256")
    return value


def validate_stage(value, scenario, uptime_ms, stage_sha256):
    require(value.get("protocol") == 1 and type(value.get("protocol")) is int, "wrong-stage-protocol")
    require(value.get("scenario") == canonical_uuid(scenario), "wrong-stage-scenario")
    require(value.get("phase") == "ready_waiting_for_kill" and value.get("packageName") == APP, "wrong-stage-binding")
    identity = identity_fields(value)
    deadline = integer(value.get("holdDeadlineElapsedRealtimeMs"))
    require(15000 <= deadline - uptime_ms <= 60000, "stage-hold-deadline")
    require(value.get("selectionId") == "installed-ready-" + scenario, "wrong-selection-id")
    require(type(value.get("callerCreated")) is int and value["callerCreated"] == 1 and
            type(value.get("callerDestroyed")) is int and value["callerDestroyed"] == 1, "stage-caller-not-finished")
    require(type(value.get("baselineGrants")) is list, "invalid-baseline-grants")
    return {"protocol": 1, "scenario": scenario, "phase": value["phase"],
            "packageName": APP, **identity, "holdDeadlineElapsedRealtimeMs": deadline,
            "selectionId": value["selectionId"], "resultId": canonical_uuid(value.get("resultId")),
            "photoId": canonical_uuid(value.get("photoId")),
            "sourceSha256": sha256(value.get("sourceSha256")),
            "normalizedSha256": sha256(value.get("normalizedSha256")),
            "stageSha256": sha256(stage_sha256)}


def validate_recovery(value, scenario, stage):
    require(type(value.get("protocol")) is int and value["protocol"] == 1, "wrong-recovery-protocol")
    require(value.get("scenario") == canonical_uuid(scenario) and value.get("packageName") == APP,
            "wrong-recovery-binding")
    require(value.get("phase") == "verified_acknowledged", "recovery-not-confirmed")
    identity = identity_fields(value)
    require(identity["uid"] == stage["uid"] and identity["pid"] != stage["pid"] and
            identity["processStartTicks"] != stage["processStartTicks"],
            "recovery-not-new-process")
    require(value.get("oldPid") == stage["pid"] and
            value.get("oldProcessStartTicks") == stage["processStartTicks"], "wrong-recovery-original")
    for key in ("stageSha256", "selectionId", "resultId", "photoId", "normalizedSha256", "sourceSha256"):
        require(value.get(key) == stage[key], "recovery-receipt-changed")
    proofs = ("readyCiphertextPreserved", "realGrantReopened", "acknowledgementRepeated", "grantReleased",
              "encryptedPhotoDeleted", "fixtureDeleted", "nativeTombstoneRetained")
    for proof in proofs:
        require(value.get(proof) is True, "recovery-proof-missing")
    return {"protocol": 1, "scenario": scenario, "phase": value["phase"], "packageName": APP,
            **identity, "oldPid": stage["pid"], "oldProcessStartTicks": stage["processStartTicks"],
            "stageSha256": stage["stageSha256"], **{key: True for key in proofs}}


def instrumentation_ok(raw):
    require(len(raw) <= MAX_OUTPUT, "instrumentation-output-too-large")
    text = raw.decode("utf8", errors="replace").replace("\r", "")
    require(len(re.findall(r"^OK \(1 test\)$", text, re.M)) == 1, "instrumentation-not-one-pass")
    require(re.search(r"^INSTRUMENTATION_CODE: -1$", text, re.M), "instrumentation-no-success-code")
    require(not re.search(r"FAILURES!!!|INSTRUMENTATION_FAILED|INSTRUMENTATION_ABORTED|shortMsg=|^INSTRUMENTATION_STATUS_CODE: -[1-9]", text, re.M),
            "instrumentation-failed")


def kill_script(identity):
    """Only validated integers enter the remote shell; recheck the live identity there."""
    pid, uid, ticks = identity["pid"], identity["uid"], identity["processStartTicks"]
    integer(pid, maximum=4194304); integer(uid, minimum=10000, maximum=19999); decimal(ticks)
    return (f"set -eu; test \"$(id -u)\" = '{uid}'; "
            f"test \"$(cat /proc/{pid}/cmdline | tr '\\000' '\\n')\" = '{APP}'; "
            f"test \"$(sed -n 's/^Uid:[[:space:]]*//p' /proc/{pid}/status | xargs)\" = '{uid} {uid} {uid} {uid}'; "
            f"s=$(cat /proc/{pid}/stat); s=${{s##*) }}; set -- $s; "
            f"test \"${{20}}\" = '{ticks}'; test \"$1\" != Z; test \"$1\" != X; "
            f"kill -9 {pid}")


def guarded_environment(env, platform, script):
    require(platform == "linux" and env.get("GITHUB_ACTIONS") == "true" and
            env.get("RUNNER_ENVIRONMENT") == "github-hosted" and env.get("RUNNER_OS") == "Linux", "host-not-disposable-ci")
    require(env.get("ANDROID_SERIAL", SERIAL) == SERIAL, "wrong-device-serial")
    paths = []
    for name in ("GITHUB_WORKSPACE", "RUNNER_TEMP", "ANDROID_HOME"):
        raw = env.get(name, "")
        path = Path(raw)
        require(raw and path.is_absolute() and path.is_dir(), "missing-ci-directory")
        require(path.resolve() == path, "symlink-ci-directory")
        paths.append(path)
    workspace, temporary, sdk = paths
    require(script.resolve() == workspace / "apps/mobile/scripts/android-ready-process-death.py", "wrong-controller-checkout")
    require((sdk / "platform-tools/adb").is_file() and (sdk / "build-tools/36.0.0/aapt").is_file(), "missing-android-tools")
    return workspace, temporary, sdk


class Controller:
    def __init__(self, workspace, temporary, sdk):
        self.workspace, self.temporary = workspace, temporary
        self.adb = [str(sdk / "platform-tools/adb"), "-s", SERIAL]
        self.aapt = str(sdk / "build-tools/36.0.0/aapt")
        self.scenario = str(uuid.uuid4())
        self.report = {"protocol": 1, "scenario": self.scenario, "passed": False, "status": "running",
                       "scope": "durable_ready_sigkill_restart",
                       "phase": "setup", "limitation": LIMITATION, "stagingIsPassingTest": False,
                       "stagingInstrumentationTestsPassed": 0}
        self.report_path = temporary / "qrguitar-ready-death.json"
        self.report_file = self.report_path.open("x", encoding="utf8")
        self.stage_process = None

    def save(self):
        self.report_file.seek(0)
        json.dump(self.report, self.report_file, indent=2)
        self.report_file.truncate(); self.report_file.flush(); os.fsync(self.report_file.fileno())

    def command(self, args, timeout=15, optional=False):
        try:
            result = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout, check=False)
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise GuardError("command-unavailable-or-deadline") from exc
        require(len(result.stdout) <= MAX_OUTPUT and len(result.stderr) <= MAX_OUTPUT, "command-output-too-large")
        if not optional:
            require(result.returncode == 0, "command-failed")
        return result

    def shell(self, *args, **kwargs):
        return self.command(self.adb + ["shell", *args], **kwargs)

    def read(self, relative, optional=False):
        # Some adb exec-out versions report the transport command as successful
        # even when the remote `cat` runs before the AtomicFile target exists.
        # Fence the raw read with a shell-v2 existence check whose remote exit
        # status is reliable; an empty/missing certificate must never be parsed
        # or mistaken for durable evidence.
        present = self.shell("run-as", APP, "test", "-f", relative, optional=True)
        require(not present.stdout.strip() and not present.stderr.strip() and
                present.returncode in (0, 1), "certificate-presence-unreadable")
        if present.returncode == 1:
            if optional:
                return present
            raise GuardError("certificate-missing")
        result = self.command(self.adb + ["exec-out", "run-as", APP, "cat", relative])
        require(not result.stderr.strip(), "certificate-read-error")
        return result

    def uptime(self):
        raw = self.shell("cat", "/proc/uptime").stdout.decode().split()
        require(len(raw) == 2 and re.fullmatch(r"[0-9]+\.[0-9]+", raw[0]), "invalid-device-clock")
        return int(float(raw[0]) * 1000)

    def identity(self, pid):
        integer(pid, maximum=4194304)
        return process_identity(self.read(f"/proc/{pid}/stat").stdout,
                                self.read(f"/proc/{pid}/status").stdout,
                                self.read(f"/proc/{pid}/cmdline").stdout)

    def instrumentation(self, method, phase):
        require((method, phase) in (("stageReadyResult", "stage"), ("recoverReadyResult", "recover")), "invalid-instrumentation-phase")
        return self.adb + ["shell", "am", "instrument", "-w", "-r", "-e", "class", TEST_CLASS + "#" + method,
                           "-e", "qrguitarRecoveryPhase", phase, "-e", "qrguitarRecoveryScenario", self.scenario, COMPONENT]

    def installed_path(self, package):
        require(package in (APP, TEST_APP), "unexpected-package")
        result = self.shell("pm", "path", package, optional=True)
        require(not result.stderr.strip(), "installed-package-lookup-failed")
        if result.returncode != 0 and not result.stdout.strip():
            return None
        if result.returncode == 0 and not result.stdout.strip():
            return None
        text = result.stdout.decode().strip()
        require(result.returncode == 0 and re.fullmatch(r"package:/data/app/[A-Za-z0-9_=+./~\-]+/base\.apk", text), "unexpected-installed-apk")
        require(".." not in text and text.count("\n") == 0, "unsafe-installed-path")
        return text.removeprefix("package:")

    def verify_apks(self, allow_install):
        base = self.workspace / "apps/mobile/android/app/build/outputs/apk"
        pairs = ((APP, base / "debug/app-debug.apk"), (TEST_APP, base / "androidTest/debug/app-debug-androidTest.apk"))
        for package, apk in pairs:
            require(apk.is_file() and apk.resolve() == apk, "missing-or-unsafe-fixture-apk")
            badging = self.command([self.aapt, "dump", "badging", str(apk)]).stdout.decode()
            require(re.search(r"^package: name='" + re.escape(package) + r"' ", badging, re.M), "wrong-fixture-apk")
            if package == APP:
                permissions = self.command([self.aapt, "dump", "permissions", str(apk)]).stdout
                require(b"android.permission.INTERNET" not in permissions, "fixture-can-access-network")
                manifest = self.command([self.aapt, "dump", "xmltree", str(apk), "AndroidManifest.xml"]).stdout
                require(re.search(rb"android:testOnly[^\n]*0xffffffff", manifest), "fixture-not-test-only")
            with apk.open("rb") as source:
                digest = hashlib.file_digest(source, "sha256").hexdigest()
            installed = self.installed_path(package)
            if installed is None:
                require(allow_install, "fixture-disappeared-after-stage")
                self.command(self.adb + ["install", "-t", str(apk)], timeout=90)
                installed = self.installed_path(package)
                require(installed is not None, "fixture-install-unconfirmed")
            actual = self.shell("sha256sum", installed).stdout.decode().split()
            require(len(actual) == 2 and actual[0] == digest and actual[1] == installed, "installed-apk-does-not-match-fixture")
        instruments = self.shell("pm", "list", "instrumentation").stdout.decode().splitlines()
        require(instruments.count(f"instrumentation:{COMPONENT} (target={APP})") == 1, "wrong-instrumentation-component")

    def run(self):
        self.save()
        require(self.command(self.adb + ["get-state"]).stdout.strip() == b"device", "device-not-connected")
        require(self.shell("getprop", "ro.kernel.qemu").stdout.strip() == b"1", "device-not-emulator")
        require(self.shell("getprop", "ro.build.version.sdk").stdout.strip() == b"35", "wrong-emulator-api")
        require(self.command(self.adb + ["emu", "avd", "name"]).stdout.decode().strip().splitlines() == ["qrguitar-acceptance", "OK"], "wrong-emulator-avd")
        self.verify_apks(allow_install=True)
        relative = "no_backup/qrguitar-ready-death/" + self.scenario
        # Unique scenario must not already have a certificate before dispatch.
        existing = self.shell("run-as", APP, "test", "!", "-e", relative, optional=True)
        require(existing.returncode == 0, "scenario-already-exists")
        self.report["phase"] = "staging"; self.save()
        with tempfile.TemporaryFile() as stage_output:
            self.stage_process = subprocess.Popen(self.instrumentation("stageReadyResult", "stage"),
                                                  stdout=stage_output, stderr=subprocess.STDOUT)
            end = time.monotonic() + 90
            stage = None
            while time.monotonic() < end:
                require(self.stage_process.poll() is None, "staging-ended-before-kill")
                candidate = self.read(relative + "/stage.json", optional=True)
                if candidate.returncode == 0:
                    stage = validate_stage(json_object(candidate.stdout), self.scenario, self.uptime(),
                                           hashlib.sha256(candidate.stdout).hexdigest())
                    break
                time.sleep(0.5)
            require(stage is not None, "stage-certificate-deadline")
            require(self.identity(stage["pid"]) == identity_fields(stage), "stage-process-identity-changed")
            # Revalidate the holding window immediately before a shell-side identity check + SIGKILL.
            require(stage["holdDeadlineElapsedRealtimeMs"] - self.uptime() >= 15000, "stage-hold-deadline")
            self.report.update(phase="kill-dispatch", stage=stage); self.save()
            require(self.stage_process.poll() is None, "staging-ended-before-kill")
            script = kill_script(identity_fields(stage))
            # ADB's remote shell needs one quoted script argument; this script has no external strings.
            self.shell("run-as", APP, "sh", "-c", "'" + script.replace("'", "'\\''") + "'", timeout=10)
            end = time.monotonic() + 20
            gone = False
            while time.monotonic() < end:
                present = self.shell("run-as", APP, "test", "-e", f"/proc/{stage['pid']}", optional=True)
                require(not present.stderr.strip(), "process-absence-unreadable")
                if present.returncode == 1:
                    gone = True; break
                require(present.returncode == 0, "process-absence-unreadable")
                try:
                    current = self.identity(stage["pid"])
                except GuardError:
                    time.sleep(0.2); continue
                require(current == identity_fields(stage), "pid-reused-after-kill")
                time.sleep(0.2)
            require(gone, "original-process-not-proved-gone")
            try:
                self.stage_process.wait(timeout=20)
            except subprocess.TimeoutExpired as exc:
                raise GuardError("staging-instrumentation-did-not-terminate") from exc
            stage_output.seek(0)
            staged_stdout = stage_output.read(MAX_OUTPUT + 1)
            require(len(staged_stdout) <= MAX_OUTPUT and b"OK (1 test)" not in staged_stdout, "staging-unexpected-pass")
            self.report.update(phase="recovering", killSignal="SIGKILL", originalProcessGone=True,
                               stagingInstrumentationTerminated=True, stagingReturnCode=self.stage_process.returncode)
            self.save()
        self.verify_apks(allow_install=False)
        outcome = self.command(self.instrumentation("recoverReadyResult", "recover"), timeout=90)
        instrumentation_ok(outcome.stdout)
        recovered = validate_recovery(json_object(self.read(relative + "/recovery.json").stdout), self.scenario, stage)
        self.report.update(phase="confirmed", status="passed", passed=True, recovery=recovered, recoveryInstrumentationTests=1)
        self.save()

    def close(self):
        if self.stage_process and self.stage_process.poll() is None:
            # Terminate only our host ADB invocation. Do not kill a device process without proof.
            self.stage_process.terminate()
            try:
                self.stage_process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.stage_process.kill(); self.stage_process.wait(timeout=5)
        self.report_file.close()


def main():
    controller = None
    try:
        require(len(sys.argv) == 1, "unexpected-arguments")
        workspace, temporary, sdk = guarded_environment(os.environ, sys.platform, Path(__file__))
        controller = Controller(workspace, temporary, sdk)
        controller.run()
        print("PASS durable-ready SIGKILL/restart acceptance; recovery instrumentation OK (1 test).")
        return 0
    except Exception as exc:
        code = str(exc) if isinstance(exc, GuardError) else "controller-unexpected-failure"
        if controller:
            controller.report.update(passed=False, status="failed", failureCode=code)
            controller.save()
        print("FAIL durable-ready acceptance: " + code, file=sys.stderr)
        return 1
    finally:
        if controller:
            controller.close()


if __name__ == "__main__":
    sys.exit(main())

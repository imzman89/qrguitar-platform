"""Offline parser/control-flow tests. No ADB, emulator, install or network calls."""
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

FILE = Path(__file__).with_name("android-ready-process-death.py")
spec = importlib.util.spec_from_file_location("ready_death", FILE)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
SCENARIO = "11111111-1111-4111-8111-111111111111"


def stage():
    return {"protocol": 1, "scenario": SCENARIO, "phase": "ready_waiting_for_kill", "packageName": m.APP,
            "pid": 2001, "uid": 10123, "processStartTicks": "12000", "holdDeadlineElapsedRealtimeMs": 160000,
            "selectionId": "installed-ready-" + SCENARIO, "resultId": "22222222-2222-4222-8222-222222222222",
            "photoId": "33333333-3333-4333-8333-333333333333", "sourceSha256": "a" * 64,
            "normalizedSha256": "b" * 64, "baselineGrants": [], "callerCreated": 1, "callerDestroyed": 1}


def validated():
    return m.validate_stage(stage(), SCENARIO, 100000, "c" * 64)


def recovery(saved=None):
    saved = saved or validated()
    return {"protocol": 1, "scenario": SCENARIO, "phase": "verified_acknowledged", "packageName": m.APP,
            "uid": 10123, "oldPid": 2001, "pid": 2002, "oldProcessStartTicks": "12000", "processStartTicks": "14000",
            **{key: saved[key] for key in ("stageSha256", "selectionId", "resultId", "photoId", "sourceSha256", "normalizedSha256")},
            **{key: True for key in ("readyCiphertextPreserved", "realGrantReopened", "acknowledgementRepeated", "grantReleased",
                                     "encryptedPhotoDeleted", "fixtureDeleted", "nativeTombstoneRetained")}}


def stat(pid=2001, ticks="12000", state="S"):
    return f"{pid} (com.qrguitar.app) {state} " .encode() + (" ".join(["0"] * 18 + [ticks, "0", "0"])).encode()


STATUS = b"Name:\tqrguitar.app\nUid:\t10123\t10123\t10123\t10123\n"
CMDLINE = b"com.qrguitar.app\0"
OK = b"INSTRUMENTATION_STATUS_CODE: 1\nINSTRUMENTATION_STATUS_CODE: 0\nINSTRUMENTATION_RESULT: stream=\nTime: 1.1\n\nOK (1 test)\n\nINSTRUMENTATION_CODE: -1\n"


class Parsers(unittest.TestCase):
    def test_complete_certificate_only_exposes_safe_projection(self):
        value = stage(); value["fixtureUri"] = "content://synthetic/private"; value["photos"] = ["must-not-report"]
        result = m.validate_stage(value, SCENARIO, 100000, "c" * 64)
        self.assertEqual(result, validated()); self.assertNotIn("fixtureUri", result); self.assertNotIn("photos", result)

    def test_stage_fences(self):
        for key, value in (("protocol", True), ("protocol", 2), ("scenario", "../escape"), ("phase", "prepared"),
                           ("packageName", "other.app"), ("pid", -1), ("pid", True), ("uid", 0),
                           ("processStartTicks", "12;kill -9 1"), ("processStartTicks", "012"),
                           ("holdDeadlineElapsedRealtimeMs", 114999), ("holdDeadlineElapsedRealtimeMs", 160001),
                           ("selectionId", "foreign"), ("callerDestroyed", 0), ("callerCreated", True), ("baselineGrants", {}),
                           ("photoId", "not-a-uuid"), ("sourceSha256", "A" * 64)):
            with self.subTest(key=key, value=value):
                changed = stage(); changed[key] = value
                with self.assertRaises(m.GuardError): m.validate_stage(changed, SCENARIO, 100000, "c" * 64)

    def test_strict_json_rejects_duplicate_or_oversized_or_nonobject(self):
        for raw in (b'{"pid":1,"pid":2}', b'[]', b'null', b'\xff', b'{' + b' ' * 33000 + b'}'):
            with self.subTest(raw=raw[:30]):
                with self.assertRaises(m.GuardError): m.json_object(raw)

    def test_uuid_is_canonical_and_cannot_be_a_shell_or_path_fragment(self):
        self.assertEqual(m.canonical_uuid(SCENARIO), SCENARIO)
        for value in (None, "../x", SCENARIO + ";x", SCENARIO.replace("-", ""), "ABCDEFAB-1111-4111-8111-111111111111"):
            with self.assertRaises(m.GuardError): m.canonical_uuid(value)

    def test_linux_process_identity_field22_and_exact_command(self):
        self.assertEqual(m.process_identity(stat(), STATUS, CMDLINE), {"pid": 2001, "uid": 10123, "processStartTicks": "12000"})
        # Parenthesized comm can contain ')' without shifting Linux field22.
        self.assertEqual(m.process_identity(stat().replace(b"(com.qrguitar.app)", b"(name ) spaces)"), STATUS, CMDLINE)["processStartTicks"], "12000")

    def test_process_identity_refuses_foreign_uid_command_zombie_or_malformed(self):
        cases = ((stat(state="Z"), STATUS, CMDLINE), (stat(), STATUS.replace(b"10123", b"0"), CMDLINE),
                 (stat(), STATUS.replace(b"10123", b"10124", 1), CMDLINE), (stat(), STATUS, b"other.app\0"),
                 (stat(), STATUS, CMDLINE + b"extra"), (b"broken", STATUS, CMDLINE))
        for args in cases:
            with self.subTest(args=args):
                with self.assertRaises(m.GuardError): m.process_identity(*args)

    def test_recovery_requires_new_process_and_all_bound_proofs(self):
        self.assertEqual(m.validate_recovery(recovery(), SCENARIO, validated())["phase"], "verified_acknowledged")
        changes = {"pid": 2001, "processStartTicks": "12000", "uid": 10124, "oldPid": 1,
                   "oldProcessStartTicks": "1", "stageSha256": "d" * 64, "photoId": SCENARIO,
                   "normalizedSha256": "d" * 64, "phase": "ready_waiting_for_kill", "scenario": "other"}
        changes.update({key: False for key in ("readyCiphertextPreserved", "realGrantReopened", "acknowledgementRepeated",
                                             "grantReleased", "encryptedPhotoDeleted", "fixtureDeleted", "nativeTombstoneRetained")})
        for key, value in changes.items():
            changed = recovery(); changed[key] = value
            with self.subTest(key=key):
                with self.assertRaises(m.GuardError): m.validate_recovery(changed, SCENARIO, validated())

    def test_partial_recovery_certificate_cannot_pass(self):
        for missing in recovery():
            changed = recovery(); del changed[missing]
            with self.subTest(missing=missing), self.assertRaises(m.GuardError):
                m.validate_recovery(changed, SCENARIO, validated())

    def test_adb_exit_success_does_not_count_as_instrumentation_success(self):
        m.instrumentation_ok(OK)
        for value in (b"", b"INSTRUMENTATION_CODE: -1", OK.replace(b"1 test", b"2 tests"),
                      OK.replace(b"INSTRUMENTATION_CODE: -1", b"INSTRUMENTATION_CODE: 0"),
                      OK + b"\nINSTRUMENTATION_STATUS_CODE: -2\n", OK + b"FAILURES!!!", OK + OK):
            with self.subTest(value=value):
                with self.assertRaises(m.GuardError): m.instrumentation_ok(value)

    def test_kill_command_cannot_accept_injected_or_root_identity(self):
        script = m.kill_script(m.identity_fields(stage()))
        self.assertTrue(script.endswith("kill -9 2001")); self.assertIn("${20}", script)
        self.assertIn("/proc/2001/cmdline", script); self.assertIn("/proc/2001/status", script)
        for key, value in (("pid", "2001; kill -9 1"), ("uid", 0), ("processStartTicks", "12000'")):
            identity = m.identity_fields(stage()); identity[key] = value
            with self.assertRaises(m.GuardError): m.kill_script(identity)


class FakeChild:
    def __init__(self): self.returncode = None; self.terminated = False
    def poll(self): return self.returncode
    def wait(self, timeout): self.returncode = 0; return 0
    def terminate(self): self.terminated = True; self.returncode = -15
    def kill(self): self.returncode = -9


class FakeController(m.Controller):
    def __init__(self, fault=None):
        self.adb = ["synthetic-adb", "-s", m.SERIAL]
        self.scenario = SCENARIO; self.report = {"passed": False, "stagingIsPassingTest": False}
        self.stage_process = None; self.events = []; self.fault = fault; self.report_file = io.StringIO()
        self.raw_stage = json.dumps(stage()).encode()
        self.saved_stage = m.validate_stage(stage(), SCENARIO, 100000, m.hashlib.sha256(self.raw_stage).hexdigest())
    def save(self): self.events.append("save:" + self.report.get("phase", "setup"))
    def verify_apks(self, allow_install): self.events.append("verify-apks:" + str(allow_install))
    def uptime(self): return 100000
    def identity(self, pid):
        result = m.identity_fields(stage())
        if self.fault == "pid-reused": result["processStartTicks"] = "13000"
        return result
    def read(self, relative, optional=False):
        if relative.endswith("stage.json"):
            value = self.raw_stage
            if self.fault == "wrong-stage": value = json.dumps({**stage(), "scenario": "other"}).encode()
        elif relative.endswith("recovery.json"):
            value = recovery(self.saved_stage)
            if self.fault == "wrong-recovery": value["stageSha256"] = "d" * 64
            value = json.dumps(value).encode()
        else: raise AssertionError(relative)
        return subprocess.CompletedProcess([], 0, value, b"")
    def command(self, args, timeout=15, optional=False):
        text = " ".join(args)
        if "get-state" in args: output = b"device\n"
        elif args[-3:] == ["emu", "avd", "name"]: output = b"qrguitar-acceptance\nOK\n"
        elif args[-1] == "ro.kernel.qemu": output = b"1\n"
        elif args[-1] == "ro.build.version.sdk": output = b"35\n"
        elif "kill -9" in text:
            self.events.append("kill")
            if self.fault == "kill-failed": raise m.GuardError("command-failed")
            output = b""
        elif "test ! -e" in text: output = b""
        elif "test -e /proc/2001" in text:
            self.events.append("gone")
            return subprocess.CompletedProcess(args, 1, b"", b"unavailable" if self.fault == "absence-unreadable" else b"")
        elif "recoverReadyResult" in text:
            self.events.append("recover")
            output = b"INSTRUMENTATION_CODE: -1" if self.fault == "missing-test-pass" else OK
        else: raise AssertionError(text)
        return subprocess.CompletedProcess(args, 0, output, b"")


class ControlFlow(unittest.TestCase):
    def run_fake(self, control):
        child = FakeChild()
        with patch.object(m.subprocess, "Popen", return_value=child) as popen:
            control.run()
        return child, popen

    def test_full_two_phase_protocol_never_reinstalls_after_kill(self):
        control = FakeController(); _, spawn = self.run_fake(control)
        self.assertTrue(control.report["passed"]); self.assertFalse(control.report["stagingIsPassingTest"])
        self.assertEqual([event for event in control.events if not event.startswith("save:")],
                         ["verify-apks:True", "kill", "gone", "verify-apks:False", "recover"])
        self.assertIn(m.TEST_CLASS + "#stageReadyResult", spawn.call_args.args[0])
        self.assertEqual(control.report["recoveryInstrumentationTests"], 1)

    def test_unbound_stage_or_reused_pid_cannot_dispatch_kill_or_recovery(self):
        for fault in ("wrong-stage", "pid-reused"):
            control = FakeController(fault)
            with self.subTest(fault=fault), self.assertRaises(m.GuardError): self.run_fake(control)
            self.assertNotIn("kill", control.events); self.assertNotIn("recover", control.events)

    def test_failed_kill_cannot_continue_or_claim_pass(self):
        control = FakeController("kill-failed")
        with self.assertRaises(m.GuardError): self.run_fake(control)
        self.assertFalse(control.report["passed"]); self.assertNotIn("recover", control.events)

    def test_command_failure_cannot_be_mistaken_for_proved_process_absence(self):
        control = FakeController("absence-unreadable")
        with self.assertRaisesRegex(m.GuardError, "absence-unreadable"): self.run_fake(control)
        self.assertFalse(control.report["passed"]); self.assertNotIn("recover", control.events)

    def test_staging_that_finishes_before_kill_cannot_pass_or_kill(self):
        control = FakeController(); child = FakeChild(); child.returncode = 0
        with patch.object(m.subprocess, "Popen", return_value=child), self.assertRaisesRegex(m.GuardError, "ended-before-kill"):
            control.run()
        self.assertNotIn("kill", control.events); self.assertNotIn("recover", control.events)

    def test_interrupted_staging_can_never_also_count_as_passing_test(self):
        control = FakeController()
        def spawn(*args, **kwargs):
            kwargs["stdout"].write(b"OK (1 test)\n"); kwargs["stdout"].flush()
            return FakeChild()
        with patch.object(m.subprocess, "Popen", side_effect=spawn), self.assertRaisesRegex(m.GuardError, "unexpected-pass"):
            control.run()
        self.assertNotIn("recover", control.events); self.assertFalse(control.report["passed"])

    def test_recovery_requires_runner_pass_and_bound_certificate(self):
        for fault in ("missing-test-pass", "wrong-recovery"):
            control = FakeController(fault)
            with self.subTest(fault=fault), self.assertRaises(m.GuardError): self.run_fake(control)
            self.assertFalse(control.report["passed"])

    def test_only_expected_methods_and_phases_can_be_dispatched(self):
        control = FakeController()
        with self.assertRaises(m.GuardError): control.instrumentation("stageReadyResult", "recover")

    def test_failure_cleanup_stops_only_owned_host_adb_child(self):
        control = FakeController(); child = FakeChild(); control.stage_process = child
        control.close(); self.assertTrue(child.terminated); self.assertEqual(control.events, [])


class Environment(unittest.TestCase):
    def test_nonhosted_or_nonlinux_refuses_before_directory_or_device_access(self):
        for env, platform in (({}, "linux"), ({"GITHUB_ACTIONS": "true", "RUNNER_ENVIRONMENT": "self-hosted", "RUNNER_OS": "Linux"}, "linux"),
                              ({"GITHUB_ACTIONS": "true", "RUNNER_ENVIRONMENT": "github-hosted", "RUNNER_OS": "Linux"}, "win32")):
            with self.subTest(env=env), self.assertRaises(m.GuardError): m.guarded_environment(env, platform, FILE)

    def test_other_device_serial_refuses_before_paths(self):
        env = {"GITHUB_ACTIONS": "true", "RUNNER_ENVIRONMENT": "github-hosted", "RUNNER_OS": "Linux", "ANDROID_SERIAL": "phone-123"}
        with self.assertRaisesRegex(m.GuardError, "wrong-device-serial"): m.guarded_environment(env, "linux", FILE)


class ApkBoundary(unittest.TestCase):
    def fixture(self, root, initially_installed=True, changed=False):
        control = object.__new__(m.Controller)
        control.workspace = root; control.adb = ["synthetic-adb", "-s", m.SERIAL]; control.aapt = "synthetic-aapt"
        base = root / "apps/mobile/android/app/build/outputs/apk"
        paths = {m.APP: base / "debug/app-debug.apk", m.TEST_APP: base / "androidTest/debug/app-debug-androidTest.apk"}
        hashes = {}
        for package, file in paths.items():
            file.parent.mkdir(parents=True, exist_ok=True); file.write_bytes(package.encode())
            hashes[package] = m.hashlib.sha256(package.encode()).hexdigest()
        installed = set(paths) if initially_installed else set()
        events = []
        def command(args, timeout=15, optional=False):
            events.append(args)
            package = next((key for key, file in paths.items() if str(file) in args), None)
            if args[0] == "synthetic-aapt":
                output = (f"package: name='{package}' versionCode='1'".encode() if "badging" in args else
                          b"package: com.qrguitar.app" if "permissions" in args else b"android:testOnly=(type 0x12)0xffffffff")
            elif "install" in args:
                installed.add(package); output = b"Success"
            elif "path" in args:
                package = args[-1]
                output = f"package:/data/app/{package}/base.apk".encode() if package in installed else b""
            elif "sha256sum" in args:
                package = args[-1].split('/')[-2]
                output = (("d" * 64 if changed else hashes[package]) + "  " + args[-1]).encode()
            elif "instrumentation" in args:
                output = f"instrumentation:{m.COMPONENT} (target={m.APP})".encode()
            else: raise AssertionError(args)
            return subprocess.CompletedProcess(args, 0, output, b"")
        control.command = command
        return control, events

    def test_matching_installed_fixture_is_never_reinstalled(self):
        with tempfile.TemporaryDirectory() as directory:
            control, events = self.fixture(Path(directory).resolve())
            control.verify_apks(True); control.verify_apks(False)
            self.assertFalse(any("install" in args for args in events))

    def test_only_initially_absent_exact_built_apks_are_installed(self):
        with tempfile.TemporaryDirectory() as directory:
            control, events = self.fixture(Path(directory).resolve(), initially_installed=False)
            control.verify_apks(True)
            installs = [args for args in events if "install" in args]
            self.assertEqual(len(installs), 2)
            self.assertTrue(all("-t" in args and "-r" not in args for args in installs))
            control.verify_apks(False)
            self.assertEqual(len([args for args in events if "install" in args]), 2)

    def test_wrong_installed_apk_cannot_be_overwritten(self):
        with tempfile.TemporaryDirectory() as directory:
            control, events = self.fixture(Path(directory).resolve(), changed=True)
            with self.assertRaisesRegex(m.GuardError, "does-not-match"): control.verify_apks(True)
            self.assertFalse(any("install" in args for args in events))

    def test_fixture_missing_after_kill_is_never_reinstalled(self):
        with tempfile.TemporaryDirectory() as directory:
            control, events = self.fixture(Path(directory).resolve(), initially_installed=False)
            with self.assertRaisesRegex(m.GuardError, "disappeared-after-stage"): control.verify_apks(False)
            self.assertFalse(any("install" in args for args in events))


if __name__ == "__main__":
    unittest.main()

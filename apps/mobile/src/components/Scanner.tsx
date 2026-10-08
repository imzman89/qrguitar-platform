import React, { useEffect, useRef, useState } from "react";
import { CameraView, useCameraPermissions } from "expo-camera";
import {
  AppState,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { parseQrInput } from "../lib/qr-input";
import { Action, Field, Heading, Notice, colors, styles } from "./ui";
export function Scanner({ onProfile }: { onProfile: (code: string) => void }) {
  const [permission, requestPermission, getPermission] = useCameraPermissions();
  const [active, setActive] = useState(AppState.currentState === "active");
  const [armed, setArmed] = useState(true),
    [manual, setManual] = useState(""),
    [error, setError] = useState(""),
    [cameraError, setCameraError] = useState("");
  const locked = useRef(false),
    opened = useRef(false),
    mounted = useRef(true),
    activeRef = useRef(AppState.currentState === "active");
  const lifecycle = useRef({ camera: 0, permission: 0 }),
    permissionBusy = useRef(false);
  const [asking, setAsking] = useState(false),
    [cameraEpoch, setCameraEpoch] = useState(0);
  const isActive = () =>
    mounted.current && activeRef.current && AppState.currentState === "active";
  useEffect(() => {
    const lifetime = lifecycle.current;
    mounted.current = true;
    activeRef.current = AppState.currentState === "active";
    setActive(activeRef.current);
    setCameraEpoch(lifecycle.current.camera);
    const sub = AppState.addEventListener("change", (state) => {
      const foreground = state === "active";
      if (activeRef.current !== foreground) lifecycle.current.camera++;
      activeRef.current = foreground;
      setActive(foreground);
      setCameraEpoch(lifecycle.current.camera);
      const revision = ++lifecycle.current.permission;
      if (foreground)
        void getPermission()
          .then((p) => {
            if (
              mounted.current &&
              activeRef.current &&
              revision === lifecycle.current.permission &&
              p.granted
            )
              setCameraError("");
          })
          .catch(() => {
            if (
              mounted.current &&
              activeRef.current &&
              revision === lifecycle.current.permission
            )
              setCameraError(
                "Camera access could not be checked. Enter the QRguitar ID below.",
              );
          });
    });
    return () => {
      mounted.current = false;
      activeRef.current = false;
      lifetime.camera++;
      lifetime.permission++;
      sub.remove();
    };
  }, [getPermission]);
  function open(value: string) {
    if (!isActive() || locked.current) return;
    locked.current = true;
    setArmed(false);
    const code = parseQrInput(value);
    if (!code) {
      setError(
        "This is not a QRguitar Profile code. Scan its permanent QR or enter an ID such as QRG-A00174.",
      );
      return;
    }
    opened.current = true;
    setError("");
    onProfile(code);
  }
  function openManual() {
    if (!isActive() || opened.current) return;
    locked.current = false;
    open(manual);
  }
  function rearm() {
    if (!isActive()) return;
    opened.current = false;
    locked.current = false;
    setError("");
    setArmed(true);
  }
  async function requestCamera() {
    if (!isActive() || permissionBusy.current) return;
    permissionBusy.current = true;
    setAsking(true);
    const revision = ++lifecycle.current.permission;
    try {
      const p = await requestPermission();
      if (isActive() && revision === lifecycle.current.permission)
        setCameraError(
          p.granted
            ? ""
            : "Camera access was not granted. You can still enter an ID below.",
        );
    } catch {
      if (isActive() && revision === lifecycle.current.permission)
        setCameraError("Camera access is unavailable. Enter an ID below.");
    } finally {
      permissionBusy.current = false;
      if (mounted.current) setAsking(false);
    }
  }
  async function openSettings() {
    if (!isActive() || permissionBusy.current) return;
    permissionBusy.current = true;
    setAsking(true);
    const revision = ++lifecycle.current.permission;
    try {
      await Linking.openSettings();
    } catch {
      if (isActive() && revision === lifecycle.current.permission)
        setCameraError(
          "Open Settings manually and allow QRguitar to use the camera.",
        );
    } finally {
      permissionBusy.current = false;
      if (mounted.current) setAsking(false);
    }
  }
  const renderedCameraLifetime = cameraEpoch;
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.content}
    >
      <Heading
        eyebrow="One scan. The whole story."
        title="Find a Profile"
        copy="Point your camera at a QRguitar code to open the instrument’s public Profile."
      />
      {!permission ? (
        <Notice message="Checking camera access…" />
      ) : !permission.granted ? (
        <View style={styles.card}>
          <Text style={styles.h2}>Allow the camera to scan</Text>
          <Text style={styles.copy}>
            Camera access is used only while this scanner is open. You can also
            type an ID.
          </Text>
          <Action
            title={
              permission.canAskAgain ? "Enable camera" : "Open device settings"
            }
            loading={asking}
            onPress={() => {
              if (permission.canAskAgain) void requestCamera();
              else void openSettings();
            }}
          />
        </View>
      ) : active && !cameraError ? (
        <View style={local.cameraFrame}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={
              armed
                ? ({ data }) => {
                    if (renderedCameraLifetime === lifecycle.current.camera)
                      open(data);
                  }
                : undefined
            }
            onMountError={() => {
              if (
                isActive() &&
                renderedCameraLifetime === lifecycle.current.camera
              )
                setCameraError(
                  "The camera could not start. Enter the ID below or reopen this screen.",
                );
            }}
          />
          <View pointerEvents="none" style={local.target} />
          <Text style={local.hint}>
            {armed ? "Center the QR inside the frame" : "Scanner paused"}
          </Text>
        </View>
      ) : !active ? (
        <Notice message="The camera pauses when QRguitar is in the background." />
      ) : null}
      {cameraError ? <Notice message={cameraError} error /> : null}
      {error ? <Notice message={error} error /> : null}
      {!armed ? <Action title="Scan again" secondary onPress={rearm} /> : null}
      <View style={styles.card}>
        <Field
          label="QRguitar ID or Profile link"
          value={manual}
          onChangeText={setManual}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder="QRG-A00174"
          returnKeyType="go"
          onSubmitEditing={openManual}
        />
        <Action
          title="Open Profile"
          disabled={!manual.trim()}
          onPress={openManual}
        />
      </View>
    </ScrollView>
  );
}
const local = StyleSheet.create({
  cameraFrame: {
    height: 330,
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  target: {
    width: 220,
    height: 220,
    borderWidth: 2,
    borderColor: colors.gold,
    borderRadius: 20,
  },
  hint: {
    position: "absolute",
    bottom: 16,
    color: "white",
    fontSize: 14,
    fontWeight: "700",
    backgroundColor: "#0A0D10BB",
    padding: 10,
    borderRadius: 10,
  },
});

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  BackHandler,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { getNativeAuth, type NativeAuthSnapshot } from "./lib/auth";
import {
  getNativeApi,
  safeNativeImageUrl,
  type NativeInstrument,
} from "./lib/api";
import {
  createProfileDraftController,
  photoFromPickerAsset,
  MAX_NATIVE_PHOTOS,
  MAX_NATIVE_IMAGE_BYTES,
  type NativePhoto,
  type NativeProfileInput,
} from "./lib/profile-draft";
import { createUiMutationQueue, waitForDraftIdle } from "./lib/ui-actions";
import { getNativePhotoPicker } from "./lib/photo-picker";
import { parseQrInput, profileWebUrl, publicSearchText } from "./lib/qr-input";
import { Scanner } from "./components/Scanner";
import {
  Action,
  Field,
  Heading,
  Notice,
  colors,
  styles,
} from "./components/ui";
type Route =
  | { name: "browse" | "scan" | "library" | "login" | "create" }
  | { name: "record"; code: string; mine: boolean };
const messageOf = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "This action could not be completed. Please try again.";
async function openWeb(path: string) {
  if (
    !/^\/(?:login(?:\?mode=(?:register|reset))?|account|dashboard|create|catalog|privacy|terms|edit\/QRG-[A-Z0-9]+|handout\/QRG-[A-Z0-9]+)$/.test(
      path,
    )
  )
    throw new Error("This link is unavailable.");
  await Linking.openURL("https://qrguitar.com" + path);
}
function reportLink(error: unknown) {
  Alert.alert("Link unavailable", messageOf(error));
}
function useAuth() {
  const auth = useMemo(() => getNativeAuth(), []);
  const snapshot = useSyncExternalStore(
    auth.subscribe,
    auth.getSnapshot,
    auth.getSnapshot,
  );
  useEffect(() => auth.start(), [auth]);
  return { auth, snapshot };
}
function useResource<T>(
  reader: (signal: AbortSignal) => Promise<T>,
  key: string,
  retainOnError = true,
) {
  const readRef = useRef(reader);
  useEffect(() => {
    readRef.current = reader;
  }, [reader]);
  const [refresh, setRefresh] = useState(0),
    [state, setState] = useState<{
      value: T | null;
      loading: boolean;
      error: string;
    }>({ value: null, loading: true, error: "" });
  useEffect(() => {
    let current = true;
    const controller = new AbortController();
    void Promise.resolve()
      .then(() => {
        if (!current) return null;
        setState((s) => ({ ...s, loading: true, error: "" }));
        return readRef.current(controller.signal);
      })
      .then((value) => {
        if (current) setState({ value, loading: false, error: "" });
      })
      .catch((error) => {
        if (current)
          setState((s) => ({
            ...s,
            value: retainOnError ? s.value : null,
            loading: false,
            error: messageOf(error),
          }));
      });
    return () => {
      current = false;
      controller.abort();
    };
  }, [key, refresh, retainOnError]);
  return { ...state, retry: () => setRefresh((v) => v + 1) };
}
function Photo({
  url,
  label,
  privatePhoto = false,
  large = false,
}: {
  url: string | undefined;
  label: string;
  privatePhoto?: boolean;
  large?: boolean;
}) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const source = safeNativeImageUrl(url);
  return source && failedSource !== source ? (
    <Image
      source={{ uri: source }}
      accessibilityLabel={label}
      accessible
      style={large ? local.largePhoto : local.cardPhoto}
      contentFit={large ? "contain" : "cover"}
      cachePolicy={privatePhoto ? "none" : "memory"}
      recyclingKey={source}
      onError={() => setFailedSource(source)}
    />
  ) : (
    <View
      style={[
        large ? local.largePhoto : local.cardPhoto,
        local.photoPlaceholder,
      ]}
    >
      <Text style={styles.small}>Photo unavailable</Text>
    </View>
  );
}
function RecordCard({
  record,
  onOpen,
  mine = false,
}: {
  record: NativeInstrument;
  onOpen: () => void;
  mine?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={"Open " + record.name}
      onPress={onOpen}
      style={({ pressed }) => [local.recordCard, pressed && styles.dim]}
    >
      <Photo
        url={record.heroImageDataUrl}
        label={record.name}
        privatePhoto={mine}
      />
      <View style={local.recordCopy}>
        <Text style={styles.eyebrow}>{record.qrCode}</Text>
        <Text accessibilityRole="header" style={styles.h2}>
          {record.name}
        </Text>
        <Text style={styles.small}>
          {[record.brand, record.year, record.location]
            .filter(Boolean)
            .join(" · ")}
        </Text>
        <View style={styles.wrap}>
          {mine ? (
            <Text style={styles.pill}>
              {record.visibility === "private"
                ? "Private"
                : record.visibility === "unlisted"
                  ? "Unlisted"
                  : "Public"}
            </Text>
          ) : null}
          {record.verificationStatus === "verified" &&
          record.showVerificationBadge !== false ? (
            <Text style={styles.pill}>Verified by QRguitar</Text>
          ) : null}
        </View>
        <Text style={local.openLink}>Open Profile →</Text>
      </View>
    </Pressable>
  );
}
function SignInGate({
  snapshot,
  onSignIn,
}: {
  snapshot: NativeAuthSnapshot;
  onSignIn: () => void;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.h2}>
        {snapshot.status === "loading"
          ? "Restoring your session…"
          : "Your instruments, together"}
      </Text>
      <Text style={styles.copy}>
        Sign in to view private Profiles, register an instrument, and manage
        your collection.
      </Text>
      {snapshot.status === "loading" ? (
        <ActivityIndicator color={colors.gold} />
      ) : (
        <Action title="Sign in or create an account" onPress={onSignIn} />
      )}
      {["error", "unconfigured"].includes(snapshot.status) &&
      snapshot.message ? (
        <Notice message={snapshot.message} error />
      ) : null}
    </View>
  );
}
function Browse({
  onOpen,
  onScan,
  onCreate,
}: {
  onOpen: (code: string) => void;
  onScan: () => void;
  onCreate: () => void;
}) {
  const data = useResource(
    (signal) => getNativeApi().listPublic(signal),
    "catalog",
  );
  const [search, setSearch] = useState("");
  const records =
    data.value?.filter((record) => publicSearchText(record, search)) || [];
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={data.loading && !!data.value}
          onRefresh={data.retry}
          tintColor={colors.gold}
        />
      }
    >
      <Heading
        eyebrow="For the life of an instrument"
        title="Every instrument has a story."
        copy="Find the photos, specifications, service, and ownership behind a QRguitar Profile."
      />
      <View style={styles.row}>
        <View style={styles.grow}>
          <Action title="Scan a QR" onPress={onScan} />
        </View>
        <View style={styles.grow}>
          <Action title="Create Profile" secondary onPress={onCreate} />
        </View>
      </View>
      <View style={styles.heading}>
        <Text accessibilityRole="header" style={styles.h2}>
          Explore the Catalog
        </Text>
        <Field
          label="Search public Profiles"
          value={search}
          onChangeText={setSearch}
          placeholder="Name, brand, year or QRguitar ID"
          autoCorrect={false}
          returnKeyType="search"
        />
      </View>
      {data.error ? (
        <>
          <Notice error message={data.error} />
          <Action title="Retry Catalog" secondary onPress={data.retry} />
        </>
      ) : null}
      {data.loading && !data.value ? (
        <View style={styles.empty}>
          <ActivityIndicator color={colors.gold} />
          <Text style={styles.copy}>Loading public Profiles…</Text>
        </View>
      ) : null}
      {!data.loading && !data.error && records.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.h2}>
            {search ? "No matching Profiles" : "The Catalog is quiet for now"}
          </Text>
          <Text style={styles.copy}>
            {search
              ? "Try another brand, year or QRguitar ID."
              : "Public Profiles will appear here. You can still scan or enter a permanent QRguitar ID."}
          </Text>
          {search ? (
            <Action
              title="Clear search"
              secondary
              onPress={() => setSearch("")}
            />
          ) : null}
        </View>
      ) : null}
      {records.map((record) => (
        <RecordCard
          key={record.qrCode}
          record={record}
          onOpen={() => onOpen(record.qrCode)}
        />
      ))}
    </ScrollView>
  );
}
function Library({
  snapshot,
  onSignIn,
  onCreate,
  onOpen,
  onSignOut,
}: {
  snapshot: NativeAuthSnapshot;
  onSignIn: () => void;
  onCreate: () => void;
  onOpen: (code: string) => void;
  onSignOut: () => void;
}) {
  const signed = snapshot.status === "signed-in" && snapshot.session;
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.content}
    >
      <Heading
        eyebrow="Owner workspace"
        title="Your instruments"
        copy="Keep your collection organized, with privacy in your hands."
      />
      {signed ? (
        <>
          <View style={styles.row}>
            <View style={styles.grow}>
              <Action title="Create Profile" onPress={onCreate} />
            </View>
            <Action
              title="Account"
              secondary
              compact
              onPress={() => void openWeb("/account").catch(reportLink)}
            />
          </View>
          <OwnedRecords
            actorId={snapshot.session!.user.id}
            revision={snapshot.revision}
            onOpen={onOpen}
          />
          <View style={styles.card}>
            <Text style={styles.label}>Signed in as</Text>
            <Text style={styles.copy}>{snapshot.session!.user.email}</Text>
            <Action title="Sign out" secondary onPress={onSignOut} />
          </View>
        </>
      ) : (
        <SignInGate snapshot={snapshot} onSignIn={onSignIn} />
      )}
    </ScrollView>
  );
}
function OwnedRecords({
  actorId,
  revision,
  onOpen,
}: {
  actorId: string;
  revision: number;
  onOpen: (code: string) => void;
}) {
  const data = useResource(
    (signal) => getNativeApi().listMine(signal),
    actorId + ":" + revision,
    false,
  );
  const [search, setSearch] = useState("");
  const records =
    data.value?.filter((record) => publicSearchText(record, search)) || [];
  return (
    <>
      {data.error ? <Notice error message={data.error} /> : null}
      <View style={styles.row}>
        <Text style={[styles.h2, styles.grow]}>
          {data.value ? data.value.length + " Profiles" : "Your collection"}
        </Text>
        <Action
          compact
          secondary
          title="Refresh"
          loading={data.loading}
          onPress={data.retry}
        />
      </View>
      {data.loading && !data.value ? (
        <ActivityIndicator color={colors.gold} />
      ) : null}
      {data.value?.length ? (
        <Field
          label="Find an instrument"
          value={search}
          onChangeText={setSearch}
          placeholder="Name, brand or ID"
          autoCorrect={false}
        />
      ) : null}
      {data.value && !records.length ? (
        <View style={styles.card}>
          <Text style={styles.h2}>
            {search ? "No matching instruments" : "Start with one instrument."}
          </Text>
          <Text style={styles.copy}>
            {search
              ? "Try a different name or ID."
              : "Create a Profile to keep photos, details and the instrument’s history together."}
          </Text>
        </View>
      ) : null}
      {records.map((record) => (
        <RecordCard
          key={record.qrCode}
          record={record}
          mine
          onOpen={() => onOpen(record.qrCode)}
        />
      ))}
    </>
  );
}
function Profile({
  code,
  mine,
  snapshot,
  onLibrary,
  active,
}: {
  code: string;
  mine: boolean;
  snapshot: NativeAuthSnapshot;
  onLibrary: () => void;
  active: boolean;
}) {
  const data = useResource(
    (signal) =>
      mine
        ? getNativeApi().readMine(code, signal)
        : getNativeApi().readPublic(code, signal),
    code + ":" + mine + ":" + snapshot.revision,
    !mine,
  );
  const [gallery, setGallery] = useState(false),
    [imageIndex, setImageIndex] = useState(0);
  const record = data.value;
  const images = record
    ? Array.from(
        new Set(
          [
            record.heroImageDataUrl,
            ...(record.galleryImageDataUrls || []),
          ].filter(
            (x): x is string =>
              typeof x === "string" && !!safeNativeImageUrl(x),
          ),
        ),
      )
    : [];
  if (data.loading && !record)
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.gold} />
        <Text style={styles.copy}>Opening Profile…</Text>
      </View>
    );
  if (!record)
    return (
      <ScrollView contentContainerStyle={styles.content}>
        <Heading
          title="Profile unavailable"
          copy={
            data.error || "This Profile may be private or no longer available."
          }
        />
        <Action title="Try again" onPress={data.retry} />
        <Action title="Check my instruments" secondary onPress={onLibrary} />
      </ScrollView>
    );
  const details = [
    ["Brand", record.brand],
    ["Model", record.model],
    ["Year", record.year],
    ["Serial number", record.serial],
    ["Instrument type", record.instrumentType],
    ["Location", record.location],
  ].filter(([, value]) => !!value);
  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={data.loading}
          onRefresh={data.retry}
          tintColor={colors.gold}
        />
      }
    >
      <Action
        title="Refresh Profile"
        secondary
        compact
        loading={data.loading}
        onPress={data.retry}
      />
      {mine ? (
        <Notice message="Owner view · You are viewing your instrument’s private details." />
      ) : null}
      {data.error ? <Notice error message={data.error} /> : null}
      <Heading
        eyebrow={record.qrCode}
        title={record.name}
        copy={[record.brand, record.year].filter(Boolean).join(" · ")}
      />
      <View style={styles.wrap}>
        {record.verificationStatus === "verified" &&
        record.showVerificationBadge !== false ? (
          <Text style={styles.pill}>Verified by QRguitar</Text>
        ) : null}
        {record.authenticityStatus === "confirmed" &&
        record.showAuthenticityBadge !== false ? (
          <Text style={styles.pill}>Authenticity confirmed</Text>
        ) : null}
        {mine ? (
          <Text style={styles.pill}>{record.visibility || "Private"}</Text>
        ) : null}
      </View>
      {record.safetyStatus && record.safetyStatus !== "clear" ? (
        <Notice
          error
          message={
            record.safetyStatus.toUpperCase() +
            (record.publicSafetyNote ? " · " + record.publicSafetyNote : "")
          }
        />
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open photo gallery"
        disabled={!images.length}
        onPress={() => {
          setImageIndex(0);
          setGallery(true);
        }}
      >
        <Photo url={images[0]} label={record.name} privatePhoto={mine} large />
      </Pressable>
      {images.length > 1 ? (
        <Text style={styles.small}>
          {images.length} photos · Tap to view gallery
        </Text>
      ) : null}
      {record.summary ? (
        <Text style={styles.copy}>{record.summary}</Text>
      ) : null}
      <View style={styles.row}>
        <View style={styles.grow}>
          <Action
            title="Share Profile"
            secondary
            onPress={() => {
              const share = () =>
                void Share.share({
                  message: record.name + "\n" + profileWebUrl(record.qrCode),
                }).catch(reportLink);
              if (mine && record.visibility === "private")
                Alert.alert(
                  "This Profile is private",
                  "The permanent link will not show private details to other people.",
                  [
                    { text: "Cancel", style: "cancel" },
                    { text: "Share link", onPress: share },
                  ],
                );
              else share();
            }}
          />
        </View>
        <View style={styles.grow}>
          <Action
            title={mine ? "Edit in browser" : "Full Profile"}
            onPress={() =>
              void Linking.openURL(
                mine
                  ? "https://qrguitar.com/edit/" + record.qrCode
                  : profileWebUrl(record.qrCode),
              ).catch(reportLink)
            }
          />
        </View>
      </View>
      <View style={styles.card}>
        <Text accessibilityRole="header" style={styles.h2}>
          Instrument details
        </Text>
        {details.map(([label, value]) => (
          <View key={label} style={local.detailRow}>
            <Text style={styles.small}>{label}</Text>
            <Text style={local.detailValue}>{value}</Text>
          </View>
        ))}
        {record.customFields?.map((field, index) => (
          <View key={field.id || index} style={local.detailRow}>
            <Text style={styles.small}>{field.label}</Text>
            <Text style={local.detailValue}>{field.value}</Text>
          </View>
        ))}
      </View>
      {record.timelineEvents?.length ? (
        <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.h2}>
            History
          </Text>
          {record.timelineEvents.map((event, index) => (
            <View key={event.id || index} style={local.history}>
              <Text style={styles.eyebrow}>
                {event.serviceDate || "Date not recorded"}
              </Text>
              <Text style={styles.label}>{event.title}</Text>
              {event.publicDescription ? (
                <Text style={styles.copy}>{event.publicDescription}</Text>
              ) : null}
              {mine && event.privateNotes ? (
                <Text style={styles.small}>{event.privateNotes}</Text>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
      {record.documentFiles?.length ? (
        <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.h2}>
            Documents
          </Text>
          {record.documentFiles.map((doc, index) => (
            <View key={doc.id || index}>
              <Text style={styles.label}>{doc.name}</Text>
              {doc.publicDescription ? (
                <Text style={styles.small}>{doc.publicDescription}</Text>
              ) : null}
              <Action
                title={"Open " + doc.name}
                secondary
                compact
                onPress={() => {
                  const url = safeNativeImageUrl(doc.url);
                  if (url) void Linking.openURL(url).catch(reportLink);
                  else
                    Alert.alert(
                      "Document unavailable",
                      "Refresh this Profile to request a new document link.",
                    );
                }}
              />
            </View>
          ))}
        </View>
      ) : null}
      {mine ? (
        <View style={styles.card}>
          <Text style={styles.h2}>Keep the history moving</Text>
          <Text style={styles.copy}>
            Manage service, transfers, documents and QR printing in your
            QRguitar web workspace. Your browser may ask you to sign in.
          </Text>
          <Action
            title="Open owner workspace"
            secondary
            onPress={() => void openWeb("/dashboard").catch(reportLink)}
          />
          <Action
            title="Print and QR tools"
            secondary
            onPress={() =>
              void openWeb("/handout/" + record.qrCode).catch(reportLink)
            }
          />
        </View>
      ) : null}
      <Modal
        visible={gallery && active}
        onRequestClose={() => setGallery(false)}
        animationType="fade"
      >
        <SafeAreaView style={styles.screen}>
          <View style={styles.content}>
            <Action
              title="Close gallery"
              secondary
              onPress={() => setGallery(false)}
            />
            <Photo
              url={images[imageIndex]}
              label={record.name + " photo " + (imageIndex + 1)}
              privatePhoto={mine}
              large
            />
            <Text style={styles.copy}>
              {imageIndex + 1} / {images.length}
            </Text>
            <View style={styles.row}>
              <View style={styles.grow}>
                <Action
                  title="Previous photo"
                  secondary
                  disabled={imageIndex === 0}
                  onPress={() => setImageIndex((v) => Math.max(0, v - 1))}
                />
              </View>
              <View style={styles.grow}>
                <Action
                  title="Next photo"
                  disabled={imageIndex >= images.length - 1}
                  onPress={() =>
                    setImageIndex((v) => Math.min(images.length - 1, v + 1))
                  }
                />
              </View>
            </View>
          </View>
        </SafeAreaView>
      </Modal>
    </ScrollView>
  );
}
function Login() {
  const auth = getNativeAuth();
  const [mode, setMode] = useState<"login" | "register">("login"),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [name, setName] = useState(""),
    [accepted, setAccepted] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [note, setNote] = useState("");
  const locked = useRef(false),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function submit() {
    if (locked.current) return;
    setError("");
    setNote("");
    if (
      !email.trim() ||
      !password ||
      (mode === "register" &&
        (!name.trim() || password.length < 8 || !accepted))
    ) {
      setError(
        mode === "register"
          ? "Enter your name, email and a password with at least 8 characters, and accept the Terms."
          : "Enter your email and password.",
      );
      return;
    }
    locked.current = true;
    setBusy(true);
    try {
      if (mode === "register") {
        const result = await auth.signUp(email.trim(), password, name.trim());
        if (mounted.current && result.requiresEmailConfirmation) {
          setMode("login");
          setPassword("");
          setNote(
            "Check your email to confirm your account, then return here to sign in.",
          );
        }
      } else await auth.signIn(email.trim(), password);
    } catch (error) {
      if (mounted.current) setError(messageOf(error));
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.content}
    >
      <Heading
        eyebrow="Your QRguitar account"
        title={mode === "login" ? "Welcome back." : "Start your collection."}
        copy="Use the same account as QRguitar.com."
      />
      <View style={styles.row}>
        {(["login", "register"] as const).map((value) => (
          <View key={value} style={styles.grow}>
            <Action
              title={value === "login" ? "Sign in" : "Create account"}
              secondary={mode !== value}
              disabled={busy}
              onPress={() => {
                setMode(value);
                setError("");
                setNote("");
              }}
            />
          </View>
        ))}
      </View>
      {note ? <Notice message={note} /> : null}
      {error ? <Notice message={error} error /> : null}
      {mode === "register" ? (
        <Field
          label="Display name"
          value={name}
          onChangeText={setName}
          autoComplete="name"
          maxLength={120}
          editable={!busy}
        />
      ) : null}
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
        editable={!busy}
      />
      <Field
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete={mode === "register" ? "new-password" : "current-password"}
        textContentType={mode === "register" ? "newPassword" : "password"}
        editable={!busy}
        hint={mode === "register" ? "At least 8 characters." : undefined}
        onSubmitEditing={() => void submit()}
      />
      {mode === "register" ? (
        <>
          <View style={styles.row}>
            <Switch
              accessibilityLabel="Accept Terms of Service and Privacy Policy"
              value={accepted}
              onValueChange={setAccepted}
              disabled={busy}
              trackColor={{ true: colors.gold, false: colors.border }}
            />
            <Text style={[styles.copy, styles.grow]}>
              I agree to the Terms of Service and Privacy Policy.
            </Text>
          </View>
          <View style={styles.row}>
            <Action
              title="Read Terms"
              secondary
              compact
              onPress={() => void openWeb("/terms").catch(reportLink)}
            />
            <Action
              title="Privacy Policy"
              secondary
              compact
              onPress={() => void openWeb("/privacy").catch(reportLink)}
            />
          </View>
        </>
      ) : null}
      <Action
        title={mode === "login" ? "Sign in" : "Create account"}
        loading={busy}
        onPress={() => void submit()}
      />
      {mode === "login" ? (
        <Action
          title="Forgot password?"
          secondary
          onPress={() => void openWeb("/login?mode=reset").catch(reportLink)}
        />
      ) : null}
    </ScrollView>
  );
}
const emptyInput: NativeProfileInput = {
  brand: "",
  model: "",
  serial: "",
  serialNotUsed: false,
  instrumentType: "Guitar",
  year: "",
  condition: "used",
  visibility: "private",
  showSerialPublic: false,
  location: "",
  summary: "",
};
function Create({
  actorId,
  displayName,
  onCreated,
  leaveGuardRef,
}: {
  actorId: string;
  displayName: string;
  onCreated: (code: string) => void;
  leaveGuardRef: React.RefObject<null | (() => Promise<void>)>;
}) {
  const controller = useMemo(
    () => createProfileDraftController(actorId),
    [actorId],
  );
  const [state, setState] = useState(() => controller.getState()),
    [input, setInput] = useState<NativeProfileInput>({
      ...emptyInput,
      ownerName: displayName,
    }),
    [photos, setPhotos] = useState<NativePhoto[]>([]),
    [ready, setReady] = useState(false),
    [localError, setLocalError] = useState(""),
    [selecting, setSelecting] = useState(false);
  const mounted = useRef(true),
    pickerBusy = useRef(false),
    autosaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
      undefined,
    ),
    lifetime = useRef(new AbortController());
  const mutations = useMemo(() => createUiMutationQueue(), []);
  const photoPicker = useMemo(() => Platform.OS === "android" ? getNativePhotoPicker() : null, []);
  const submitting = useSyncExternalStore(
    mutations.subscribe,
    mutations.getBusy,
    mutations.getBusy,
  );
  const locked = !!state.draft?.frozenBody;
  const latest = useRef({ input, photos, ready });
  useEffect(() => {
    latest.current = { input, photos, ready };
  }, [input, photos, ready]);
  const restoreDraft = useCallback(async () => {
    let draft = await controller.loadDraft();
    if (photoPicker) draft = await photoPicker.recover(actorId, controller, lifetime.current.signal) || draft;
    if (!mounted.current) return;
    if (draft) { setInput(draft.input); setPhotos(draft.photos); }
    setReady(true);
  }, [actorId, controller, photoPicker]);
  const flushEditableDraft = useCallback(async () => {
    clearTimeout(autosaveTimer.current);
    await waitForDraftIdle(controller, lifetime.current.signal);
    const current = controller.getState().draft;
    if (latest.current.ready && !current?.frozenBody && !current?.uncertain && !current?.result && (
      !current || JSON.stringify(current.input) !== JSON.stringify(latest.current.input) ||
      current.photos.length !== latest.current.photos.length || current.photos.some((photo, index) => photo !== latest.current.photos[index])
    )) await controller.saveDraft(latest.current.input, latest.current.photos);
  }, [controller]);
  useEffect(() => {
    const lifetimeController = lifetime.current;
    mounted.current = true;
    const unsub = controller.subscribe(setState);
    void restoreDraft()
      .catch((error) => {
        if (mounted.current) setLocalError(messageOf(error));
      });
    return () => {
      mounted.current = false;
      lifetimeController.abort();
      unsub();
      controller.dispose();
    };
  }, [controller, restoreDraft]);
  useEffect(() => {
    if (!photoPicker || !ready) return;
    const subscription = AppState.addEventListener("change", next => {
      if (next !== "active" || pickerBusy.current || mutations.getBusy()) return;
      pickerBusy.current = true; setSelecting(true);
      void mutations.run(async () => {
        await flushEditableDraft();
        const draft = await photoPicker.recover(actorId, controller, lifetime.current.signal);
        if (mounted.current && draft) { setInput(draft.input); setPhotos(draft.photos); }
      }).catch(error => { if (mounted.current) setLocalError(messageOf(error)); })
        .finally(() => { pickerBusy.current = false; if (mounted.current) setSelecting(false); });
    });
    return () => subscription.remove();
  }, [actorId, controller, flushEditableDraft, mutations, photoPicker, ready]);
  useEffect(() => {
    if (!ready || locked) return;
    const pending = new AbortController();
    const timer = setTimeout(() => {
      void waitForDraftIdle(controller, pending.signal)
        .then(() => {
          if (!mutations.getBusy() && !pending.signal.aborted)
            return controller.saveDraft(input, photos);
        })
        .catch((error) => {
          if (mounted.current && !pending.signal.aborted)
            setLocalError(messageOf(error));
        });
    }, 600);
    autosaveTimer.current = timer;
    return () => {
      clearTimeout(timer);
      pending.abort();
    };
  }, [controller, input, photos, ready, locked, mutations]);
  useEffect(() => {
    const guard = () => {
      if (pickerBusy.current)
        return Promise.reject(
          new Error(
            "Finish choosing or canceling your photo selection before leaving this screen.",
          ),
        );
      return mutations.run(async () => {
        clearTimeout(autosaveTimer.current);
        await waitForDraftIdle(controller, lifetime.current.signal);
        const current = controller.getState().draft;
        if (latest.current.ready && !current?.frozenBody && !current?.result)
          await controller.saveDraft(
            latest.current.input,
            latest.current.photos,
          );
      });
    };
    leaveGuardRef.current = guard;
    return () => {
      if (leaveGuardRef.current === guard) leaveGuardRef.current = null;
    };
  }, [controller, leaveGuardRef, mutations]);
  function change<K extends keyof NativeProfileInput>(
    key: K,
    value: NativeProfileInput[K],
  ) {
    if (mutations.getBusy()) return;
    setInput((old) => ({ ...old, [key]: value }));
    setLocalError("");
  }
  async function choosePhoto() {
    if (
      pickerBusy.current ||
      mutations.getBusy() ||
      locked ||
      submitting ||
      photos.length >= MAX_NATIVE_PHOTOS
    )
      return;
    pickerBusy.current = true;
    setSelecting(true);
    setLocalError("");
    try {
      if (photoPicker) {
        const draft = await mutations.run(async () => {
          await flushEditableDraft();
          return photoPicker.pick(actorId, controller, latest.current.input, latest.current.photos, lifetime.current.signal);
        });
        if (mounted.current && draft) { setInput(draft.input); setPhotos(draft.photos); }
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: true,
        selectionLimit: Math.max(1, MAX_NATIVE_PHOTOS - photos.length),
        quality: 0.85,
        base64: true,
        exif: false,
      });
      if (!mounted.current || result.canceled) return;
      const next = result.assets.map(photoFromPickerAsset);
      setPhotos((old) => [...old, ...next].slice(0, MAX_NATIVE_PHOTOS));
    } catch (error) {
      if (mounted.current) setLocalError(messageOf(error));
    } finally {
      pickerBusy.current = false;
      if (mounted.current) setSelecting(false);
    }
  }
  async function save() {
    if (mutations.getBusy()) return;
    clearTimeout(autosaveTimer.current);
    setLocalError("");
    try {
      const result = await mutations.run(async () => {
        await waitForDraftIdle(controller, lifetime.current.signal);
        return locked
          ? controller.createOrRetry()
          : controller.createOrRetry(input, photos);
      });
      if (mounted.current) onCreated(result.qrCode);
    } catch (error) {
      if (mounted.current) setLocalError(messageOf(error));
    }
  }
  function discard() {
    Alert.alert(
      "Discard this draft?",
      "Selected photos and unsaved details will be removed from this draft.",
      [
        { text: "Keep draft", style: "cancel" },
        {
          text: "Discard",
          style: "destructive",
          onPress: () => {
            void discardConfirmed();
          },
        },
      ],
    );
  }
  async function discardConfirmed() {
    if (mutations.getBusy()) return;
    clearTimeout(autosaveTimer.current);
    setLocalError("");
    try {
      await mutations.run(async () => {
        await waitForDraftIdle(controller, lifetime.current.signal);
        await controller.discardDraft();
      });
      if (mounted.current) {
        setInput({ ...emptyInput, ownerName: displayName });
        setPhotos([]);
      }
    } catch (error) {
      if (mounted.current) setLocalError(messageOf(error));
    }
  }
  function discardPendingSelection() {
    if (!photoPicker) return;
    Alert.alert("Discard pending photo selection?", "Only the pending photo selection will be removed. Your saved draft and any Profile save attempt will be kept.", [
      { text: "Keep selection", style: "cancel" },
      { text: "Discard selection", style: "destructive", onPress: () => {
        void mutations.run(async () => {
          await flushEditableDraft();
          await photoPicker.discard(actorId, lifetime.current.signal);
          await restoreDraft();
          if (mounted.current) setLocalError("");
        }).catch(error => { if (mounted.current) setLocalError(messageOf(error)); });
      } }
    ]);
  }

  if (!ready)
    return (
      <View style={styles.center}>
        <Text style={styles.copy}>{localError || "Restoring your draft…"}</Text>
        {localError ? (
          <Action
            title="Try restoring again"
            onPress={() => {
              setLocalError("");
              void restoreDraft()
                .catch((e) => {
                  if (mounted.current) setLocalError(messageOf(e));
                });
            }}
          />
        ) : (
          <ActivityIndicator color={colors.gold} />
        )}
        {localError && photoPicker ? <Action title="Discard pending photo selection" secondary onPress={discardPendingSelection} disabled={submitting} /> : null}
      </View>
    );
  if (state.draft?.result)
    return (
      <ScrollView contentContainerStyle={styles.content}>
        <Heading
          eyebrow="Profile created"
          title="The story has a home."
          copy={state.draft.result.message || "Your Profile is saved."}
        />
        <Action
          title="Open saved Profile"
          onPress={() => onCreated(state.draft!.result!.qrCode)}
        />
        <Action
          title="Start another Profile"
          secondary
          loading={submitting}
          onPress={() => void discardConfirmed()}
        />
        {localError ? <Notice error message={localError} /> : null}
      </ScrollView>
    );
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.content}
    >
      <Heading
        eyebrow="A permanent home for its history"
        title="Create a Profile"
        copy="Start with a clear photo and the instrument’s identity. You can add more details later."
      />
      {localError || state.error ? (
        <Notice error message={localError || state.error} />
      ) : null}
      {localError && photoPicker ? <Action title="Discard pending photo selection" secondary onPress={discardPendingSelection} disabled={submitting || selecting} /> : null}
      {state.draft?.uncertain ? (
        <Notice message="The previous save is not confirmed. Retry that same save before changing or discarding this draft." />
      ) : null}
      <View style={styles.card}>
        <Text accessibilityRole="header" style={styles.h2}>
          Photos · {photos.length}/{MAX_NATIVE_PHOTOS}
        </Text>
        <Text style={styles.small}>
          The first photo becomes the cover. Choose photos up to{" "}
          {Math.round(MAX_NATIVE_IMAGE_BYTES / 1024 / 1024)} MB each, up to 16
          MB total per draft.
        </Text>
        <View style={styles.wrap}>
          {photos.map((photo, index) => (
            <View key={photo.id} style={local.photoTile}>
              <Image
                source={{ uri: photo.dataUrl }}
                style={local.thumbnail}
                contentFit="cover"
                cachePolicy="none"
                accessibilityLabel={"Selected photo " + (index + 1)}
              />
              <Text style={styles.small}>
                {index === 0 ? "Cover photo" : "Photo " + (index + 1)}
              </Text>
              <Action
                title={"Remove photo " + (index + 1)}
                secondary
                compact
                disabled={locked || submitting}
                onPress={() =>
                  setPhotos((old) => old.filter((p) => p.id !== photo.id))
                }
              />
              {index > 0 ? (
                <Action
                  title="Make cover"
                  secondary
                  compact
                  disabled={locked || submitting}
                  onPress={() =>
                    setPhotos((old) => [
                      photo,
                      ...old.filter((p) => p.id !== photo.id),
                    ])
                  }
                />
              ) : null}
            </View>
          ))}
        </View>
        <Action
          title="Choose photos"
          secondary
          disabled={photos.length >= MAX_NATIVE_PHOTOS || locked || submitting}
          loading={selecting}
          onPress={() => void choosePhoto()}
        />
      </View>
      <Field
        label="Brand"
        value={input.brand}
        onChangeText={(value) => change("brand", value)}
        editable={!locked && !submitting}
        placeholder="Fender"
        maxLength={120}
      />
      <Field
        label="Model"
        value={input.model}
        onChangeText={(value) => change("model", value)}
        editable={!locked && !submitting}
        placeholder="Stratocaster"
        maxLength={160}
      />
      <Field
        label="Instrument type"
        value={input.instrumentType}
        onChangeText={(value) => change("instrumentType", value)}
        editable={!locked && !submitting}
        placeholder="Guitar, bass, amplifier…"
        maxLength={80}
      />
      <View style={styles.row}>
        <Switch
          accessibilityLabel="This instrument has no serial number"
          value={input.serialNotUsed}
          onValueChange={(value) => change("serialNotUsed", value)}
          disabled={locked || submitting}
          trackColor={{ true: colors.gold, false: colors.border }}
        />
        <Text style={[styles.copy, styles.grow]}>
          This instrument has no serial number
        </Text>
      </View>
      {!input.serialNotUsed ? (
        <Field
          label="Serial number"
          value={input.serial}
          onChangeText={(value) => change("serial", value)}
          editable={!locked && !submitting}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={64}
          hint="Read it directly from the instrument. It stays hidden from public view by default."
        />
      ) : null}
      <Field
        label="Year (optional)"
        value={input.year}
        onChangeText={(value) => change("year", value)}
        editable={!locked && !submitting}
        keyboardType="number-pad"
        maxLength={4}
        placeholder="1991"
      />
      <Field
        label="Your display name"
        value={input.ownerName}
        onChangeText={(value) => change("ownerName", value)}
        editable={!locked && !submitting}
        maxLength={120}
      />
      <Field
        label="Location (optional)"
        value={input.location}
        onChangeText={(value) => change("location", value)}
        editable={!locked && !submitting}
        placeholder="City or region — no street address needed"
        maxLength={160}
      />
      <Field
        label="About this instrument (optional)"
        value={input.summary}
        onChangeText={(value) => change("summary", value)}
        editable={!locked && !submitting}
        multiline
        maxLength={3000}
      />
      <View style={styles.card}>
        <Text accessibilityRole="header" style={styles.h2}>
          Who can see it?
        </Text>
        {(["private", "unlisted", "public"] as const).map((value) => (
          <Pressable
            key={value}
            accessibilityRole="radio"
            accessibilityState={{
              checked: input.visibility === value,
              disabled: locked || submitting,
            }}
            disabled={locked || submitting}
            onPress={() => change("visibility", value)}
            style={[local.option, input.visibility === value && local.selected]}
          >
            <Text style={styles.label}>
              {value === "private"
                ? "Private"
                : value === "unlisted"
                  ? "Unlisted"
                  : "Public"}
            </Text>
            <Text style={styles.small}>
              {value === "private"
                ? "Only you can view the Profile."
                : value === "unlisted"
                  ? "Anyone with the link can view it. It is absent from the Catalog."
                  : "Anyone can view it and find it in the Catalog."}
            </Text>
          </Pressable>
        ))}
        <View style={styles.row}>
          <Switch
            accessibilityLabel="Show serial number publicly"
            value={input.showSerialPublic === true}
            onValueChange={(value) => change("showSerialPublic", value)}
            disabled={locked || submitting || input.serialNotUsed}
            trackColor={{ true: colors.gold, false: colors.border }}
          />
          <Text style={[styles.copy, styles.grow]}>
            Show the serial number publicly
          </Text>
        </View>
      </View>
      <Action
        title={locked ? "Retry the same save" : "Create Profile"}
        loading={submitting}
        disabled={selecting}
        onPress={() => void save()}
      />
      <Action
        title="Discard draft"
        secondary
        disabled={submitting || locked || selecting}
        onPress={discard}
      />
      <Text style={styles.small}>
        Your draft stays on this device. A Profile is saved only after the
        server confirms it. Public beta includes up to 25 Profiles for standard
        accounts.
      </Text>
    </ScrollView>
  );
}
export default function App() {
  const { auth, snapshot } = useAuth();
  const [route, commitRoute] = useState<Route>({ name: "browse" }),
    [active, setActive] = useState(AppState.currentState === "active"),
    [notice, setNotice] = useState("");
  const leaveGuardRef = useRef<null | (() => Promise<void>)>(null),
    navigating = useRef(false);
  const actor =
      snapshot.status === "signed-in"
        ? snapshot.session?.user.id || null
        : null,
    previousActor = useRef<string | null>(null),
    routeRef = useRef(route);
  useEffect(() => {
    routeRef.current = route;
  }, [route]);
  const setRoute = useCallback(
    (next: Route) => {
      if (navigating.current) return;
      if (routeRef.current.name !== "create" || !leaveGuardRef.current) {
        commitRoute(next);
        return;
      }
      navigating.current = true;
      const revision = auth.getSnapshot().revision;
      void leaveGuardRef
        .current()
        .then(() => {
          if (auth.getSnapshot().revision === revision) commitRoute(next);
        })
        .catch((error) => setNotice(messageOf(error)))
        .finally(() => {
          navigating.current = false;
        });
    },
    [auth],
  );

  useEffect(() => {
    if (actor !== previousActor.current) {
      previousActor.current = actor;
      const current = routeRef.current;
      if (current.name === "login" && actor) commitRoute({ name: "library" });
      else if (
        current.name === "library" ||
        current.name === "create" ||
        (current.name === "record" && current.mine)
      )
        commitRoute({ name: actor ? "library" : "browse" });
    }
  }, [actor]);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) =>
      setActive(state === "active"),
    );
    return () => sub.remove();
  }, []);
  useEffect(() => {
    let mounted = true;
    const accept = (url: string | null) => {
      if (!mounted || !url) return;
      const code = parseQrInput(url);
      if (code) setRoute({ name: "record", code, mine: false });
      else if (
        !url.startsWith("http://127.0.0.1:3014") &&
        !/^exp(?:s)?:/.test(url)
      )
        setNotice(
          "This link is not a QRguitar Profile. Use Scan to enter its ID.",
        );
    };
    void Linking.getInitialURL()
      .then(accept)
      .catch(() => {
        if (mounted)
          setNotice(
            "The app link could not be opened. Enter the QRguitar ID in Scan.",
          );
      });
    const sub = Linking.addEventListener("url", ({ url }) => accept(url));
    return () => {
      mounted = false;
      sub.remove();
    };
  }, [setRoute]);
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (routeRef.current.name === "browse") return false;
      setRoute({
        name:
          routeRef.current.name === "record" && routeRef.current.mine
            ? "library"
            : "browse",
      });
      return true;
    });
    return () => sub.remove();
  }, [setRoute]);
  function create() {
    setRoute({ name: actor ? "create" : "login" });
  }
  async function signOut() {
    commitRoute({ name: "browse" });
    try {
      await auth.signOut();
    } catch (error) {
      setNotice(messageOf(error));
    }
  }
  const privateRoute =
    route.name === "login" ||
    route.name === "library" ||
    route.name === "create" ||
    (route.name === "record" && route.mine);
  let screen: React.ReactNode;
  if (route.name === "browse")
    screen = (
      <Browse
        onOpen={(code) => setRoute({ name: "record", code, mine: false })}
        onScan={() => setRoute({ name: "scan" })}
        onCreate={create}
      />
    );
  else if (route.name === "scan")
    screen = (
      <Scanner
        onProfile={(code) => setRoute({ name: "record", code, mine: false })}
      />
    );
  else if (route.name === "login") screen = <Login />;
  else if (route.name === "library")
    screen = (
      <Library
        key={actor + ":" + snapshot.revision}
        snapshot={snapshot}
        onSignIn={() => setRoute({ name: "login" })}
        onCreate={create}
        onOpen={(code) => setRoute({ name: "record", code, mine: true })}
        onSignOut={() => void signOut()}
      />
    );
  else if (route.name === "create")
    screen = actor ? (
      <Create
        leaveGuardRef={leaveGuardRef}
        key={actor + ":" + snapshot.revision}
        actorId={actor}
        displayName={String(
          snapshot.session?.user.user_metadata?.display_name || "",
        )}
        onCreated={(code) => setRoute({ name: "record", code, mine: true })}
      />
    ) : (
      <ScrollView contentContainerStyle={styles.content}>
        <SignInGate
          snapshot={snapshot}
          onSignIn={() => setRoute({ name: "login" })}
        />
      </ScrollView>
    );
  else if (route.name === "record")
    screen =
      route.mine && !actor ? (
        <ScrollView contentContainerStyle={styles.content}>
          <SignInGate
            snapshot={snapshot}
            onSignIn={() => setRoute({ name: "login" })}
          />
        </ScrollView>
      ) : (
        <Profile
          active={active}
          key={route.code + ":" + route.mine + ":" + snapshot.revision}
          code={route.code}
          mine={route.mine}
          snapshot={snapshot}
          onLibrary={() => setRoute({ name: "library" })}
        />
      );
  else screen = null;
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.screen}>
        <StatusBar style="light" />
        <View style={local.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="QRguitar home"
            onPress={() => setRoute({ name: "browse" })}
          >
            <Text style={local.brand}>
              QRguitar<Text style={local.brandDot}>.</Text>
            </Text>
          </Pressable>
          {!["browse", "library", "scan"].includes(route.name) ? (
            <Action
              title="Back"
              secondary
              compact
              onPress={() => setRoute({ name: actor ? "library" : "browse" })}
            />
          ) : (
            <Text style={styles.small}>The story stays.</Text>
          )}
        </View>
        {notice ? (
          <View style={local.banner}>
            <Notice message={notice} error />
            <Action
              title="Dismiss message"
              compact
              secondary
              onPress={() => setNotice("")}
            />
          </View>
        ) : null}
        <KeyboardAvoidingView
          accessibilityElementsHidden={!active && privateRoute}
          importantForAccessibility={
            !active && privateRoute ? "no-hide-descendants" : "auto"
          }
          style={[styles.grow, !active && privateRoute && { opacity: 0 }]}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          {screen}
        </KeyboardAvoidingView>
        {!active && privateRoute ? (
          <View
            style={[
              StyleSheet.absoluteFill,
              styles.center,
              { backgroundColor: colors.background },
            ]}
          >
            <Text style={styles.h2}>QRguitar</Text>
            <Text style={styles.copy}>
              Return to the app to view your instruments.
            </Text>
          </View>
        ) : null}
        <View style={local.tabs}>
          {(
            [
              { name: "browse", label: "Explore", symbol: "◈" },
              { name: "scan", label: "Scan", symbol: "⊞" },
              { name: "library", label: "My instruments", symbol: "▥" },
            ] as const
          ).map((tab) => (
            <Pressable
              key={tab.name}
              accessibilityRole="tab"
              accessibilityState={{ selected: route.name === tab.name }}
              onPress={() => setRoute({ name: tab.name })}
              style={local.tab}
            >
              <Text
                style={[
                  local.tabIcon,
                  route.name === tab.name && local.activeTab,
                ]}
              >
                {tab.symbol}
              </Text>
              <Text
                style={[
                  local.tabLabel,
                  route.name === tab.name && local.activeTab,
                ]}
              >
                {tab.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
const local = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  brand: {
    fontSize: 27,
    fontWeight: "800",
    color: colors.ink,
    letterSpacing: -1,
  },
  brandDot: { color: colors.gold },
  banner: { padding: 12, gap: 8 },
  tabs: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    gap: 3,
    minHeight: 66,
  },
  tabIcon: { fontSize: 23, color: colors.muted },
  tabLabel: { fontSize: 12, color: colors.muted, fontWeight: "700" },
  activeTab: { color: colors.gold },
  recordCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: colors.surface,
  },
  cardPhoto: { height: 220, width: "100%", backgroundColor: colors.surface },
  recordCopy: { padding: 18, gap: 10 },
  openLink: {
    color: colors.gold,
    fontWeight: "700",
    fontSize: 14,
    marginTop: 4,
  },
  largePhoto: {
    height: 330,
    width: "100%",
    borderRadius: 16,
    backgroundColor: colors.surface,
  },
  photoPlaceholder: { alignItems: "center", justifyContent: "center" },
  detailRow: {
    gap: 4,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 12,
  },
  detailValue: { color: colors.ink, fontSize: 16, lineHeight: 24 },
  history: {
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 18,
  },
  photoTile: { width: 150, gap: 8 },
  thumbnail: { width: 150, height: 130, borderRadius: 12 },
  option: {
    padding: 16,
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
  },
  selected: { borderColor: colors.gold, backgroundColor: "#29241A" },
});

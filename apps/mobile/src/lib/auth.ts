import "react-native-url-polyfill/auto";
import { AppState, Platform } from "react-native";
import {
  createClient,
  type Session,
  type SupabaseClient,
} from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import { Directory, File, Paths } from "expo-file-system";
import {
  getNativeRuntimeEnvironment,
  isOfflineAcceptanceEnvironment,
} from "./runtime-environment";

export interface PersistentStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}
export interface EncryptedStorageBackend {
  digest(value: string): Promise<string>;
  randomId(): string;
  seal(value: string): Promise<{ key: string; ciphertext: Uint8Array }>;
  open(ciphertext: Uint8Array, key: string): Promise<string>;
  readPointer(key: string): Promise<string | null>;
  writePointer(key: string, value: string): Promise<void>;
  removePointer(key: string): Promise<void>;
  readFile(id: string): Promise<Uint8Array>;
  writeFile(id: string, value: Uint8Array): Promise<void>;
  removeFile(id: string): Promise<void>;
}

/** The encrypted file is durable before its small SecureStore pointer commits.
 * Pointer operations serialize with deletes, so a late refresh cannot resurrect logout. */
export function createEncryptedStorage(
  backend: EncryptedStorageBackend,
): PersistentStorage {
  let tail: Promise<unknown> = Promise.resolve();
  const run = <T>(fn: () => Promise<T>): Promise<T> => {
    const result = tail.then(fn, fn);
    tail = result.catch(() => {});
    return result;
  };
  const parse = (raw: string) => {
    const entry = JSON.parse(raw) as {
      v?: unknown;
      id?: unknown;
      key?: unknown;
    };
    if (
      entry.v !== 1 ||
      typeof entry.id !== "string" ||
      !/^[a-zA-Z0-9-]{12,80}$/.test(entry.id) ||
      typeof entry.key !== "string" ||
      !/^[a-fA-F0-9]{64}$/.test(entry.key)
    )
      throw new Error("Saved secure data is unreadable.");
    return { id: entry.id, key: entry.key };
  };
  const pointerKey = async (key: string) =>
    "qrguitar.secure." + (await backend.digest(key));
  return {
    getItem: (key) =>
      run(async () => {
        const raw = await backend.readPointer(await pointerKey(key));
        if (raw === null) return null;
        const entry = parse(raw);
        // Missing/corrupt encrypted data must be an explicit error, never an empty account/draft.
        return backend.open(await backend.readFile(entry.id), entry.key);
      }),
    setItem: (key, value) =>
      run(async () => {
        const pointer = await pointerKey(key);
        const oldRaw = await backend.readPointer(pointer);
        const old = oldRaw === null ? null : parse(oldRaw);
        const id = backend.randomId();
        const sealed = await backend.seal(value);
        await backend.writeFile(id, sealed.ciphertext);
        if (
          (await backend.open(await backend.readFile(id), sealed.key)) !== value
        )
          throw new Error("Secure save verification failed.");
        // A native pointer write may complete before reporting an error. Retain its encrypted file in that case.
        await backend.writePointer(
          pointer,
          JSON.stringify({ v: 1, id, key: sealed.key }),
        );
        if (old) await backend.removeFile(old.id).catch(() => {});
      }),
    removeItem: (key) =>
      run(async () => {
        const pointer = await pointerKey(key);
        const raw = await backend.readPointer(pointer);
        await backend.removePointer(pointer);
        // Pointer removal is the commit. Corrupt metadata/cleanup cannot turn a committed logout into failure.
        if (raw) {
          try {
            await backend.removeFile(parse(raw).id);
          } catch {
            /* Encrypted orphan only. */
          }
        }
      }),
  };
}

// UTF-8 helpers keep this adapter independent of optional Hermes TextEncoder polyfills.
export function encodeUtf8(value: string): Uint8Array {
  let byteLength = 0;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 128) byteLength++;
    else if (code < 2048) byteLength += 2;
    else if (
      code >= 0xd800 &&
      code <= 0xdbff &&
      value.charCodeAt(i + 1) >= 0xdc00 &&
      value.charCodeAt(i + 1) <= 0xdfff
    ) {
      byteLength += 4;
      i++;
    } else byteLength += 3;
  }
  const out = new Uint8Array(byteLength);
  let offset = 0;
  for (let i = 0; i < value.length; i++) {
    let point = value.charCodeAt(i);
    if (
      point >= 0xd800 &&
      point <= 0xdbff &&
      value.charCodeAt(i + 1) >= 0xdc00 &&
      value.charCodeAt(i + 1) <= 0xdfff
    )
      point =
        0x10000 + ((point - 0xd800) << 10) + value.charCodeAt(++i) - 0xdc00;
    else if (point >= 0xd800 && point <= 0xdfff) point = 0xfffd;
    if (point < 128) out[offset++] = point;
    else if (point < 2048) {
      out[offset++] = 192 | (point >> 6);
      out[offset++] = 128 | (point & 63);
    } else if (point < 65536) {
      out[offset++] = 224 | (point >> 12);
      out[offset++] = 128 | ((point >> 6) & 63);
      out[offset++] = 128 | (point & 63);
    } else {
      out[offset++] = 240 | (point >> 18);
      out[offset++] = 128 | ((point >> 12) & 63);
      out[offset++] = 128 | ((point >> 6) & 63);
      out[offset++] = 128 | (point & 63);
    }
  }
  return out;
}
export function decodeUtf8(bytes: Uint8Array): string {
  const parts: string[] = [];
  let chunk = "";
  for (let i = 0; i < bytes.length; ) {
    const head = bytes[i++];
    let point: number;
    if (head < 128) point = head;
    else {
      const count = head >= 240 ? 3 : head >= 224 ? 2 : head >= 192 ? 1 : -1;
      if (count < 0 || head > 244 || i + count > bytes.length)
        throw new Error("Invalid secure data encoding.");
      point = head & (count === 3 ? 7 : count === 2 ? 15 : 31);
      for (let n = 0; n < count; n++) {
        const next = bytes[i++];
        if ((next & 192) !== 128)
          throw new Error("Invalid secure data encoding.");
        point = (point << 6) | (next & 63);
      }
      if (
        point > 0x10ffff ||
        (point >= 0xd800 && point <= 0xdfff) ||
        point < (count === 3 ? 65536 : count === 2 ? 2048 : 128)
      )
        throw new Error("Invalid secure data encoding.");
    }
    chunk += String.fromCodePoint(point);
    if (chunk.length > 8192) {
      parts.push(chunk);
      chunk = "";
    }
  }
  parts.push(chunk);
  return parts.join("");
}

let sharedStorage: PersistentStorage | undefined;
export function getNativeStorage(): PersistentStorage {
  if (sharedStorage) return sharedStorage;
  if (Platform.OS === "web") {
    // Browser preview intentionally has no native credentials/files. The full website owns browser persistence.
    const values = new Map<string, string>();
    sharedStorage = {
      getItem: async (key) => values.get(key) ?? null,
      setItem: async (key, value) => {
        values.set(key, value);
      },
      removeItem: async (key) => {
        values.delete(key);
      },
    };
    return sharedStorage;
  }
  const directory = () => {
    const dir = new Directory(Paths.document, "qrguitar-secure-v1");
    dir.create({ idempotent: true, intermediates: true });
    return dir;
  };
  sharedStorage = createEncryptedStorage({
    digest: (value) =>
      Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value),
    randomId: () => Crypto.randomUUID(),
    seal: async (value) => {
      const key = await Crypto.AESEncryptionKey.generate();
      const encrypted = await Crypto.aesEncryptAsync(encodeUtf8(value), key);
      return {
        key: await key.encoded("hex"),
        ciphertext: await encrypted.combined(),
      };
    },
    open: async (ciphertext, hex) => {
      const key = await Crypto.AESEncryptionKey.import(hex, "hex");
      return decodeUtf8(
        await Crypto.aesDecryptAsync(
          Crypto.AESSealedData.fromCombined(ciphertext),
          key,
        ),
      );
    },
    readPointer: (key) => SecureStore.getItemAsync(key),
    writePointer: (key, value) =>
      SecureStore.setItemAsync(key, value, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      }),
    removePointer: (key) => SecureStore.deleteItemAsync(key),
    readFile: async (id) => new File(directory(), id + ".bin").bytes(),
    writeFile: async (id, bytes) => {
      const file = new File(directory(), id + ".bin");
      file.create();
      file.write(bytes);
    },
    removeFile: async (id) => {
      const file = new File(directory(), id + ".bin");
      if (file.exists) file.delete();
    },
  });
  return sharedStorage;
}

export type NativeAuthSnapshot = {
  status: "loading" | "signed-in" | "signed-out" | "error" | "unconfigured";
  session: Session | null;
  revision: number;
  message: string;
};
export type AuthLease = {
  actorId: string;
  revision: number;
  accessToken: string;
};
export class NativeSessionChangedError extends Error {
  readonly code = "session_changed";
  constructor() {
    super("Your account session changed. Open this screen again to continue.");
    this.name = "NativeSessionChangedError";
  }
}
export interface NativeAuth {
  start(): () => void;
  subscribe(listener: (snapshot: NativeAuthSnapshot) => void): () => void;
  getSnapshot(): NativeAuthSnapshot;
  signIn(email: string, password: string): Promise<void>;
  signUp(
    email: string,
    password: string,
    displayName: string,
  ): Promise<{ requiresEmailConfirmation: boolean }>;
  signOut(): Promise<void>;
  retry(): Promise<void>;
  acquireSession(expectedActorId?: string): Promise<AuthLease>;
  isCurrent(lease: AuthLease): boolean;
}
export interface AuthDependencies {
  storage: PersistentStorage;
  clientFactory(storage: PersistentStorage): SupabaseClient;
  appState: {
    currentState: string;
    addEventListener(
      event: "change",
      listener: (state: string) => void,
    ): { remove(): void };
  };
  timeoutMs?: number;
  configurationError?: string;
}
const AUTH_KEY = "qrguitar.auth.session";
export function withDeadline<T>(
  promise: Promise<T>,
  milliseconds = 15000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(
          new Error(
            "The request timed out. Check your connection and try again.",
          ),
        ),
      milliseconds,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
export function createNativeAuth(deps: AuthDependencies): NativeAuth {
  let snapshot: NativeAuthSnapshot = {
    status: deps.configurationError ? "unconfigured" : "loading",
    session: null,
    revision: 0,
    message: deps.configurationError || "",
  };
  const listeners = new Set<(state: NativeAuthSnapshot) => void>();
  let generation = 0;
  let sessionEvent = 0;
  let client: SupabaseClient | null = null;
  let subscription: { unsubscribe(): void } | null = null;
  let appSubscription: { remove(): void } | null = null;
  let starts = 0;
  let operation = false;
  let mustClearLogout = false;
  const emit = (next: NativeAuthSnapshot) => {
    snapshot = next;
    listeners.forEach((listener) => listener(snapshot));
  };
  const applySession = (session: Session | null, force = false) => {
    const changed = force || snapshot.session?.user.id !== session?.user.id;
    emit({
      status: session ? "signed-in" : "signed-out",
      session,
      revision: snapshot.revision + (changed ? 1 : 0),
      message: "",
    });
  };
  const retire = () => {
    generation++;
    sessionEvent++;
    subscription?.unsubscribe();
    subscription = null;
    const previous = client;
    client = null;
    if (previous) void previous.auth.stopAutoRefresh();
    return previous;
  };
  const refreshState = (state: string) => {
    if (!client) return;
    if (state === "active") void client.auth.startAutoRefresh();
    else void client.auth.stopAutoRefresh();
  };
  const ensureClient = () => {
    if (deps.configurationError) throw new Error(deps.configurationError);
    if (mustClearLogout)
      throw new Error(
        "Local sign-out could not be saved. Retry sign-out before continuing.",
      );
    if (client) return client;
    const current = ++generation;
    // Stale clients cannot persist token refreshes after logout/account replacement.
    const storage: PersistentStorage = {
      getItem: (key) =>
        current === generation
          ? deps.storage.getItem(key)
          : Promise.resolve(null),
      setItem: (key, value) =>
        current === generation
          ? deps.storage.setItem(key, value)
          : Promise.resolve(),
      removeItem: (key) =>
        current === generation
          ? deps.storage.removeItem(key)
          : Promise.resolve(),
    };
    client = deps.clientFactory(storage);
    subscription = client.auth.onAuthStateChange((_event, session) => {
      if (current !== generation) return;
      sessionEvent++;
      if (!operation) applySession(session);
    }).data.subscription;
    if (starts) refreshState(deps.appState.currentState);
    return client;
  };
  const initialize = async () => {
    if (deps.configurationError) return;
    if (mustClearLogout) {
      await auth.signOut();
      return;
    }
    let current = generation;
    let event = sessionEvent;
    try {
      const active = ensureClient();
      current = generation;
      event = sessionEvent;
      emit({ ...snapshot, status: "loading", message: "" });
      const { data, error } = await withDeadline(
        active.auth.getSession(),
        deps.timeoutMs,
      );
      if (current !== generation || event !== sessionEvent || operation) return;
      if (error) throw error;
      applySession(data.session);
    } catch (error) {
      if (current !== generation || event !== sessionEvent) return;
      emit({
        status: "error",
        session: null,
        revision: snapshot.revision + 1,
        message:
          error instanceof Error
            ? error.message
            : "Could not restore your session. Try again.",
      });
    }
  };
  const authenticate = async (
    action: (
      active: SupabaseClient,
    ) => Promise<{ data: { session: Session | null }; error: unknown }>,
  ) => {
    if (operation)
      throw new Error("An account request is already in progress.");
    operation = true;
    let current = generation;
    try {
      const active = ensureClient();
      current = generation;
      const result = await withDeadline(action(active), deps.timeoutMs);
      if (current !== generation) throw new NativeSessionChangedError();
      if (result.error) throw result.error;
      applySession(result.data.session, true);
      return result.data.session;
    } catch (error) {
      if (current === generation) {
        retire();
        mustClearLogout = true;
        try {
          await deps.storage.removeItem(AUTH_KEY);
          mustClearLogout = false;
        } catch {
          /* Visible retry below. */
        }
        emit({
          status: "error",
          session: null,
          revision: snapshot.revision + 1,
          message: mustClearLogout
            ? "Local session cleanup failed. Retry sign-out before continuing."
            : error instanceof Error
              ? error.message
              : "Account request failed. Please try again.",
        });
      }
      throw error;
    } finally {
      operation = false;
    }
  };
  const auth: NativeAuth = {
    start() {
      starts++;
      if (starts === 1) {
        appSubscription = deps.appState.addEventListener(
          "change",
          refreshState,
        );
        void initialize();
      }
      let stopped = false;
      return () => {
        if (stopped) return;
        stopped = true;
        starts--;
        if (starts === 0) {
          appSubscription?.remove();
          appSubscription = null;
          retire();
          emit({ ...snapshot, revision: snapshot.revision + 1 });
        }
      };
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
    async signIn(email, password) {
      if (!email.trim() || !password)
        throw new Error("Enter your email address and password.");
      await authenticate((active) =>
        active.auth.signInWithPassword({ email: email.trim(), password }),
      );
    },
    async signUp(email, password, displayName) {
      if (!email.trim() || password.length < 8 || !displayName.trim())
        throw new Error(
          "Enter your name, email, and a password with at least 8 characters.",
        );
      const session = await authenticate((active) =>
        active.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { display_name: displayName.trim() } },
        }),
      );
      return { requiresEmailConfirmation: !session };
    },
    async signOut() {
      const previous = retire();
      mustClearLogout = true;
      applySession(null, true);
      // Local logout does not require the network. The retired client cannot write credentials again.
      const revoke = previous
        ? withDeadline(
            previous.auth.signOut({ scope: "local" }),
            deps.timeoutMs,
          ).catch(() => null)
        : Promise.resolve(null);
      try {
        await deps.storage.removeItem(AUTH_KEY);
        mustClearLogout = false;
      } catch {
        emit({
          status: "error",
          session: null,
          revision: snapshot.revision,
          message:
            "Local sign-out could not be saved. Retry sign-out before closing the app.",
        });
        throw new Error(snapshot.message);
      }
      await revoke;
    },
    async retry() {
      await initialize();
    },
    async acquireSession(expectedActorId) {
      const before = snapshot;
      if (before.status !== "signed-in" || !before.session)
        throw new Error("Sign in to open your collection.");
      const actorId = before.session.user.id;
      if (expectedActorId && actorId !== expectedActorId)
        throw new NativeSessionChangedError();
      const active = ensureClient();
      let response: Awaited<ReturnType<typeof active.auth.getSession>>;
      try {
        response = await withDeadline(active.auth.getSession(), deps.timeoutMs);
      } catch (error) {
        if (
          before.revision !== snapshot.revision ||
          snapshot.session?.user.id !== actorId
        )
          throw new NativeSessionChangedError();
        throw error;
      }
      const { data, error } = response;
      if (
        before.revision !== snapshot.revision ||
        snapshot.session?.user.id !== actorId
      )
        throw new NativeSessionChangedError();
      if (error) throw error;
      if (!data.session || data.session.user.id !== actorId) {
        applySession(data.session, true);
        throw new NativeSessionChangedError();
      }
      if (!data.session.access_token)
        throw new Error("Your session is unavailable. Sign in again.");
      return {
        actorId,
        revision: before.revision,
        accessToken: data.session.access_token,
      };
    },
    isCurrent: (lease) =>
      snapshot.status === "signed-in" &&
      snapshot.revision === lease.revision &&
      snapshot.session?.user.id === lease.actorId,
  };
  return auth;
}

let nativeAuth: NativeAuth | undefined;
export function getNativeAuth(): NativeAuth {
  if (nativeAuth) return nativeAuth;
  const environment = getNativeRuntimeEnvironment();
  const { supabaseUrl: url, supabaseKey: key } = environment;
  const offlineAcceptance = isOfflineAcceptanceEnvironment(
    environment,
    Platform.OS,
  );
  let configurationError = offlineAcceptance
    ? "Account access is intentionally unavailable in this offline acceptance build."
    : "";
  if (!offlineAcceptance) {
    try {
      const parsed = new URL(url);
      if (
        parsed.protocol !== "https:" ||
        parsed.username ||
        parsed.password ||
        !key ||
        key.startsWith("sb_secret_")
      )
        throw new Error();
      // A legacy JWT is allowed only when its declared public role is anon. Never embed a service key.
      if (!key.startsWith("sb_publishable_")) {
        const payload = JSON.parse(
          globalThis.atob(
            key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"),
          ),
        );
        if (payload.role !== "anon") throw new Error();
      }
    } catch {
      configurationError =
        "Account access is not configured. Set the public Supabase URL and publishable key for this build.";
    }
  }
  nativeAuth = createNativeAuth({
    storage: getNativeStorage(),
    appState: AppState,
    configurationError,
    clientFactory: (storage) => {
      if (offlineAcceptance) throw new Error(configurationError);
      return createClient(url, key, {
        auth: {
          storage,
          storageKey: AUTH_KEY,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
        },
      });
    },
  });
  return nativeAuth;
}

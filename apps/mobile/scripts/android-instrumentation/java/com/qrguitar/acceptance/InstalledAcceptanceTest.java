// QRguitar installed acceptance overlay; generated CI project only.
package com.qrguitar.acceptance;

import static org.junit.Assert.*;

import android.Manifest;
import android.app.Activity;
import android.app.Application;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.os.Bundle;
import android.os.SystemClock;
import android.provider.MediaStore;
import android.util.Log;

import androidx.activity.result.PickVisualMediaRequest;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.uiautomator.By;
import androidx.test.uiautomator.UiDevice;
import androidx.test.uiautomator.UiObject2;
import androidx.test.uiautomator.Until;

import com.qrguitar.picker.PhotoSelectionActivity;
import com.qrguitar.picker.SelectionStore;

import java.io.File;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.BooleanSupplier;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Real app/OS integration on a disposable emulator. No account session or synthetic result Intent. */
@RunWith(AndroidJUnit4.class)
public final class InstalledAcceptanceTest {
  private static final String TAG = "QRGInstalledAcceptance";
  private static final String APP = "com.qrguitar.app";
  private static final long UI_TIMEOUT = 30_000;
  private static final long PICKER_TIMEOUT = 20_000;
  private Context context;
  private UiDevice device;
  private SelectionStore store;
  private final List<String> ownedIds = new ArrayList<>();
  private String previousAlwaysFinish;

  @Before public void setUp() throws Exception {
    context = InstrumentationRegistry.getInstrumentation().getTargetContext();
    assertEquals("Instrumentation must target the installed app, not a library host", APP, context.getPackageName());
    device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation());
    previousAlwaysFinish = device.executeShellCommand("settings get global always_finish_activities").trim();
    assertTrue("Unexpected developer setting", previousAlwaysFinish.equals("null") || previousAlwaysFinish.matches("[01]"));
    device.executeShellCommand("settings put global always_finish_activities 0");
    assertEquals("0", device.executeShellCommand("settings get global always_finish_activities").trim());
    store = SelectionStore.Companion.get(context);
    device.wakeUp();
  }

  @After public void tearDown() throws Exception {
    try {
      if (store != null) for (String id : ownedIds) store.discard(id);
      if (device != null) {
        File evidence = new File(context.getExternalFilesDir(null), "installed-acceptance");
        assertTrue(evidence.isDirectory() || evidence.mkdirs());
        String name = "state-" + System.currentTimeMillis();
        device.dumpWindowHierarchy(new File(evidence, name + ".xml"));
        device.takeScreenshot(new File(evidence, name + ".png"));
      }
    } finally {
      if (device != null && previousAlwaysFinish != null) {
        device.executeShellCommand(previousAlwaysFinish.equals("null")
            ? "settings delete global always_finish_activities"
            : "settings put global always_finish_activities " + previousAlwaysFinish);
        assertEquals(previousAlwaysFinish, device.executeShellCommand("settings get global always_finish_activities").trim());
      }
    }
  }

  @Test(timeout = 120_000) public void embeddedBundleLaunchesOfflineAndNavigationWorks() throws Exception {
    assertEquals("CI fixture must remove app INTERNET permission before offline smoke", PackageManager.PERMISSION_DENIED,
        context.checkSelfPermission(Manifest.permission.INTERNET));
    try (InputStream bundle = context.getAssets().open("index.android.bundle")) {
      assertTrue("Bundled JavaScript/Hermes asset is empty", bundle.read() >= 0);
    }
    launchApp();
    requireLabel("Every instrument has a story.");
    requireLabel("Explore");
    requireLabel("Scan");
    requireLabel("My instruments");
    requireLabel("Retry Catalog");
    clickLabel("My instruments");
    requireLabel("Your instruments, together");
    clickLabel("Sign in or create an account");
    requireLabel("Welcome back.");
    requireLabel("Email");
    requireLabel("Password");
    clickLabel("Scan");
    requireLabel("Find a Profile");
    requireLabel("QRguitar ID or Profile link");
    requireLabel("Open Profile");
    assertFalse("Offline smoke must not grant camera access",
        context.checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED);
    clickLabel("Explore");
    requireLabel("Every instrument has a story.");
    device.pressHome();
    launchApp();
    requireLabel("Every instrument has a story.");
    Log.i(TAG, "PASS embedded bundle and offline Browse / signed-out collection / Login / manual QR navigation");
  }

  @Test(timeout = 90_000) public void realSystemPickerCancellationRetiresOnlyItsRequest() throws Exception {
    launchApp();
    requireLabel("Every instrument has a story.");
    String sentinel = prepare();
    String id = prepare();
    try (SelectionTrace trace = new SelectionTrace(id)) {
      launchSelection(id);
      requireSystemPicker();
      waitFor("request Activity created", () -> trace.createdCount() == 1, PICKER_TIMEOUT);
      assertEquals("pending", store.read(id).get("status"));
      assertTrue(device.pressBack());
      requireCancelled(id);
      assertEquals("Other request must remain untouched", "pending", store.read(sentinel).get("status"));
      assertFalse("Same cancelled identity must not launch again", store.prepare(id, 2, 16 * 1024 * 1024));
      assertEquals("cancelled", store.read(id).get("status"));
      trace.log("normal cancellation");
    }
  }

  @Test(timeout = 120_000) public void realSystemCancellationSurvivesRequestActivityRecreation() throws Exception {
    launchApp();
    requireLabel("Every instrument has a story.");
    String id = prepare();
    try (SelectionTrace trace = new SelectionTrace(id)) {
      launchSelection(id);
      requireSystemPicker();
      waitFor("first request Activity", () -> trace.createdCount() == 1, PICKER_TIMEOUT);
      // Recreate the actual paused caller directly. ActivityScenario would bring it to the front first.
      // Don't-keep-activities alone is insufficient when a partial-height OS picker only pauses it.
      InstrumentationRegistry.getInstrumentation().runOnMainSync(trace::recreateCurrent);
      waitFor("original Activity destroyed by recreation", () -> trace.destroyedCount() >= 1, PICKER_TIMEOUT);
      waitFor("new Activity restored with saved state", () -> trace.createdCount() == 2 && trace.restoredCount() == 1, PICKER_TIMEOUT);
      assertTrue("Recreation must save the original Activity state", trace.savedCount() >= 1);
      requireSystemPicker();
      assertEquals("pending", store.read(id).get("status"));
      assertTrue(device.pressBack());
      requireCancelled(id);
      waitFor("restored request Activity finished", () -> trace.destroyedCount() == 2, PICKER_TIMEOUT);
      assertEquals("Recreation must not create a third caller", 2, trace.createdCount());
      assertFalse(store.prepare(id, 2, 16 * 1024 * 1024));
      assertEquals("cancelled", store.read(id).get("status"));
      trace.log("recreated cancellation");
    }
    // A fresh real request still opens and cancels after the restored callback has settled.
    String next = prepare();
    launchSelection(next);
    requireSystemPicker();
    assertTrue(device.pressBack());
    requireCancelled(next);
  }

  private String prepare() {
    String id = "installed-" + UUID.randomUUID();
    ownedIds.add(id);
    assertTrue(store.prepare(id, 2, 16 * 1024 * 1024));
    Log.i(TAG, "prepared " + id);
    return id;
  }

  private void launchApp() {
    Intent intent = context.getPackageManager().getLaunchIntentForPackage(APP);
    assertNotNull("Installed launcher missing", intent);
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> context.startActivity(intent));
  }

  private void launchSelection(String id) {
    Intent intent = new Intent(context, PhotoSelectionActivity.class)
        .putExtra(PhotoSelectionActivity.SELECTION_ID, id).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> context.startActivity(intent));
  }

  private void requireSystemPicker() {
    PickVisualMediaRequest request = new PickVisualMediaRequest.Builder()
        .setMediaType(ActivityResultContracts.PickVisualMedia.ImageOnly.INSTANCE).build();
    Intent picker = new ActivityResultContracts.PickMultipleVisualMedia(2).createIntent(context, request);
    assertEquals("This gate requires modern OS photo picker, not document fallback", MediaStore.ACTION_PICK_IMAGES, picker.getAction());
    ResolveInfo resolved = context.getPackageManager().resolveActivity(picker, PackageManager.MATCH_DEFAULT_ONLY);
    assertNotNull("Photo picker handler missing", resolved);
    String handler = resolved.activityInfo.packageName;
    assertNotEquals(APP, handler);
    assertFalse("Intent resolver is not a photo picker", resolved.activityInfo.name.contains("ResolverActivity"));
    assertTrue("Resolved OS photo picker not visible: " + handler,
        device.wait(Until.hasObject(By.pkg(handler).depth(0)), PICKER_TIMEOUT));
    Log.i(TAG, "observed OS picker " + handler + "/" + resolved.activityInfo.name);
  }

  private void requireCancelled(String id) {
    waitFor("exact request cancellation " + id, () -> {
      Map<?, ?> value = store.read(id);
      assertEquals(id, value.get("selectionId"));
      assertFalse("Cancellation must not deliver photos", value.containsKey("photos"));
      assertNotEquals("Cancellation unexpectedly became a photo result", "ready", value.get("status"));
      return "cancelled".equals(value.get("status"));
    }, PICKER_TIMEOUT);
    Log.i(TAG, "cancelled " + id);
  }

  private UiObject2 requireLabel(String label) {
    AtomicReference<UiObject2> found = new AtomicReference<>();
    waitFor("UI label: " + label, () -> {
      UiObject2 value = device.findObject(By.text(label).pkg(APP));
      if (value == null) value = device.findObject(By.desc(label).pkg(APP));
      if (value == null && (label.equals("Explore") || label.equals("Scan") || label.equals("My instruments"))) {
        value = device.findObject(By.descContains(label).pkg(APP));
      }
      found.set(value);
      return value != null;
    }, UI_TIMEOUT);
    return found.get();
  }

  private void clickLabel(String label) { requireLabel(label).click(); }

  private static void waitFor(String description, BooleanSupplier check, long timeout) {
    long deadline = SystemClock.elapsedRealtime() + timeout;
    do {
      if (check.getAsBoolean()) return;
      SystemClock.sleep(100);
    } while (SystemClock.elapsedRealtime() < deadline);
    fail("Timed out: " + description);
  }

  private final class SelectionTrace implements Application.ActivityLifecycleCallbacks, AutoCloseable {
    private final String selectionId;
    private final Application application = (Application) context.getApplicationContext();
    private final IdentityHashMap<Activity, Integer> identities = new IdentityHashMap<>();
    private final List<String> events = new ArrayList<>();
    private Activity current;
    private int created, restored, saved, destroyed;

    SelectionTrace(String id) { selectionId = id; application.registerActivityLifecycleCallbacks(this); }
    private boolean matches(Activity activity) {
      return activity instanceof PhotoSelectionActivity
          && selectionId.equals(activity.getIntent().getStringExtra(PhotoSelectionActivity.SELECTION_ID));
    }
    private synchronized void event(Activity activity, String kind) {
      Integer identity = identities.get(activity);
      if (identity == null) { identity = identities.size() + 1; identities.put(activity, identity); }
      events.add(kind + "#" + identity);
      Log.i(TAG, selectionId + " " + kind + "#" + identity);
    }
    @Override public synchronized void onActivityCreated(Activity activity, Bundle state) {
      if (!matches(activity)) return;
      current = activity; created++; if (state != null) restored++;
      event(activity, state == null ? "created" : "restored");
    }
    @Override public void onActivityStarted(Activity activity) { if (matches(activity)) event(activity, "started"); }
    @Override public void onActivityResumed(Activity activity) { if (matches(activity)) event(activity, "resumed"); }
    @Override public void onActivityPaused(Activity activity) { if (matches(activity)) event(activity, "paused"); }
    @Override public void onActivityStopped(Activity activity) { if (matches(activity)) event(activity, "stopped"); }
    @Override public synchronized void onActivitySaveInstanceState(Activity activity, Bundle state) {
      if (matches(activity)) { saved++; event(activity, "saved"); }
    }
    @Override public synchronized void onActivityDestroyed(Activity activity) {
      if (matches(activity)) { destroyed++; if (current == activity) current = null; event(activity, "destroyed"); }
    }
    synchronized int createdCount() { return created; }
    synchronized int restoredCount() { return restored; }
    synchronized int savedCount() { return saved; }
    synchronized int destroyedCount() { return destroyed; }
    synchronized void recreateCurrent() {
      assertNotNull("No live request Activity to recreate", current);
      assertFalse(current.isFinishing()); assertFalse(current.isDestroyed());
      current.recreate();
    }
    synchronized void log(String label) { Log.i(TAG, label + " " + selectionId + " " + events); }
    @Override public void close() { application.unregisterActivityLifecycleCallbacks(this); }
  }
}

// QRguitar installed acceptance overlay; generated CI project only.
package com.qrguitar.acceptance;

import static org.junit.Assert.*;

import android.Manifest;
import android.app.Activity;
import android.app.Application;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.UriPermission;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.os.SystemClock;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.Log;

import androidx.activity.result.PickVisualMediaRequest;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.uiautomator.By;
import androidx.test.uiautomator.Direction;
import androidx.test.uiautomator.UiDevice;
import androidx.test.uiautomator.UiObject2;
import androidx.test.uiautomator.Until;

import com.qrguitar.picker.PhotoSelectionActivity;
import com.qrguitar.picker.SelectionStore;

import java.io.File;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.security.MessageDigest;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
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
        dumpBoundedHierarchy();
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

  private void dumpBoundedHierarchy() {
    if ((context.getApplicationInfo().flags & ApplicationInfo.FLAG_TEST_ONLY) == 0
        || context.checkSelfPermission(Manifest.permission.INTERNET) != PackageManager.PERMISSION_DENIED) {
      Log.i(TAG, "UI_HIERARCHY omitted: target is not the offline test-only fixture");
      return;
    }
    try {
      final int maximumBytes = 23_000;
      ByteArrayOutputStream captured = new ByteArrayOutputStream(maximumBytes);
      OutputStream bounded = new OutputStream() {
        @Override public void write(int value) {
          if (captured.size() < maximumBytes) captured.write(value);
        }
        @Override public void write(byte[] bytes, int offset, int length) {
          int remaining = maximumBytes - captured.size();
          if (remaining > 0) captured.write(bytes, offset, Math.min(length, remaining));
        }
      };
      device.dumpWindowHierarchy(bounded);
      String hierarchy = new String(captured.toByteArray(), StandardCharsets.UTF_8);
      Log.i(TAG, "UI_HIERARCHY fixture-only bytes=" + captured.size() + " cap=" + maximumBytes);
      for (int offset = 0, part = 1; offset < hierarchy.length(); offset += 2_900, part++) {
        Log.i(TAG, "UI_HIERARCHY[" + part + "] " + hierarchy.substring(offset, Math.min(offset + 2_900, hierarchy.length())));
      }
    } catch (Exception error) {
      // Diagnostics must not replace the assertion that caused a test failure.
      Log.i(TAG, "UI_HIERARCHY unavailable: " + error.getClass().getSimpleName());
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
    requireLabelAfterScrolling("QRguitar could not be reached. Check your connection and try again.");
    requireLabelAfterScrolling("Retry Catalog");
    clickLabel("My instruments");
    requireLabel("Your instruments, together");
    clickLabel("Sign in or create an account");
    requireLabel("Welcome back.");
    requireLabel("Email");
    requireLabel("Password");
    clickLabel("Scan");
    requireLabel("Find a Profile");
    requireLabel("QRguitar ID or Profile link");
    requireLabelAfterScrolling("Open Profile");
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
      cancelSystemPicker(id);
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
      cancelSystemPicker(id);
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
    cancelSystemPicker(next);
  }

  @Test(timeout = 120_000) public void realSystemPickerSelectionPersistsGrantAndAcknowledgesExactReceipt() throws Exception {
    assertTrue("This fixture APK must be test-only", (context.getApplicationInfo().flags & ApplicationInfo.FLAG_TEST_ONLY) != 0);
    for (String permission : new String[] {
        Manifest.permission.INTERNET, Manifest.permission.READ_MEDIA_IMAGES, Manifest.permission.READ_MEDIA_VIDEO,
        Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED, Manifest.permission.READ_EXTERNAL_STORAGE,
        Manifest.permission.WRITE_EXTERNAL_STORAGE, Manifest.permission.ACCESS_MEDIA_LOCATION,
        Manifest.permission.MANAGE_EXTERNAL_STORAGE }) {
      assertEquals("No broad or network permission may bypass picker access: " + permission,
          PackageManager.PERMISSION_DENIED, context.checkSelfPermission(permission));
    }
    assertFalse("No all-files access may bypass picker access", Environment.isExternalStorageManager());
    ContentResolver resolver = context.getContentResolver();
    Map<Uri, Integer> baselineGrants = persistedGrants();
    String fixtureName = "qrguitar-acceptance-" + UUID.randomUUID() + ".jpg";
    byte[] source = syntheticJpeg();
    String sourceHash = sha256(source);
    Uri fixture = null;
    try {
      ContentValues values = new ContentValues();
      values.put(MediaStore.MediaColumns.DISPLAY_NAME, fixtureName);
      values.put(MediaStore.MediaColumns.MIME_TYPE, "image/jpeg");
      values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/QRguitarAcceptance/");
      values.put(MediaStore.MediaColumns.IS_PENDING, 1);
      fixture = resolver.insert(MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY), values);
      assertNotNull("App-owned synthetic MediaStore insertion failed", fixture);
      try (OutputStream output = resolver.openOutputStream(fixture, "w")) {
        assertNotNull("Cannot write owned synthetic fixture", output);
        output.write(source);
      }
      ContentValues published = new ContentValues();
      published.put(MediaStore.MediaColumns.IS_PENDING, 0);
      assertEquals("Publish only the inserted fixture", 1, resolver.update(fixture, published, null, null));
      final Uri insertedFixture = fixture;
      waitFor("synthetic MediaStore fixture published and indexed", () -> {
        try (Cursor row = resolver.query(insertedFixture, new String[] {
            MediaStore.MediaColumns.DISPLAY_NAME, MediaStore.MediaColumns.IS_PENDING, MediaStore.MediaColumns.SIZE }, null, null, null)) {
          if (row == null || !row.moveToFirst()) return false;
          assertEquals(fixtureName, row.getString(0));
          return row.getInt(1) == 0 && row.getLong(2) > 0;
        }
      }, PICKER_TIMEOUT);
      launchApp();
      requireLabel("Every instrument has a story.");
      String sentinel = prepare();
      String id = prepare();
      try (SelectionTrace trace = new SelectionTrace(id)) {
        launchSelection(id);
        String handler = requireSystemPicker();
        clickOnlySyntheticPickerItem(handler);
        waitFor("actual selected result ready", () -> {
          Map<?, ?> snapshot = store.read(id);
          assertEquals(id, snapshot.get("selectionId"));
          String status = String.valueOf(snapshot.get("status"));
          assertTrue("Actual picker result must stay pending or become ready, got " + status + ": " + snapshot.get("code"),
              status.equals("pending") || status.equals("ready"));
          return status.equals("ready");
        }, PICKER_TIMEOUT);
        waitFor("successful picker caller finished", () -> trace.destroyedCount() == 1, PICKER_TIMEOUT);
        assertEquals("One actual caller, no synthetic replacement", 1, trace.createdCount());
        Map<?, ?> ready = store.read(id);
        Map<?, ?> firstPhoto = onlyPhoto(ready);
        String receipt = String.valueOf(ready.get("resultId"));
        String photoId = String.valueOf(firstPhoto.get("id"));
        assertTrue(receipt.matches("[A-Za-z0-9-]{12,80}"));
        assertTrue(photoId.matches("[A-Za-z0-9-]{12,80}"));
        byte[] normalized = jpegBytes(firstPhoto);
        assertSyntheticPixels(normalized);
        Map<?, ?> replay = store.read(id);
        assertEquals(id, replay.get("selectionId"));
        assertEquals(receipt, replay.get("resultId"));
        assertEquals(photoId, onlyPhoto(replay).get("id"));
        assertEquals(sha256(normalized), sha256(jpegBytes(onlyPhoto(replay))));
        assertEquals("Other request stays pending", "pending", store.read(sentinel).get("status"));

        Map<Uri, Integer> retained = persistedGrants();
        for (Map.Entry<Uri, Integer> entry : baselineGrants.entrySet()) assertEquals(entry.getValue(), retained.get(entry.getKey()));
        Set<Uri> added = new HashSet<>(retained.keySet());
        added.removeAll(baselineGrants.keySet());
        assertEquals("Production selection must obtain exactly one real persisted grant", 1, added.size());
        Uri selectedGrant = added.iterator().next();
        assertEquals("content", selectedGrant.getScheme());
        assertNotEquals("Verify the returned picker URI, not app-owned insertion access", fixture, selectedGrant);
        assertEquals("Picker grant must grant read only", Integer.valueOf(Intent.FLAG_GRANT_READ_URI_PERMISSION), retained.get(selectedGrant));
        try (InputStream selected = resolver.openInputStream(selectedGrant)) {
          assertNotNull("Real retained picker URI cannot be opened", selected);
          assertEquals("Retained picker grant must identify the synthetic source", sourceHash, sha256(readFixtureBytes(selected)));
        }
        File journal = new File(context.getNoBackupFilesDir(), "qrguitar-photo-picker-v1");
        File record = new File(journal, id + ".record");
        File encryptedImage = new File(journal, id + "-" + photoId + ".image");
        assertTrue("Actual native encrypted image must exist before ack", encryptedImage.isFile() && encryptedImage.length() > 0);
        long readyRecordBytes = record.length();
        assertTrue("Native ready journal missing", readyRecordBytes > 0);
        try {
          store.acknowledge(id, "incorrect-" + UUID.randomUUID());
          fail("Incorrect receipt must not acknowledge native bytes");
        } catch (IllegalStateException expected) {
          assertEquals("receipt_changed", expected.getMessage());
        }
        assertEquals(receipt, store.read(id).get("resultId"));
        assertEquals(sha256(normalized), sha256(jpegBytes(onlyPhoto(store.read(id)))));
        assertEquals(retained, persistedGrants());
        assertEquals("acknowledged", store.acknowledge(id, receipt).get("status"));
        assertEquals("acknowledged", store.acknowledge(id, receipt).get("status"));
        Map<?, ?> retired = store.read(id);
        assertEquals(id, retired.get("selectionId"));
        assertEquals("acknowledged", retired.get("status"));
        assertFalse(retired.containsKey("photos"));
        assertEquals("Only the newly retained grant is released", baselineGrants, persistedGrants());
        for (String suffix : new String[] { "", ".new", ".bak" }) {
          assertFalse("Acknowledged image cleanup incomplete", new File(encryptedImage.getPath() + suffix).exists());
        }
        assertTrue("Keep a compact durable identity after exact ack", record.isFile() && record.length() > 0 && record.length() < readyRecordBytes);
        assertFalse("Acknowledged identity cannot start again", store.prepare(id, 2, 16 * 1024 * 1024));
        assertEquals("pending", store.read(sentinel).get("status"));
        trace.log("actual selection and exact acknowledgement");
        Log.i(TAG, "PASS sourceSha256=" + sourceHash + " normalizedSha256=" + sha256(normalized)
            + " addedPersistedGrants=1 remainingAddedGrants=0 selection=" + id);
      }
    } finally {
      try {
        for (String id : ownedIds) store.discard(id);
      } finally {
        if (fixture != null) {
          // Exact insertion URI plus UUID name: never enumerate/delete another media row.
          int deleted = resolver.delete(fixture, MediaStore.MediaColumns.DISPLAY_NAME + " = ?", new String[] { fixtureName });
          assertEquals("Owned synthetic fixture cleanup failed", 1, deleted);
        }
      }
    }
  }

  private Map<Uri, Integer> persistedGrants() {
    Map<Uri, Integer> result = new HashMap<>();
    for (UriPermission permission : context.getContentResolver().getPersistedUriPermissions()) {
      int flags = (permission.isReadPermission() ? Intent.FLAG_GRANT_READ_URI_PERMISSION : 0)
          | (permission.isWritePermission() ? Intent.FLAG_GRANT_WRITE_URI_PERMISSION : 0);
      assertNull("Duplicate persisted URI entry", result.put(permission.getUri(), flags));
    }
    return result;
  }

  private void clickOnlySyntheticPickerItem(String handler) {
    String gridId = pickerResource("qrguitarPickerGridId", "picker_tab_recyclerview");
    String thumbnailId = pickerResource("qrguitarPickerThumbnailId", "icon_thumbnail");
    String addId = pickerResource("qrguitarPickerAddId", "button_add");
    AtomicReference<UiObject2> thumbnail = new AtomicReference<>();
    waitFor("one OS picker thumbnail; verify actual hierarchy/selector " + handler + ":id/" + gridId + "/" + thumbnailId, () -> {
      UiObject2 grid = device.findObject(By.res(handler, gridId));
      if (grid == null) return false;
      List<UiObject2> items = grid.findObjects(By.res(handler, thumbnailId));
      assertTrue("Fresh acceptance AVD unexpectedly has multiple visible media items", items.size() <= 1);
      if (items.size() != 1) return false;
      thumbnail.set(items.get(0));
      return true;
    }, PICKER_TIMEOUT);
    thumbnail.get().click();
    AtomicReference<UiObject2> add = new AtomicReference<>();
    waitFor("enabled actual OS picker confirmation " + handler + ":id/" + addId, () -> {
      UiObject2 value = device.findObject(By.res(handler, addId).enabled(true));
      add.set(value);
      return value != null;
    }, PICKER_TIMEOUT);
    Log.i(TAG, "actual picker selectors " + handler + ": " + gridId + "," + thumbnailId + "," + addId);
    add.get().click();
  }

  private static String pickerResource(String argument, String fallback) {
    String value = InstrumentationRegistry.getArguments().getString(argument, fallback);
    assertTrue("Picker selector must be one explicit resource entry: " + argument, value.matches("[A-Za-z][A-Za-z0-9_]*"));
    return value;
  }

  private static Map<?, ?> onlyPhoto(Map<?, ?> snapshot) {
    assertEquals("ready", snapshot.get("status"));
    assertTrue(snapshot.get("photos") instanceof List);
    List<?> photos = (List<?>) snapshot.get("photos");
    assertEquals(1, photos.size());
    assertTrue(photos.get(0) instanceof Map);
    return (Map<?, ?>) photos.get(0);
  }

  private static byte[] jpegBytes(Map<?, ?> photo) {
    Object value = photo.get("dataUrl");
    assertTrue("Native photo bytes missing", value instanceof String);
    String data = (String) value;
    String prefix = "data:image/jpeg;base64,";
    assertTrue("Native normalization must produce JPEG", data.startsWith(prefix));
    assertTrue("Synthetic fixture unexpectedly large", data.length() < 1024 * 1024);
    return Base64.decode(data.substring(prefix.length()), Base64.NO_WRAP);
  }

  private static byte[] syntheticJpeg() {
    int[] pixels = new int[96 * 64];
    for (int y = 0; y < 64; y++) for (int x = 0; x < 96; x++) pixels[y * 96 + x] = x < 48 ? Color.RED : Color.BLUE;
    Bitmap image = Bitmap.createBitmap(pixels, 96, 64, Bitmap.Config.ARGB_8888);
    try {
      ByteArrayOutputStream output = new ByteArrayOutputStream();
      assertTrue(image.compress(Bitmap.CompressFormat.JPEG, 95, output));
      return output.toByteArray();
    } finally { image.recycle(); }
  }

  private static void assertSyntheticPixels(byte[] bytes) {
    Bitmap image = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
    assertNotNull("Normalized photo is not decodable", image);
    try {
      assertEquals(96, image.getWidth()); assertEquals(64, image.getHeight());
      int left = image.getPixel(24, 32), right = image.getPixel(72, 32);
      assertTrue("Synthetic left red region changed", Color.red(left) > 200 && Color.green(left) < 70 && Color.blue(left) < 70);
      assertTrue("Synthetic right blue region changed", Color.blue(right) > 200 && Color.green(right) < 70 && Color.red(right) < 70);
    } finally { image.recycle(); }
  }

  private static byte[] readFixtureBytes(InputStream input) throws Exception {
    ByteArrayOutputStream output = new ByteArrayOutputStream();
    byte[] buffer = new byte[8192];
    int count;
    while ((count = input.read(buffer)) != -1) {
      assertTrue("Synthetic picker source unexpectedly large", output.size() + count <= 1024 * 1024);
      output.write(buffer, 0, count);
    }
    return output.toByteArray();
  }

  private static String sha256(byte[] bytes) throws Exception {
    StringBuilder result = new StringBuilder();
    for (byte value : MessageDigest.getInstance("SHA-256").digest(bytes)) result.append(String.format(java.util.Locale.ROOT, "%02x", value & 255));
    return result.toString();
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

  private String requireSystemPicker() {
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
    return handler;
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

  private void cancelSystemPicker(String id) {
    // UiDevice's synchronous boolean does not identify whether this exact
    // request retired. The durable request state and restored app window are
    // the authoritative cancellation proof; both still fail if Back did not work.
    boolean observedWindowTransition = device.pressBack();
    requireCancelled(id);
    assertTrue("App did not return after cancelling the OS picker",
        device.wait(Until.hasObject(By.pkg(APP).depth(0)), PICKER_TIMEOUT));
    Log.i(TAG, "picker Back dispatched; UiDevice observed transition=" + observedWindowTransition);
  }

  private UiObject2 findLabel(String label) {
    UiObject2 value = device.findObject(By.text(label).pkg(APP));
    if (value == null) value = device.findObject(By.desc(label).pkg(APP));
    if (value == null && (label.equals("Explore") || label.equals("Scan") || label.equals("My instruments"))) {
      value = device.findObject(By.descContains(label).pkg(APP));
    }
    return value;
  }

  private UiObject2 requireLabel(String label) {
    AtomicReference<UiObject2> found = new AtomicReference<>();
    waitFor("UI label: " + label, () -> {
      UiObject2 value = findLabel(label);
      found.set(value);
      return value != null;
    }, UI_TIMEOUT);
    return found.get();
  }

  private UiObject2 requireLabelAfterScrolling(String label) {
    long deadline = SystemClock.elapsedRealtime() + UI_TIMEOUT;
    do {
      UiObject2 found = findLabel(label);
      if (found != null) return found;
      UiObject2 scrollable = device.findObject(By.scrollable(true).pkg(APP));
      if (scrollable != null) scrollable.scroll(Direction.DOWN, 0.75f);
      SystemClock.sleep(250);
    } while (SystemClock.elapsedRealtime() < deadline);
    fail("Timed out after scrolling: UI label: " + label);
    return null;
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

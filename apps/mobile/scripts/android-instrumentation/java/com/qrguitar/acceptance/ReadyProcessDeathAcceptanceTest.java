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
import android.os.Process;
import android.os.SystemClock;
import android.provider.MediaStore;
import android.util.AtomicFile;
import android.util.Base64;
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

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.BooleanSupplier;

/**
 * Run only through the external two-phase host controller, never the ordinary connected suite.
 * Stage is deliberately killed after a durable ready checkpoint; it is not a completed JUnit test.
 * Android also finishes/force-stops a killed instrumentation target. This proves durable ready
 * data/grant survival across that process termination, not pending-picker callback restoration.
 */
@RunWith(AndroidJUnit4.class)
public final class ReadyProcessDeathAcceptanceTest {
  private static final String APP = "com.qrguitar.app";
  private static final String TAG = "QRGReadyDeath";
  private static final String DIRECTORY = "qrguitar-ready-death";
  private static final String UUID_PATTERN = "[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}";
  private static final int BUDGET = 16 * 1024 * 1024;
  private static final long UI_TIMEOUT = 20_000;
  private Context context;
  private UiDevice device;
  private SelectionStore store;
  private String scenario;
  private File scenarioDirectory;
  private String ownedSelectionId;
  private Uri ownedFixtureUri;
  private String ownedFixtureName;
  private boolean fixtureDeleted;

  @Test(timeout = 150_000) public void stageReadyResult() throws Exception {
    initialize("stage");
    assertFalse("A scenario must be fresh", scenarioDirectory.exists());
    assertTrue("Cannot create owned scenario directory", scenarioDirectory.mkdirs());
    JSONObject checkpoint = null;
    Throwable failure = null;
    try {
      Map<Uri, Integer> baseline = persistedGrants();
      byte[] source = syntheticJpeg();
      String sourceHash = sha256(source);
      seedFixture(source);
      ownedSelectionId = "installed-ready-" + scenario;
      assertTrue(store.prepare(ownedSelectionId, 2, BUDGET));
      device.wakeUp();
      try (SelectionTrace trace = new SelectionTrace(ownedSelectionId)) {
        launchSelection(ownedSelectionId);
        String handler = requireSystemPicker();
        clickOnlyFixture(handler);
        waitFor("actual native ready receipt", () -> {
          Map<?, ?> value = store.read(ownedSelectionId);
          assertEquals(ownedSelectionId, value.get("selectionId"));
          String status = String.valueOf(value.get("status"));
          assertTrue("Unexpected native selection status: " + status,
              status.equals("pending") || status.equals("ready"));
          return status.equals("ready");
        }, UI_TIMEOUT);
        waitFor("real selection Activity finished", () -> trace.destroyed() == 1, UI_TIMEOUT);
        assertEquals("Only one real request Activity", 1, trace.created());

        Map<?, ?> result = store.read(ownedSelectionId);
        Map<?, ?> photo = onlyPhoto(result);
        String receipt = requiredUuid(result.get("resultId"));
        String photoId = requiredUuid(photo.get("id"));
        byte[] normalized = jpegBytes(photo);
        assertSyntheticPixels(normalized);
        assertEquals(result, store.read(ownedSelectionId));

        Map<Uri, Integer> retained = persistedGrants();
        Set<Uri> added = new HashSet<>(retained.keySet());
        added.removeAll(baseline.keySet());
        for (Map.Entry<Uri, Integer> entry : baseline.entrySet()) assertEquals(entry.getValue(), retained.get(entry.getKey()));
        assertEquals("Production callback must retain exactly one real URI", 1, added.size());
        Uri selectedGrant = added.iterator().next();
        assertEquals("content", selectedGrant.getScheme());
        assertNotEquals("Must inspect picker access, not app-owned source access", ownedFixtureUri, selectedGrant);
        assertEquals(Integer.valueOf(Intent.FLAG_GRANT_READ_URI_PERMISSION), retained.get(selectedGrant));
        assertEquals(sourceHash, hashSelectedSource(selectedGrant));

        File record = nativeFile(ownedSelectionId + ".record");
        File image = nativeFile(ownedSelectionId + "-" + photoId + ".image");
        long readyLength = record.length();
        assertTrue(readyLength > 0 && image.length() > 0);
        checkpoint = new JSONObject()
            .put("protocol", 1).put("phase", "ready_waiting_for_kill")
            .put("scenario", scenario).put("packageName", APP)
            .put("pid", Process.myPid()).put("uid", Process.myUid())
            .put("processStartTicks", processStartTicks())
            .put("holdDeadlineElapsedRealtimeMs", SystemClock.elapsedRealtime() + 60_000)
            .put("selectionId", ownedSelectionId).put("resultId", receipt).put("photoId", photoId)
            .put("sourceSha256", sourceHash).put("normalizedSha256", sha256(normalized))
            .put("fixtureUri", ownedFixtureUri.toString()).put("fixtureName", ownedFixtureName)
            .put("selectedGrantUri", selectedGrant.toString()).put("baselineGrants", encodeGrants(baseline))
            .put("recordCiphertextSha256", hashFile(record, 64 * 1024))
            .put("imageCiphertextSha256", hashFile(image, 1024 * 1024))
            .put("readyRecordBytes", readyLength)
            .put("callerCreated", trace.created()).put("callerDestroyed", trace.destroyed());
        writeMarker("stage.json", checkpoint);
        Log.i(TAG, "STAGED scenario=" + scenario + " selection=" + ownedSelectionId
            + " pid=" + Process.myPid() + " normalizedSha256=" + checkpoint.getString("normalizedSha256"));
        // No release signal: a successful host-controlled stage ends only by killing this PID.
        new CountDownLatch(1).await(60, TimeUnit.SECONDS);
        fail("Host did not kill the staged process before its deadline");
      }
    } catch (Exception | AssertionError error) {
      failure = error;
      throw error;
    } finally {
      // This does not run after SIGKILL. An ordinary failure must invalidate a stale ready marker.
      try {
        if (checkpoint != null) {
          try { writeMarker("stage.json", checkpoint.put("phase", "stage_aborted")); }
          catch (Exception | AssertionError error) { if (failure != null) failure.addSuppressed(error); else throw error; }
        }
      } finally {
        cleanupOwned(failure);
      }
    }
  }

  @Test(timeout = 60_000) public void recoverReadyResult() throws Exception {
    initialize("recover");
    assertTrue("Stage scenario directory missing", scenarioDirectory.isDirectory());
    assertFalse("Recovery evidence must be fresh", new File(scenarioDirectory, "recovery.json").exists());
    byte[] stageBytes = readMarker("stage.json");
    JSONObject checkpoint = new JSONObject(new String(stageBytes, StandardCharsets.UTF_8));
    assertEquals(1, checkpoint.getInt("protocol"));
    assertEquals("ready_waiting_for_kill", checkpoint.getString("phase"));
    assertEquals(scenario, checkpoint.getString("scenario"));
    assertEquals(APP, checkpoint.getString("packageName"));
    assertEquals(Process.myUid(), checkpoint.getInt("uid"));
    int oldPid = checkpoint.getInt("pid");
    assertTrue(oldPid > 0);
    assertNotEquals("The target process must actually be new", oldPid, Process.myPid());
    assertTrue(checkpoint.getString("processStartTicks").matches("[0-9]+"));
    String newStartTicks = processStartTicks();
    assertNotEquals("Process incarnation must change", checkpoint.getString("processStartTicks"), newStartTicks);

    ownedSelectionId = checkpoint.getString("selectionId");
    assertEquals("installed-ready-" + scenario, ownedSelectionId);
    ownedFixtureName = checkpoint.getString("fixtureName");
    assertEquals("qrguitar-ready-" + scenario + ".jpg", ownedFixtureName);
    ownedFixtureUri = validatedFixtureUri(checkpoint.getString("fixtureUri"));
    String receipt = requiredUuid(checkpoint.getString("resultId"));
    String photoId = requiredUuid(checkpoint.getString("photoId"));
    Uri selectedGrant = Uri.parse(checkpoint.getString("selectedGrantUri"));
    assertEquals("content", selectedGrant.getScheme());
    assertNotEquals(ownedFixtureUri, selectedGrant);
    Map<Uri, Integer> baseline = decodeGrants(checkpoint.getJSONArray("baselineGrants"));
    assertFalse("Selected grant must be new to this scenario", baseline.containsKey(selectedGrant));
    for (String name : new String[] { "sourceSha256", "normalizedSha256", "recordCiphertextSha256", "imageCiphertextSha256" }) {
      assertTrue("Malformed stage hash", checkpoint.getString(name).matches("[a-f0-9]{64}"));
    }
    Throwable failure = null;
    try {
      File record = nativeFile(ownedSelectionId + ".record");
      File image = nativeFile(ownedSelectionId + "-" + photoId + ".image");
      assertEquals("Ready journal must survive without replacement", checkpoint.getString("recordCiphertextSha256"), hashFile(record, 64 * 1024));
      assertEquals("Encrypted photo must survive without replacement", checkpoint.getString("imageCiphertextSha256"), hashFile(image, 1024 * 1024));
      Map<?, ?> result = store.read(ownedSelectionId);
      assertEquals(ownedSelectionId, result.get("selectionId"));
      assertEquals(receipt, result.get("resultId"));
      Map<?, ?> photo = onlyPhoto(result);
      assertEquals(photoId, photo.get("id"));
      byte[] normalized = jpegBytes(photo);
      assertEquals(checkpoint.getString("normalizedSha256"), sha256(normalized));
      assertSyntheticPixels(normalized);
      assertEquals(result, store.read(ownedSelectionId));
      assertEquals(checkpoint.getString("recordCiphertextSha256"), hashFile(record, 64 * 1024));
      Map<Uri, Integer> expectedGrants = new HashMap<>(baseline);
      expectedGrants.put(selectedGrant, Intent.FLAG_GRANT_READ_URI_PERMISSION);
      assertEquals("The real persisted grant must survive process death", expectedGrants, persistedGrants());
      assertEquals("The retained picker URI must still open the same source",
          checkpoint.getString("sourceSha256"), hashSelectedSource(selectedGrant));
      assertOwnedFixtureExists();

      assertEquals("acknowledged", store.acknowledge(ownedSelectionId, receipt).get("status"));
      assertEquals("acknowledged", store.acknowledge(ownedSelectionId, receipt).get("status"));
      assertEquals("Only scenario grant released", baseline, persistedGrants());
      assertNoAtomicFiles(image);
      assertTrue("Retain compact native receipt tombstone", record.isFile() && record.length() > 0
          && record.length() < checkpoint.getLong("readyRecordBytes"));
      assertFalse("Acknowledged identity cannot relaunch", store.prepare(ownedSelectionId, 2, BUDGET));
      assertEquals("acknowledged", store.read(ownedSelectionId).get("status"));
      deleteOwnedFixture();
      JSONObject recovered = new JSONObject()
          .put("protocol", 1).put("phase", "verified_acknowledged")
          .put("scenario", scenario).put("packageName", APP).put("uid", Process.myUid())
          .put("oldPid", oldPid).put("pid", Process.myPid())
          .put("oldProcessStartTicks", checkpoint.getString("processStartTicks"))
          .put("processStartTicks", newStartTicks).put("stageSha256", sha256(stageBytes))
          .put("selectionId", ownedSelectionId).put("resultId", receipt).put("photoId", photoId)
          .put("normalizedSha256", checkpoint.getString("normalizedSha256"))
          .put("sourceSha256", checkpoint.getString("sourceSha256"))
          .put("readyCiphertextPreserved", true).put("realGrantReopened", true)
          .put("acknowledgementRepeated", true).put("grantReleased", true)
          .put("encryptedPhotoDeleted", true).put("fixtureDeleted", true)
          .put("nativeTombstoneRetained", true);
      writeMarker("recovery.json", recovered);
      Log.i(TAG, "RECOVERED scenario=" + scenario + " oldPid=" + oldPid + " pid=" + Process.myPid()
          + " normalizedSha256=" + checkpoint.getString("normalizedSha256"));
    } catch (Exception | AssertionError error) {
      failure = error;
      throw error;
    } finally {
      cleanupOwned(failure);
    }
  }

  private void initialize(String phase) throws Exception {
    Bundle arguments = InstrumentationRegistry.getArguments();
    assertEquals("Only the external phase controller may invoke this helper", phase, arguments.getString("qrguitarRecoveryPhase"));
    scenario = arguments.getString("qrguitarRecoveryScenario", "");
    assertTrue("Scenario must be one lowercase UUID", scenario.matches(UUID_PATTERN));
    assertEquals(scenario, UUID.fromString(scenario).toString());
    context = InstrumentationRegistry.getInstrumentation().getTargetContext();
    assertEquals(APP, context.getPackageName());
    assertEquals(APP, Application.getProcessName());
    assertEquals(context.getApplicationInfo().uid, Process.myUid());
    int flags = context.getApplicationInfo().flags;
    assertTrue("Test-only app required", (flags & ApplicationInfo.FLAG_TEST_ONLY) != 0);
    assertTrue("Debuggable app required for the exact-PID host kill", (flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0);
    for (String permission : new String[] {
        Manifest.permission.INTERNET, Manifest.permission.READ_MEDIA_IMAGES, Manifest.permission.READ_MEDIA_VIDEO,
        Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED, Manifest.permission.READ_EXTERNAL_STORAGE,
        Manifest.permission.WRITE_EXTERNAL_STORAGE, Manifest.permission.ACCESS_MEDIA_LOCATION,
        Manifest.permission.MANAGE_EXTERNAL_STORAGE }) {
      assertEquals("No broad/network access for recovery acceptance", PackageManager.PERMISSION_DENIED, context.checkSelfPermission(permission));
    }
    assertFalse(Environment.isExternalStorageManager());
    File parent = new File(context.getNoBackupFilesDir(), DIRECTORY).getCanonicalFile();
    scenarioDirectory = new File(parent, scenario).getCanonicalFile();
    assertEquals(parent, scenarioDirectory.getParentFile());
    assertEquals(scenario, scenarioDirectory.getName());
    device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation());
    store = SelectionStore.Companion.get(context);
    Log.i(TAG, "PHASE " + phase + " scenario=" + scenario + " pid=" + Process.myPid());
  }

  private void seedFixture(byte[] bytes) throws Exception {
    ownedFixtureName = "qrguitar-ready-" + scenario + ".jpg";
    ContentResolver resolver = context.getContentResolver();
    ContentValues values = new ContentValues();
    values.put(MediaStore.MediaColumns.DISPLAY_NAME, ownedFixtureName);
    values.put(MediaStore.MediaColumns.MIME_TYPE, "image/jpeg");
    values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/QRguitarAcceptance/");
    values.put(MediaStore.MediaColumns.IS_PENDING, 1);
    ownedFixtureUri = resolver.insert(MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY), values);
    assertNotNull("Synthetic MediaStore insertion failed", ownedFixtureUri);
    validatedFixtureUri(ownedFixtureUri.toString());
    try (OutputStream output = resolver.openOutputStream(ownedFixtureUri, "w")) {
      assertNotNull(output);
      output.write(bytes);
    }
    ContentValues published = new ContentValues();
    published.put(MediaStore.MediaColumns.IS_PENDING, 0);
    assertEquals(1, resolver.update(ownedFixtureUri, published, null, null));
    waitFor("owned fixture published", () -> {
      try (Cursor row = resolver.query(ownedFixtureUri,
          new String[] { MediaStore.MediaColumns.DISPLAY_NAME, MediaStore.MediaColumns.IS_PENDING, MediaStore.MediaColumns.SIZE },
          null, null, null)) {
        if (row == null || !row.moveToFirst()) return false;
        assertEquals(ownedFixtureName, row.getString(0));
        return row.getInt(1) == 0 && row.getLong(2) > 0;
      }
    }, UI_TIMEOUT);
  }

  private Uri validatedFixtureUri(String value) {
    Uri uri = Uri.parse(value);
    String prefix = MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY).toString() + "/";
    assertTrue("Expected exact app-created image row URI", value.startsWith(prefix));
    assertTrue("Expected one numeric MediaStore row", value.substring(prefix.length()).matches("[0-9]+"));
    return uri;
  }

  private void assertOwnedFixtureExists() {
    try (Cursor row = context.getContentResolver().query(ownedFixtureUri,
        new String[] { MediaStore.MediaColumns.DISPLAY_NAME, MediaStore.MediaColumns.IS_PENDING }, null, null, null)) {
      assertNotNull(row);
      assertTrue("Owned synthetic fixture must survive", row.moveToFirst());
      assertEquals(ownedFixtureName, row.getString(0));
      assertEquals(0, row.getInt(1));
      assertFalse(row.moveToNext());
    }
  }

  private void deleteOwnedFixture() {
    if (ownedFixtureUri == null || fixtureDeleted) return;
    validatedFixtureUri(ownedFixtureUri.toString());
    assertEquals("qrguitar-ready-" + scenario + ".jpg", ownedFixtureName);
    assertEquals("Delete only the inserted URI and exact UUID name", 1,
        context.getContentResolver().delete(ownedFixtureUri, MediaStore.MediaColumns.DISPLAY_NAME + " = ?", new String[] { ownedFixtureName }));
    fixtureDeleted = true;
  }

  private void cleanupOwned(Throwable original) throws Exception {
    try {
      if (ownedSelectionId != null) {
        assertEquals("installed-ready-" + scenario, ownedSelectionId);
        store.discard(ownedSelectionId);
      }
    } catch (Exception | AssertionError error) {
      if (original != null) original.addSuppressed(error); else throw error;
    } finally {
      try { deleteOwnedFixture(); }
      catch (Exception | AssertionError error) { if (original != null) original.addSuppressed(error); else throw error; }
    }
  }

  private void launchSelection(String id) {
    Intent intent = new Intent(context, PhotoSelectionActivity.class)
        .putExtra(PhotoSelectionActivity.SELECTION_ID, id).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> context.startActivity(intent));
  }

  private String requireSystemPicker() {
    PickVisualMediaRequest request = new PickVisualMediaRequest.Builder()
        .setMediaType(ActivityResultContracts.PickVisualMedia.ImageOnly.INSTANCE).build();
    Intent intent = new ActivityResultContracts.PickMultipleVisualMedia(2).createIntent(context, request);
    assertEquals(MediaStore.ACTION_PICK_IMAGES, intent.getAction());
    ResolveInfo resolved = context.getPackageManager().resolveActivity(intent, PackageManager.MATCH_DEFAULT_ONLY);
    assertNotNull("Actual OS photo-picker handler missing", resolved);
    String handler = resolved.activityInfo.packageName;
    assertNotEquals(APP, handler);
    assertFalse(resolved.activityInfo.name.contains("ResolverActivity"));
    assertTrue("Actual OS picker must be visible", device.wait(Until.hasObject(By.pkg(handler).depth(0)), UI_TIMEOUT));
    return handler;
  }

  private void clickOnlyFixture(String handler) {
    String gridId = pickerResource("qrguitarPickerGridId", "picker_tab_recyclerview");
    String thumbnailId = pickerResource("qrguitarPickerThumbnailId", "icon_thumbnail");
    String addId = pickerResource("qrguitarPickerAddId", "button_add");
    AtomicReference<UiObject2> thumbnail = new AtomicReference<>();
    waitFor("one synthetic OS picker thumbnail", () -> {
      UiObject2 grid = device.findObject(By.res(handler, gridId));
      if (grid == null) return false;
      List<UiObject2> items = grid.findObjects(By.res(handler, thumbnailId));
      assertTrue("Fresh fixture AVD has unexpected additional media", items.size() <= 1);
      if (items.size() != 1) return false;
      thumbnail.set(items.get(0));
      return true;
    }, UI_TIMEOUT);
    thumbnail.get().click();
    UiObject2 add = device.wait(Until.findObject(By.res(handler, addId).enabled(true)), UI_TIMEOUT);
    assertNotNull("Actual OS picker confirmation missing", add);
    add.click();
  }

  private static String pickerResource(String argument, String fallback) {
    String value = InstrumentationRegistry.getArguments().getString(argument, fallback);
    assertTrue(value.matches("[A-Za-z][A-Za-z0-9_]*"));
    return value;
  }

  private Map<Uri, Integer> persistedGrants() {
    Map<Uri, Integer> grants = new HashMap<>();
    for (UriPermission permission : context.getContentResolver().getPersistedUriPermissions()) {
      int flags = (permission.isReadPermission() ? Intent.FLAG_GRANT_READ_URI_PERMISSION : 0)
          | (permission.isWritePermission() ? Intent.FLAG_GRANT_WRITE_URI_PERMISSION : 0);
      assertNull(grants.put(permission.getUri(), flags));
    }
    return grants;
  }

  private static JSONArray encodeGrants(Map<Uri, Integer> grants) throws Exception {
    List<String> uris = new ArrayList<>();
    for (Uri uri : grants.keySet()) uris.add(uri.toString());
    Collections.sort(uris);
    JSONArray rows = new JSONArray();
    for (String uri : uris) rows.put(new JSONObject().put("uri", uri).put("flags", grants.get(Uri.parse(uri))));
    return rows;
  }

  private static Map<Uri, Integer> decodeGrants(JSONArray rows) throws Exception {
    assertTrue("Bounded baseline grant list", rows.length() <= 100);
    Map<Uri, Integer> grants = new HashMap<>();
    for (int index = 0; index < rows.length(); index++) {
      JSONObject row = rows.getJSONObject(index);
      Uri uri = Uri.parse(row.getString("uri"));
      assertEquals("content", uri.getScheme());
      int flags = row.getInt("flags");
      assertTrue(flags >= 1 && flags <= 3);
      assertNull(grants.put(uri, flags));
    }
    return grants;
  }

  private String hashSelectedSource(Uri uri) throws Exception {
    try (InputStream input = context.getContentResolver().openInputStream(uri)) {
      assertNotNull("Real persisted picker URI could not be opened", input);
      return sha256(readBounded(input, 1024 * 1024));
    }
  }

  private File nativeFile(String name) throws Exception {
    assertTrue(name.matches("installed-ready-" + UUID_PATTERN + "(?:-" + UUID_PATTERN + ")?\\.(?:record|image)"));
    File parent = new File(context.getNoBackupFilesDir(), "qrguitar-photo-picker-v1").getCanonicalFile();
    File file = new File(parent, name).getCanonicalFile();
    assertEquals(parent, file.getParentFile());
    return file;
  }

  private void writeMarker(String name, JSONObject value) throws Exception {
    assertTrue(name.equals("stage.json") || name.equals("recovery.json"));
    byte[] bytes = value.toString().getBytes(StandardCharsets.UTF_8);
    assertTrue("Bounded private marker", bytes.length < 32 * 1024);
    AtomicFile file = new AtomicFile(new File(scenarioDirectory, name));
    FileOutputStream output = file.startWrite();
    try { output.write(bytes); file.finishWrite(output); }
    catch (Exception | AssertionError error) { file.failWrite(output); throw error; }
    assertArrayEquals(bytes, readMarker(name));
  }

  private byte[] readMarker(String name) throws Exception {
    assertTrue(name.equals("stage.json") || name.equals("recovery.json"));
    File file = new File(scenarioDirectory, name);
    assertEquals(scenarioDirectory, file.getCanonicalFile().getParentFile());
    try (InputStream input = new AtomicFile(file).openRead()) { return readBounded(input, 32 * 1024); }
  }

  private static String processStartTicks() throws Exception {
    String stat;
    try (InputStream input = new FileInputStream("/proc/self/stat")) {
      stat = new String(readBounded(input, 8192), StandardCharsets.US_ASCII);
    }
    int afterName = stat.lastIndexOf(')');
    assertTrue(afterName > 0);
    String[] fields = stat.substring(afterName + 1).trim().split("\\s+");
    assertTrue(fields.length >= 20);
    // fields[0] is proc stat field 3 (state); process start time is field 22.
    assertTrue(fields[19].matches("[0-9]+"));
    return fields[19];
  }

  private static String requiredUuid(Object value) {
    assertTrue(value instanceof String);
    String result = (String) value;
    assertTrue(result.matches(UUID_PATTERN));
    assertEquals(result, UUID.fromString(result).toString());
    return result;
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
    assertTrue(photo.get("dataUrl") instanceof String);
    String data = (String) photo.get("dataUrl");
    String prefix = "data:image/jpeg;base64,";
    assertTrue(data.startsWith(prefix) && data.length() < 1024 * 1024);
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
    assertNotNull(image);
    try {
      assertEquals(96, image.getWidth()); assertEquals(64, image.getHeight());
      int left = image.getPixel(24, 32), right = image.getPixel(72, 32);
      assertTrue(Color.red(left) > 200 && Color.green(left) < 70 && Color.blue(left) < 70);
      assertTrue(Color.blue(right) > 200 && Color.green(right) < 70 && Color.red(right) < 70);
    } finally { image.recycle(); }
  }

  private static byte[] readBounded(InputStream input, int maximum) throws Exception {
    ByteArrayOutputStream output = new ByteArrayOutputStream();
    byte[] buffer = new byte[8192];
    int count;
    while ((count = input.read(buffer)) != -1) {
      assertTrue("Bounded synthetic test data", output.size() + count <= maximum);
      output.write(buffer, 0, count);
    }
    return output.toByteArray();
  }

  private static String hashFile(File file, int maximum) throws Exception {
    assertTrue("Required native encrypted file missing", file.isFile());
    try (InputStream input = new FileInputStream(file)) { return sha256(readBounded(input, maximum)); }
  }

  private static String sha256(byte[] bytes) throws Exception {
    StringBuilder result = new StringBuilder();
    for (byte value : MessageDigest.getInstance("SHA-256").digest(bytes)) result.append(String.format(java.util.Locale.ROOT, "%02x", value & 255));
    return result.toString();
  }

  private static void assertNoAtomicFiles(File file) {
    for (String suffix : new String[] { "", ".new", ".bak" }) assertFalse(new File(file.getPath() + suffix).exists());
  }

  private static void waitFor(String description, BooleanSupplier check, long timeout) {
    long deadline = SystemClock.elapsedRealtime() + timeout;
    do {
      if (check.getAsBoolean()) return;
      SystemClock.sleep(100);
    } while (SystemClock.elapsedRealtime() < deadline);
    fail("Timed out: " + description);
  }

  private final class SelectionTrace implements Application.ActivityLifecycleCallbacks, AutoCloseable {
    private final String id;
    private final Application application = (Application) context.getApplicationContext();
    private int created;
    private int destroyed;
    SelectionTrace(String selectionId) { id = selectionId; application.registerActivityLifecycleCallbacks(this); }
    private boolean matches(Activity activity) {
      return activity instanceof PhotoSelectionActivity && id.equals(activity.getIntent().getStringExtra(PhotoSelectionActivity.SELECTION_ID));
    }
    @Override public synchronized void onActivityCreated(Activity activity, Bundle saved) { if (matches(activity)) created++; }
    @Override public synchronized void onActivityDestroyed(Activity activity) { if (matches(activity)) destroyed++; }
    @Override public void onActivityStarted(Activity activity) {}
    @Override public void onActivityResumed(Activity activity) {}
    @Override public void onActivityPaused(Activity activity) {}
    @Override public void onActivityStopped(Activity activity) {}
    @Override public void onActivitySaveInstanceState(Activity activity, Bundle saved) {}
    synchronized int created() { return created; }
    synchronized int destroyed() { return destroyed; }
    @Override public void close() { application.unregisterActivityLifecycleCallbacks(this); }
  }
}

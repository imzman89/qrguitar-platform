package com.qrguitar.picker

import android.content.Context
import android.content.pm.ApplicationInfo
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.net.Uri
import android.os.Process
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.AtomicFile
import android.util.Base64
import androidx.exifinterface.media.ExifInterface
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.io.ByteArrayInputStream
import java.io.File
import java.security.KeyStore
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Actual Android Keystore, AtomicFile, AES-GCM, ContentResolver, BitmapFactory and EXIF.
 * Only URI-grant bookkeeping is injected: this suite does not launch the system picker,
 * obtain real persistable grants, kill an app process, or assert physical-device behavior.
 */
@RunWith(AndroidJUnit4::class)
class SelectionStoreInstrumentedTest {
  private lateinit var context: Context
  private lateinit var directory: File
  private lateinit var fixtures: File
  private val stores = mutableListOf<SelectionStore>()
  private val grants = FixtureGrants()
  private var ownsKeyAlias = false
  private val id = "selection-111111111111"

  private class FixtureGrants : UriPermissions {
    private val active = ConcurrentHashMap.newKeySet<String>()
    override fun take(uri: Uri) { active.add(uri.toString()) }
    override fun held(uri: Uri) = active.contains(uri.toString())
    override fun release(uri: Uri) { active.remove(uri.toString()) }
  }

  @Before fun isolatedTestApplication() {
    // Library connected tests have their own test APK/UID. Never erase an installed app key.
    context = InstrumentationRegistry.getInstrumentation().context
    assertEquals("Run the library test APK, not the consumer application", "com.qrguitar.picker.test", context.packageName)
    assertEquals(context.applicationInfo.uid, Process.myUid())
    assertTrue("The instrumentation APK must be test-only", context.applicationInfo.flags and ApplicationInfo.FLAG_TEST_ONLY != 0)
    assertFalse("Use a fresh test APK; refusing to overwrite a preexisting key", keyStore().containsAlias(KEY_ALIAS))
    ownsKeyAlias = true
    val sandbox = UUID.randomUUID().toString()
    directory = File(File(context.noBackupFilesDir, "qrguitar-picker-instrumentation-journals"), sandbox)
    fixtures = File(File(context.noBackupFilesDir, PickerFixtureProvider.FIXTURE_DIRECTORY), sandbox)
    assertTrue(directory.mkdirs())
    assertTrue(fixtures.mkdirs())
  }

  @After fun closeWorkersAndRemoveOnlyOwnedSandbox() {
    try {
      stores.toList().forEach { close(it) }
    } finally {
      if (ownsKeyAlias) {
        keyStore().deleteEntry(KEY_ALIAS)
        if (::directory.isInitialized) removeSandbox(directory, "qrguitar-picker-instrumentation-journals")
        if (::fixtures.isInitialized) removeSandbox(fixtures, PickerFixtureProvider.FIXTURE_DIRECTORY)
      }
    }
  }

  private fun removeSandbox(sandbox: File, parentName: String) {
    val expectedParent = File(context.noBackupFilesDir, parentName).canonicalFile
    assertEquals(expectedParent, sandbox.canonicalFile.parentFile)
    assertTrue(sandbox.name.matches(Regex("[a-f0-9-]{36}")))
    assertTrue("Test sandbox cleanup", !sandbox.exists() || sandbox.deleteRecursively())
  }

  private fun keyStore() = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }

  private fun store(fault: (String, String) -> Unit = { _, _ -> }): SelectionStore =
    // Deliberately leave keySource and imageReader null to exercise their production defaults.
    SelectionStore(context, directory = directory, permissions = grants, fault = fault).also { stores.add(it) }

  private fun close(store: SelectionStore) {
    store.closeForTests()
    stores.remove(store)
  }

  private fun createJpeg(width: Int = 80, height: Int = 40, withExif: Boolean = false): Uri {
    val file = File(fixtures, "${UUID.randomUUID()}.jpg")
    val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    try {
      val canvas = Canvas(bitmap)
      canvas.drawColor(Color.RED)
      canvas.drawRect(width / 2f, 0f, width.toFloat(), height.toFloat(), Paint().apply { color = Color.BLUE })
      file.outputStream().use { assertTrue(bitmap.compress(Bitmap.CompressFormat.JPEG, 100, it)) }
    } finally {
      bitmap.recycle()
    }
    if (withExif) {
      ExifInterface(file).apply {
        setAttribute(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_ROTATE_90.toString())
        setAttribute(ExifInterface.TAG_MAKE, PRIVATE_MARKER)
        setAttribute(ExifInterface.TAG_USER_COMMENT, PRIVATE_MARKER)
        setLatLong(37.4219999, -122.0840575)
        saveAttributes()
      }
    }
    return Uri.Builder().scheme("content").authority(context.packageName + ".qrguitar.fixture")
      .appendPath(fixtures.name).appendPath(file.name).build()
  }

  private fun process(store: SelectionStore, uri: Uri, budget: Int = SelectionPolicy.MAX_TOTAL_BYTES): Map<String, Any> {
    val done = CountDownLatch(1)
    val off = store.listen { changedId, status ->
      if (changedId == id && status in listOf("ready", "failed")) done.countDown()
    }
    try {
      assertTrue(store.prepare(id, 1, budget))
      assertTrue(store.claimLaunch(id))
      store.capture(id, listOf(uri))
      assertTrue("Native image processing must finish within 15 seconds", done.await(15, TimeUnit.SECONDS))
      return store.read(id)
    } finally {
      off()
    }
  }

  private fun ready(store: SelectionStore, uri: Uri = createJpeg()): Map<String, Any> = process(store, uri).also {
    assertEquals("ready", it["status"])
  }

  private fun jpeg(snapshot: Map<String, Any>): ByteArray {
    @Suppress("UNCHECKED_CAST")
    val photos = snapshot["photos"] as List<Map<String, String>>
    assertEquals(1, photos.size)
    assertTrue(photos.single().getValue("id").matches(Regex("[a-f0-9-]{36}")))
    val dataUrl = photos.single().getValue("dataUrl")
    assertTrue(dataUrl.startsWith("data:image/jpeg;base64,"))
    return Base64.decode(dataUrl.substringAfter(','), Base64.NO_WRAP)
  }

  private fun record(): JSONObject {
    val name = "$id.record"
    val sealed = File(directory, name).readBytes()
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.DECRYPT_MODE, keyStore().getKey(KEY_ALIAS, null) as SecretKey,
      GCMParameterSpec(128, sealed.copyOfRange(1, 13)))
    cipher.updateAAD(("qrguitar-picker-v1/" + name).toByteArray(Charsets.UTF_8))
    return JSONObject(String(cipher.doFinal(sealed.copyOfRange(13, sealed.size)), Charsets.UTF_8))
  }

  private fun containsBytes(haystack: ByteArray, needle: ByteArray): Boolean =
    needle.isNotEmpty() && haystack.size >= needle.size && (0..haystack.size - needle.size).any { offset ->
      needle.indices.all { index -> haystack[offset + index] == needle[index] }
    }

  private fun assertOnlyTombstone() {
    assertEquals(listOf("$id.record"), directory.listFiles()!!.map { it.name })
    assertFalse(record().has("sources"))
    assertFalse(record().has("assets"))
  }

  @Test(timeout = 30000) fun realKeyReadyReceiptSurvivesReopenAndExactAcknowledgement() {
    val uri = createJpeg(withExif = true)
    val first = store()
    val result = ready(first, uri)
    assertEquals(result, first.read(id))
    val key = keyStore().getKey(KEY_ALIAS, null) as SecretKey
    assertEquals("AES", key.algorithm)
    assertNull("Android Keystore key material must not be exportable", key.encoded)
    val normalized = jpeg(result)
    // Fixture source JPEGs are outside the journal directory. Check only persisted app journal bytes.
    directory.listFiles()!!.forEach { file ->
      val sealed = file.readBytes()
      assertEquals(1.toByte(), sealed[0])
      assertFalse(containsBytes(sealed, uri.toString().toByteArray(Charsets.UTF_8)))
      assertFalse(containsBytes(sealed, "data:image/jpeg".toByteArray(Charsets.UTF_8)))
      assertFalse(containsBytes(sealed, PRIVATE_MARKER.toByteArray(Charsets.UTF_8)))
      assertFalse(containsBytes(sealed, normalized.copyOfRange(0, minOf(normalized.size, 64))))
    }
    close(first)
    val reopened = store()
    assertEquals(result, reopened.read(id))
    assertThrows(IllegalStateException::class.java) { reopened.acknowledge(id, "incorrect-receipt-111") }
    assertEquals(result, reopened.read(id))
    val receipt = result["resultId"] as String
    assertEquals("acknowledged", reopened.acknowledge(id, receipt)["status"])
    assertEquals("acknowledged", reopened.acknowledge(id, receipt)["status"])
    assertFalse(grants.held(uri))
    assertOnlyTombstone()
    close(reopened)
    val finalStore = store()
    assertEquals("acknowledged", finalStore.read(id)["status"])
    assertEquals("acknowledged", finalStore.acknowledge(id, receipt)["status"])
    assertFalse(finalStore.prepare(id, 1, SelectionPolicy.MAX_TOTAL_BYTES))
  }

  @Test(timeout = 30000) fun durableDiscardCannotBeRevivedAfterReopen() {
    val uri = createJpeg()
    val first = store()
    ready(first, uri)
    assertEquals("discarded", first.discard(id)["status"])
    assertOnlyTombstone()
    close(first)
    val reopened = store()
    assertFalse(reopened.prepare(id, 1, SelectionPolicy.MAX_TOTAL_BYTES))
    assertFalse(reopened.claimLaunch(id))
    reopened.capture(id, listOf(uri))
    assertEquals("discarded", reopened.read(id)["status"])
    assertFalse(grants.held(uri))
    assertOnlyTombstone()
  }

  @Test(timeout = 30000) fun missingDefaultKeyFailsWithoutGeneratingReplacementOrErasingJournal() {
    val first = store()
    ready(first)
    close(first)
    val before = File(directory, "$id.record").readBytes()
    keyStore().deleteEntry(KEY_ALIAS)
    val reopened = store()
    assertThrows(IllegalStateException::class.java) { reopened.read(id) }
    assertFalse(keyStore().containsAlias(KEY_ALIAS))
    assertArrayEquals(before, File(directory, "$id.record").readBytes())
  }

  @Test(timeout = 30000) fun replacedDefaultKeyCannotAuthenticateExistingRecord() {
    val first = store()
    assertTrue(first.prepare(id, 1, 1024))
    close(first)
    val before = File(directory, "$id.record").readBytes()
    keyStore().deleteEntry(KEY_ALIAS)
    KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
      init(KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setKeySize(256).setUserAuthenticationRequired(false).build())
    }.generateKey()
    val reopened = store()
    assertThrows(Exception::class.java) { reopened.read(id) }
    assertArrayEquals(before, File(directory, "$id.record").readBytes())
  }

  @Test(timeout = 30000) fun tamperedImageAndRecordFailAuthenticationWithoutBecomingMissing() {
    val store = store()
    val result = ready(store)
    val image = directory.listFiles()!!.single { it.name.endsWith(".image") }
    val originalImage = image.readBytes()
    val tamperedImage = originalImage.copyOf().apply { this[lastIndex] = (last().toInt() xor 1).toByte() }
    image.writeBytes(tamperedImage)
    assertThrows(Exception::class.java) { store.read(id) }
    assertArrayEquals(tamperedImage, image.readBytes())
    image.writeBytes(originalImage)
    assertEquals(result, store.read(id))
    val journal = File(directory, "$id.record")
    val tamperedRecord = journal.readBytes().apply { this[lastIndex] = (last().toInt() xor 1).toByte() }
    journal.writeBytes(tamperedRecord)
    assertThrows(Exception::class.java) { store.read(id) }
    assertArrayEquals(tamperedRecord, journal.readBytes())
  }

  @Test(timeout = 30000) fun interruptedAtomicFileOverwriteRetainsPreviousDurableRecord() {
    val first = store()
    assertTrue(first.prepare(id, 1, 1024))
    val before = first.read(id)
    val journal = File(directory, "$id.record")
    val original = journal.readBytes()
    close(first)
    // Simulate an interrupted overwrite, without claiming to kill/recreate an Android process.
    AtomicFile(journal).startWrite().use { partial ->
      partial.write(byteArrayOf(1, 2, 3, 4))
      partial.fd.sync()
      // Intentionally neither finishWrite nor failWrite: reopening must recover the older commit.
    }
    val reopened = store()
    assertEquals(before, reopened.read(id))
    assertArrayEquals(original, journal.readBytes())
    assertFalse(File(directory, "$id.record.new").exists())
    assertFalse(File(directory, "$id.record.bak").exists())
  }

  @Test(timeout = 30000) fun interruptedTerminalCleanupRetriesWithRealKeyOnStoreReopen() {
    val uri = createJpeg()
    val first = store { stage, _ -> if (stage == "beforeCleanup") error("instrumentation cleanup interruption") }
    val result = ready(first, uri)
    assertEquals("acknowledged", first.acknowledge(id, result["resultId"] as String)["status"])
    assertTrue(record().has("sources"))
    assertTrue(directory.listFiles()!!.any { it.name.endsWith(".image") })
    close(first)
    val reopened = store()
    reopened.executor.submit {}.get(5, TimeUnit.SECONDS)
    assertEquals("acknowledged", reopened.read(id)["status"])
    assertOnlyTombstone()
    assertFalse(grants.held(uri))
  }

  @Test(timeout = 30000) fun actualJpegNormalizationAppliesExifOrientationAndRemovesPrivateMetadata() {
    val normalized = jpeg(ready(store(), createJpeg(withExif = true)))
    assertEquals(0xff.toByte(), normalized[0])
    assertEquals(0xd8.toByte(), normalized[1])
    val bitmap = requireNotNull(BitmapFactory.decodeByteArray(normalized, 0, normalized.size))
    try {
      assertEquals(40, bitmap.width)
      assertEquals(80, bitmap.height)
      val top = bitmap.getPixel(20, 10)
      val bottom = bitmap.getPixel(20, 70)
      assertTrue("Rotated upper half should be red", Color.red(top) > 180 && Color.blue(top) < 80)
      assertTrue("Rotated lower half should be blue", Color.blue(bottom) > 180 && Color.red(bottom) < 80)
    } finally {
      bitmap.recycle()
    }
    val exif = ExifInterface(ByteArrayInputStream(normalized))
    assertNull(exif.getAttribute(ExifInterface.TAG_GPS_LATITUDE))
    assertNull(exif.getAttribute(ExifInterface.TAG_GPS_LONGITUDE))
    assertNull(exif.getAttribute(ExifInterface.TAG_MAKE))
    assertNull(exif.getAttribute(ExifInterface.TAG_USER_COMMENT))
    assertTrue(exif.getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_UNDEFINED)
      in listOf(ExifInterface.ORIENTATION_UNDEFINED, ExifInterface.ORIENTATION_NORMAL))
    assertFalse(containsBytes(normalized, PRIVATE_MARKER.toByteArray(Charsets.UTF_8)))
  }

  @Test(timeout = 30000) fun actualDecoderSamplesWideImagesBeforeJpegNormalization() {
    val normalized = jpeg(ready(store(), createJpeg(width = 5000, height = 12)))
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(normalized, 0, normalized.size, bounds)
    assertEquals(2500, bounds.outWidth)
    assertEquals(6, bounds.outHeight)
    assertTrue(bounds.outWidth <= 4096 && bounds.outHeight <= 4096)
  }

  @Test(timeout = 30000) fun actualEncodedImageCannotExceedRemainingDraftBudget() {
    val uri = createJpeg()
    val store = store()
    val result = process(store, uri, budget = 64)
    assertEquals("failed", result["status"])
    assertEquals("image_too_large", result["code"])
    assertFalse(result.containsKey("photos"))
    assertOnlyTombstone()
    assertFalse(grants.held(uri))
    assertFalse(store.prepare(id, 1, 64))
  }

  companion object {
    private const val KEY_ALIAS = "qrguitar.photo-picker.v1.aes"
    private const val PRIVATE_MARKER = "QRguitar-private-fixture-metadata-should-not-survive"
  }
}

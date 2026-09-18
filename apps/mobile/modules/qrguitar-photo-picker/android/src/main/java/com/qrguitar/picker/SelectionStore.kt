package com.qrguitar.picker

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.Uri
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.AtomicFile
import android.util.Base64
import androidx.exifinterface.media.ExifInterface
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.security.KeyStore
import java.security.MessageDigest
import java.util.UUID
import java.util.concurrent.CopyOnWriteArraySet
import java.util.concurrent.Executors
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

internal interface UriPermissions {
  fun take(uri: Uri)
  fun held(uri: Uri): Boolean
  fun release(uri: Uri)
}
private class AndroidUriPermissions(private val context: Context) : UriPermissions {
  override fun take(uri: Uri) = context.contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
  override fun held(uri: Uri) = context.contentResolver.persistedUriPermissions.any { it.uri == uri && it.isReadPermission }
  override fun release(uri: Uri) = context.contentResolver.releasePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
}

/** The Android application process is the only writer. No account IDs or tokens enter this store. */
internal class SelectionStore internal constructor(
  private val context: Context,
  private val directory: File = File(context.noBackupFilesDir, "qrguitar-photo-picker-v1"),
  private val keySource: (() -> SecretKey)? = null,
  private val permissions: UriPermissions = AndroidUriPermissions(context),
  private val imageReader: ((Uri) -> ByteArray)? = null,
  private val fault: (String, String) -> Unit = { _, _ -> }
) {
  private val lock = Any()
  private val listeners = CopyOnWriteArraySet<(String, String) -> Unit>()
  private val processing = mutableSetOf<String>()
  val executor = Executors.newSingleThreadExecutor()
  private val imageWorker = Executors.newFixedThreadPool(2)

  init { executor.execute { retryTerminalCleanup() } }

  companion object {
    private const val KEY_ALIAS = "qrguitar.photo-picker.v1.aes"
    @Volatile private var instance: SelectionStore? = null
    fun get(context: Context): SelectionStore = instance ?: synchronized(this) {
      instance ?: SelectionStore(context.applicationContext).also { instance = it }
    }
  }

  fun listen(listener: (String, String) -> Unit): () -> Unit {
    listeners.add(listener)
    return { listeners.remove(listener) }
  }

  private fun key(): SecretKey {
    keySource?.let { return it() }
    val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (store.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
    // A missing key with existing encrypted data is corruption, not a fresh account.
    check(directory.listFiles().isNullOrEmpty()) { "storage_unavailable" }
    return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
      init(KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setKeySize(256)
        .setUserAuthenticationRequired(false)
        .build())
    }.generateKey()
  }

  private fun atomic(name: String): AtomicFile {
    check(directory.isDirectory || directory.mkdirs()) { "storage_unavailable" }
    return AtomicFile(File(directory, name))
  }

  private fun writeEncrypted(name: String, bytes: ByteArray) {
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, key())
    cipher.updateAAD(("qrguitar-picker-v1/" + name).toByteArray(Charsets.UTF_8))
    val sealed = byteArrayOf(1) + cipher.iv + cipher.doFinal(bytes)
    val file = atomic(name)
    val output = file.startWrite()
    try {
      output.write(sealed)
      file.finishWrite(output)
    } catch (error: Exception) {
      file.failWrite(output)
      throw error
    }
    check(readEncrypted(name, bytes.size + 64).contentEquals(bytes)) { "storage_unavailable" }
  }

  private fun readEncrypted(name: String, maximum: Int): ByteArray {
    val file = atomic(name)
    val sealed = file.openRead().use { input ->
      val out = ByteArrayOutputStream()
      val buffer = ByteArray(8192)
      while (true) {
        val count = input.read(buffer, 0, minOf(buffer.size, maximum + 1 - out.size()))
        if (count < 0) break
        if (count == 0 || out.size() + count > maximum) error("storage_unavailable")
        out.write(buffer, 0, count)
      }
      val data = out.toByteArray()
      check(data.size <= maximum && data.size >= 29 && data[0] == 1.toByte()) { "storage_unavailable" }
      data
    }
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, sealed.copyOfRange(1, 13)))
    cipher.updateAAD(("qrguitar-picker-v1/" + name).toByteArray(Charsets.UTF_8))
    return cipher.doFinal(sealed.copyOfRange(13, sealed.size))
  }

  private fun record(id: String): JSONObject? {
    SelectionPolicy.requireId(id)
    val name = "$id.record"
    val file = File(directory, name)
    if (!file.exists() && !File(directory, "$name.bak").exists()) return null
    val value = JSONObject(String(readEncrypted(name, 64 * 1024), Charsets.UTF_8))
    check(value.getInt("version") == 1 && value.getString("selectionId") == id) { "storage_unavailable" }
    SelectionPolicy.status(value.getString("phase"))
    return value
  }

  private fun commit(value: JSONObject) {
    val id = value.getString("selectionId")
    val bytes = value.toString().toByteArray(Charsets.UTF_8)
    check(bytes.size < 64 * 1024) { "storage_unavailable" }
    writeEncrypted("$id.record", bytes)
    val status = SelectionPolicy.status(value.getString("phase"))
    listeners.forEach { listener -> runCatching { listener(id, status) } }
  }

  private fun newRecord(id: String, phase: String) = JSONObject()
    .put("version", 1).put("selectionId", id).put("phase", phase)

  /** Returns true only for a newly prepared identity. Duplicate/terminal calls never launch. */
  fun prepare(id: String, maxAssets: Int, remainingBytes: Int): Boolean = synchronized(lock) {
    SelectionPolicy.requireId(id)
    SelectionPolicy.requireOptions(maxAssets, remainingBytes)
    val old = record(id)
    if (old != null) {
      if (old.has("maxAssets")) check(old.getInt("maxAssets") == maxAssets && old.getInt("remainingBytes") == remainingBytes) { "request_changed" }
      return@synchronized false
    }
    commit(newRecord(id, "prepared").put("maxAssets", maxAssets).put("remainingBytes", remainingBytes))
    true
  }

  /** The dedicated Activity claims its prepared record once, before dispatching Android UI. */
  fun claimLaunch(id: String): Boolean = synchronized(lock) {
    val value = record(id) ?: return@synchronized false
    if (value.getString("phase") != "prepared") return@synchronized false
    commit(value.put("phase", "launched"))
    true
  }

  fun dispatchPrepared(id: String, dispatch: () -> Unit) = synchronized(lock) {
    if (record(id)?.getString("phase") == "prepared") dispatch()
  }

  fun resumeActivity(id: String): Boolean = synchronized(lock) {
    val value = record(id) ?: return@synchronized false
    if (value.getString("phase") == "captured") schedule(id)
    value.getString("phase") == "launched"
  }

  fun maximumAssets(id: String): Int = synchronized(lock) {
    val count = record(id)?.getInt("maxAssets") ?: error("selection_missing")
    check(count in 1..SelectionPolicy.MAX_ASSETS) { "invalid_options" }
    count
  }

  fun cancelled(id: String) = synchronized(lock) {
    val value = record(id) ?: return@synchronized
    if (SelectionPolicy.acceptsCallback(value.getString("phase"))) commit(value.put("phase", "cancelled"))
  }

  fun failLaunch(id: String) = synchronized(lock) {
    val value = record(id) ?: return@synchronized
    if (value.getString("phase") in listOf("prepared", "launched")) {
      commit(value.put("phase", "failed").put("code", "picker_unavailable"))
    }
  }

  /** Small URI receipt commits before the Activity finishes; no bytes or URI enter JS here. */
  fun capture(id: String, uris: List<Uri>) = synchronized(lock) {
    val value = record(id) ?: return@synchronized
    if (!SelectionPolicy.acceptsCallback(value.getString("phase"))) return@synchronized
    if (uris.isEmpty() || uris.size > value.getInt("maxAssets") || uris.any { it.scheme != "content" }) {
      commit(value.put("phase", "failed").put("code", "invalid_selection"))
      return@synchronized
    }
    val receipt = JSONArray()
    for (uri in uris) receipt.put(JSONObject().put("uri", uri.toString()).put("id", UUID.randomUUID().toString()))
    // Keep the URI identities before taking grants, so partial acquisition remains attributable.
    commit(value.put("phase", "captured").put("sources", receipt).put("resultId", UUID.randomUUID().toString()))
    for (uri in uris) {
      // Android's visual picker and the document fallback support persistable selected-URI access.
      try { permissions.take(uri) }
      catch (_: Exception) {
        commit(value.put("phase", "failed").put("code", "permission_unavailable"))
        return@synchronized
      }
    }
    schedule(id)
  }

  private fun schedule(id: String) {
    // All calls originate under lock. read() resumes a captured request after process recreation.
    if (!processing.add(id)) return
    imageWorker.execute {
      try { process(id) }
      finally { synchronized(lock) { processing.remove(id) } }
    }
  }

  fun read(id: String): Map<String, Any> = synchronized(lock) {
    val value = record(id) ?: return@synchronized mapOf("selectionId" to id, "status" to "missing")
    if (value.getString("phase") == "captured") schedule(id)
    if (value.getString("phase") in listOf("acknowledged", "discarded", "failed", "cancelled")) cleanAssets(value)
    snapshot(value)
  }

  private fun snapshot(value: JSONObject): Map<String, Any> {
    val id = value.getString("selectionId")
    val phase = value.getString("phase")
    val result = mutableMapOf<String, Any>("selectionId" to id, "status" to SelectionPolicy.status(phase))
    if (phase == "failed") result["code"] = value.optString("code", "selection_unavailable")
    if (phase == "ready") {
      val assets = value.getJSONArray("assets")
      check(assets.length() in 1..SelectionPolicy.MAX_ASSETS) { "storage_unavailable" }
      var total = 0
      result["resultId"] = value.getString("resultId")
      result["photos"] = (0 until assets.length()).map { index ->
        val asset = assets.getJSONObject(index)
        val assetId = asset.getString("id")
        SelectionPolicy.requireId(assetId)
        val bytes = readEncrypted("$id-$assetId.image", SelectionPolicy.MAX_IMAGE_BYTES + 64)
        SelectionPolicy.requireImageSize(bytes.size, total, value.getInt("remainingBytes"))
        total += bytes.size
        check(bytes.size == asset.getInt("bytes") && hash(bytes) == asset.getString("sha256")) { "storage_unavailable" }
        mapOf("id" to assetId, "dataUrl" to ("data:image/jpeg;base64," + Base64.encodeToString(bytes, Base64.NO_WRAP)))
      }
    }
    return result
  }

  fun acknowledge(id: String, resultId: String): Map<String, Any> = synchronized(lock) {
    SelectionPolicy.requireId(resultId)
    val value = record(id) ?: error("selection_missing")
    check(SelectionPolicy.mayAcknowledge(value.getString("phase"), value.optString("resultId"), resultId)) { "receipt_changed" }
    if (value.getString("phase") != "acknowledged") commit(value.put("phase", "acknowledged"))
    cleanAssets(value)
    snapshot(value)
  }

  /** Missing IDs also get tombstones, fencing a delayed start that has not reached native yet. */
  fun discard(id: String): Map<String, Any> = synchronized(lock) {
    SelectionPolicy.requireId(id)
    val value = record(id) ?: newRecord(id, "discarded")
    if (value.getString("phase") != "acknowledged") commit(value.put("phase", "discarded"))
    cleanAssets(value)
    snapshot(value)
  }

  private fun cleanAssets(value: JSONObject) {
    val id = value.getString("selectionId")
    // The durable tombstone is the commit; interrupted cleanup only leaves encrypted orphans.
    val sources = value.optJSONArray("sources") ?: return
    try {
      fault("beforeCleanup", id)
      for (index in 0 until sources.length()) {
        val assetId = sources.getJSONObject(index).getString("id")
        SelectionPolicy.requireId(assetId)
        val name = "$id-$assetId.image"
        atomic(name).delete()
        check(listOf(name, "$name.new", "$name.bak").none { File(directory, it).exists() }) { "storage_unavailable" }
      }
      val retainedUris = mutableSetOf<String>()
      // URI grants are app-wide. Another active journal may still need the same selected document.
      directory.listFiles()?.filter { it.name.endsWith(".record") && it.name != "$id.record" }?.forEach { file ->
        val other = record(file.name.removeSuffix(".record")) ?: return@forEach
        if (other.getString("phase") in listOf("acknowledged", "discarded", "failed", "cancelled")) return@forEach
        val otherSources = other.optJSONArray("sources") ?: return@forEach
        for (index in 0 until otherSources.length()) retainedUris.add(otherSources.getJSONObject(index).getString("uri"))
      }
      for (index in 0 until sources.length()) {
        val uri = Uri.parse(sources.getJSONObject(index).getString("uri"))
        if (uri.toString() !in retainedUris && permissions.held(uri)) permissions.release(uri)
      }
      fault("beforeCompaction", id)
      val compact = newRecord(id, value.getString("phase"))
      for (key in listOf("resultId", "maxAssets", "remainingBytes", "code")) if (value.has(key)) compact.put(key, value.get(key))
      commit(compact)
    } catch (_: Exception) {
      // Retain the cleanup manifest. read() and initialization retry; do not remove the tombstone.
    }
  }

  private fun retryTerminalCleanup() = synchronized(lock) {
    directory.listFiles()?.filter { it.name.endsWith(".record") }?.forEach { file ->
      runCatching {
        val value = record(file.name.removeSuffix(".record")) ?: return@runCatching
        if (value.getString("phase") in listOf("acknowledged", "discarded", "failed", "cancelled")) cleanAssets(value)
      }
    }
  }

  internal fun closeForTests() {
    executor.shutdownNow()
    imageWorker.shutdownNow()
    executor.awaitTermination(5, java.util.concurrent.TimeUnit.SECONDS)
    imageWorker.awaitTermination(5, java.util.concurrent.TimeUnit.SECONDS)
  }

  private fun process(id: String) {
    val initial = synchronized(lock) { record(id)?.takeIf { it.getString("phase") == "captured" } } ?: return
    val sources = initial.getJSONArray("sources")
    val assets = JSONArray()
    var total = 0
    try {
      for (index in 0 until sources.length()) {
        val source = sources.getJSONObject(index)
        val assetId = source.getString("id")
        // A captured URI record may precede the final grant write during process death.
        synchronized(lock) {
          val current = record(id) ?: return
          if (current.getString("phase") != "captured" || current.getString("resultId") != initial.getString("resultId")) return
          permissions.take(Uri.parse(source.getString("uri")))
        }
        val bytes = imageReader?.invoke(Uri.parse(source.getString("uri"))) ?: normalizedJpeg(Uri.parse(source.getString("uri")))
        SelectionPolicy.requireImageSize(bytes.size, total, initial.getInt("remainingBytes"))
        synchronized(lock) {
          val current = record(id) ?: return
          if (current.getString("phase") != "captured" || current.getString("resultId") != initial.getString("resultId")) return
          writeEncrypted("$id-$assetId.image", bytes)
        }
        assets.put(JSONObject().put("id", assetId).put("bytes", bytes.size).put("sha256", hash(bytes)))
        total += bytes.size
      }
      synchronized(lock) {
        val current = record(id) ?: return
        if (current.getString("phase") != "captured" || current.getString("resultId") != initial.getString("resultId")) return
        commit(current.put("assets", assets).put("phase", "ready"))
      }
    } catch (error: Exception) {
      synchronized(lock) {
        val current = record(id) ?: return
        if (current.getString("phase") != "captured") return
        val code = if (error is IllegalArgumentException && error.message == "image_too_large") "image_too_large" else "selection_unavailable"
        commit(current.put("phase", "failed").put("code", code))
      }
    }
  }

  private fun hash(bytes: ByteArray): String = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it.toInt() and 255) }

  /** Encode once natively; JS receives stable supported JPEG bytes without EXIF/location metadata. */
  private fun normalizedJpeg(uri: Uri): ByteArray {
    val resolver = context.contentResolver
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    (resolver.openInputStream(uri) ?: error("selection_unavailable")).use { BitmapFactory.decodeStream(it, null, bounds) }
    check(bounds.outWidth > 0 && bounds.outHeight > 0) { "selection_unavailable" }
    var sample = 1
    while (bounds.outWidth / sample > 4096 || bounds.outHeight / sample > 4096) sample *= 2
    val options = BitmapFactory.Options().apply { inSampleSize = sample; inPreferredConfig = Bitmap.Config.ARGB_8888 }
    val original = resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, options) } ?: error("selection_unavailable")
    var transformed: Bitmap? = null
    try {
      val orientation = resolver.openInputStream(uri)?.use { ExifInterface(it).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL) }
      val matrix = Matrix().apply {
        when (orientation) {
          ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> setScale(-1f, 1f)
          ExifInterface.ORIENTATION_ROTATE_180 -> setRotate(180f)
          ExifInterface.ORIENTATION_FLIP_VERTICAL -> setScale(1f, -1f)
          ExifInterface.ORIENTATION_TRANSPOSE -> { setRotate(90f); postScale(-1f, 1f) }
          ExifInterface.ORIENTATION_ROTATE_90 -> setRotate(90f)
          ExifInterface.ORIENTATION_TRANSVERSE -> { setRotate(270f); postScale(-1f, 1f) }
          ExifInterface.ORIENTATION_ROTATE_270 -> setRotate(270f)
        }
      }
      val image = if (matrix.isIdentity) original else Bitmap.createBitmap(original, 0, 0, original.width, original.height, matrix, true)
      transformed = image
      val output = object : ByteArrayOutputStream() {
        override fun write(bytes: ByteArray, offset: Int, length: Int) {
          require(count.toLong() + length <= SelectionPolicy.MAX_IMAGE_BYTES) { "image_too_large" }
          super.write(bytes, offset, length)
        }
        override fun write(value: Int) {
          require(count < SelectionPolicy.MAX_IMAGE_BYTES) { "image_too_large" }
          super.write(value)
        }
      }
      check(image.compress(Bitmap.CompressFormat.JPEG, 85, output)) { "selection_unavailable" }
      return output.toByteArray()
    } finally {
      if (transformed != null && transformed !== original) transformed.recycle()
      original.recycle()
    }
  }
}

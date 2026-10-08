package com.qrguitar.picker

import android.content.Context
import android.net.Uri
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import java.io.File
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Actual store/AtomicFile/AES-GCM code; Android Keystore, grants and bitmap decoding are injected. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28], manifest = Config.NONE)
class SelectionStoreTest {
  @get:Rule val temp = TemporaryFolder()
  private val stores = mutableListOf<SelectionStore>()
  private val context: Context get() = RuntimeEnvironment.getApplication()
  private val key: SecretKey = KeyGenerator.getInstance("AES").apply { init(256) }.generateKey()
  private val bytes = byteArrayOf(0xff.toByte(), 0xd8.toByte(), 0xff.toByte()) + ByteArray(40) { (it + 10).toByte() }
  private val uri = Uri.parse("content://qrguitar-test/photos/private-1")
  private val id = "selection-111111111111"
  private val otherId = "selection-222222222222"

  private class Grants : UriPermissions {
    val active = ConcurrentHashMap.newKeySet<String>()
    val released = mutableListOf<String>()
    override fun take(uri: Uri) { active.add(uri.toString()) }
    override fun held(uri: Uri) = active.contains(uri.toString())
    @Synchronized override fun release(uri: Uri) { active.remove(uri.toString()); released.add(uri.toString()) }
  }

  private fun store(
    directory: File = temp.newFolder(),
    grants: Grants = Grants(),
    fixtureKey: SecretKey = key,
    fault: (String, String) -> Unit = { _, _ -> },
    decoder: (Uri) -> ByteArray = { bytes }
  ): SelectionStore = SelectionStore(context, directory, { fixtureKey }, grants, decoder, fault).also { stores.add(it) }

  @After fun stopWorkers() { stores.forEach { it.closeForTests() } }

  private fun makeReady(store: SelectionStore, selection: String = id, selectedUri: Uri = uri): Map<String, Any> {
    val done = CountDownLatch(1)
    val off = store.listen { eventId, status -> if (eventId == selection && status in listOf("ready", "failed")) done.countDown() }
    assertTrue(store.prepare(selection, 8, SelectionPolicy.MAX_TOTAL_BYTES))
    assertTrue(store.claimLaunch(selection))
    store.capture(selection, listOf(selectedUri))
    assertTrue("Native processing must finish", done.await(5, TimeUnit.SECONDS))
    off()
    return store.read(selection).also { assertEquals("ready", it["status"]) }
  }

  private fun record(directory: File, selection: String): JSONObject {
    val name = "$selection.record"
    val sealed = File(directory, name).readBytes()
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, sealed.copyOfRange(1, 13)))
    cipher.updateAAD(("qrguitar-picker-v1/" + name).toByteArray(Charsets.UTF_8))
    return JSONObject(String(cipher.doFinal(sealed.copyOfRange(13, sealed.size)), Charsets.UTF_8))
  }

  @Test fun prepareIsIdempotentAndCannotChangeOptionsOrRelaunch() {
    val store = store()
    assertTrue(store.prepare(id, 2, 1024))
    assertFalse(store.prepare(id, 2, 1024))
    assertThrows(IllegalStateException::class.java) { store.prepare(id, 3, 1024) }
    var dispatches = 0
    store.dispatchPrepared(id) { dispatches++ }
    assertTrue(store.claimLaunch(id))
    assertFalse(store.claimLaunch(id))
    store.dispatchPrepared(id) { dispatches++ }
    assertEquals(1, dispatches)
  }

  @Test fun missingDiscardTombstoneFencesDelayedStartAndCallbackAcrossRestart() {
    val directory = temp.newFolder()
    val first = store(directory)
    assertEquals("missing", first.read(id)["status"])
    assertEquals("discarded", first.discard(id)["status"])
    first.closeForTests()
    val second = store(directory)
    assertFalse(second.prepare(id, 1, 1000))
    assertFalse(second.claimLaunch(id))
    second.capture(id, listOf(uri))
    assertEquals("discarded", second.read(id)["status"])
  }

  @Test fun cancelledAndUnknownCallbacksCannotBecomeReady() {
    val store = store()
    store.capture(id, listOf(uri))
    assertEquals("missing", store.read(id)["status"])
    assertTrue(store.prepare(id, 1, 1000))
    assertTrue(store.claimLaunch(id))
    store.cancelled(id)
    store.capture(id, listOf(uri))
    assertEquals("cancelled", store.read(id)["status"])
    assertFalse(store.prepare(id, 1, 1000))
  }

  @Test fun encryptedReadyReadsSurviveRestartAndExactAcknowledgementIsIdempotent() {
    val directory = temp.newFolder()
    val grants = Grants()
    val first = store(directory, grants)
    val ready = makeReady(first)
    assertEquals(ready, first.read(id))
    val onDisk = directory.listFiles()!!.flatMap { it.readBytes().asIterable() }.toByteArray()
    assertFalse(String(onDisk, Charsets.ISO_8859_1).contains(uri.toString()))
    assertFalse(String(onDisk, Charsets.ISO_8859_1).contains("data:image/jpeg"))
    first.closeForTests()
    val second = store(directory, grants)
    assertEquals(ready, second.read(id))
    assertThrows(IllegalStateException::class.java) { second.acknowledge(id, "incorrect-receipt-111") }
    assertEquals(ready, second.read(id))
    val receipt = ready["resultId"] as String
    assertEquals("acknowledged", second.acknowledge(id, receipt)["status"])
    assertEquals("acknowledged", second.acknowledge(id, receipt)["status"])
    assertFalse(second.prepare(id, 8, SelectionPolicy.MAX_TOTAL_BYTES))
    assertFalse(record(directory, id).has("sources"))
    assertFalse(record(directory, id).has("assets"))
    assertEquals(listOf("$id.record"), directory.listFiles()!!.map { it.name })
  }

  @Test fun terminalCommitRetainsCleanupManifestUntilRestartSuccessfullyDeletesBytes() {
    val directory = temp.newFolder()
    val grants = Grants()
    val first = store(directory, grants, fault = { stage, _ -> if (stage == "beforeCleanup") throw IllegalStateException("fixture fault") })
    val ready = makeReady(first)
    assertEquals("acknowledged", first.acknowledge(id, ready["resultId"] as String)["status"])
    assertTrue(record(directory, id).has("sources"))
    assertTrue(directory.listFiles()!!.any { it.name.endsWith(".image") })
    first.closeForTests()
    val second = store(directory, grants)
    second.executor.submit {}.get(5, TimeUnit.SECONDS)
    assertEquals("acknowledged", second.read(id)["status"])
    assertFalse(record(directory, id).has("sources"))
    assertFalse(directory.listFiles()!!.any { it.name.endsWith(".image") })
    assertFalse(grants.held(uri))
  }

  @Test fun compactionFailureKeepsIdentityAndCleanupCanRepeatWithoutImagesOrGrant() {
    val directory = temp.newFolder()
    val grants = Grants()
    var fail = true
    val store = store(directory, grants, fault = { stage, _ -> if (fail && stage == "beforeCompaction") throw IllegalStateException("fixture fault") })
    makeReady(store)
    assertEquals("discarded", store.discard(id)["status"])
    assertTrue(record(directory, id).has("sources"))
    assertFalse(grants.held(uri))
    fail = false
    assertEquals("discarded", store.read(id)["status"])
    assertFalse(record(directory, id).has("sources"))
    store.capture(id, listOf(uri))
    assertEquals("discarded", store.read(id)["status"])
  }

  @Test fun sharedGrantRemainsUntilLastReadyRequestIsRetired() {
    val grants = Grants()
    val store = store(grants = grants)
    val first = makeReady(store)
    val second = makeReady(store, otherId)
    store.acknowledge(id, first["resultId"] as String)
    assertTrue(grants.held(uri))
    assertTrue(grants.released.isEmpty())
    assertEquals(second, store.read(otherId))
    store.acknowledge(otherId, second["resultId"] as String)
    assertFalse(grants.held(uri))
    assertEquals(listOf(uri.toString()), grants.released)
  }

  @Test fun prefixRelatedRequestCannotDeleteOtherRequestImage() {
    val directory = temp.newFolder()
    val store = store(directory)
    val longerId = "$id-more"
    makeReady(store)
    val longer = makeReady(store, longerId)
    store.discard(id)
    assertEquals(longer, store.read(longerId))
  }

  @Test fun discardedProcessingCannotPublishLateReadyOrReacquireItsGrant() {
    val started = CountDownLatch(1)
    val release = CountDownLatch(1)
    val finished = CountDownLatch(1)
    val grants = Grants()
    val store = store(grants = grants, decoder = { started.countDown(); assertTrue(release.await(5, TimeUnit.SECONDS)); finished.countDown(); bytes })
    assertTrue(store.prepare(id, 1, 1000))
    assertTrue(store.claimLaunch(id))
    store.capture(id, listOf(uri))
    assertTrue(started.await(5, TimeUnit.SECONDS))
    assertEquals("discarded", store.discard(id)["status"])
    release.countDown()
    assertTrue(finished.await(5, TimeUnit.SECONDS))
    assertEquals("discarded", store.read(id)["status"])
    assertFalse(grants.held(uri))
  }

  @Test fun wrongKeyOrCorruptRecordIsAnExplicitFailureAndNotMissing() {
    val directory = temp.newFolder()
    val first = store(directory)
    first.prepare(id, 1, 1000)
    first.closeForTests()
    val wrong = KeyGenerator.getInstance("AES").apply { init(256) }.generateKey()
    val second = store(directory, fixtureKey = wrong)
    assertThrows(Exception::class.java) { second.read(id) }
    assertTrue(File(directory, "$id.record").exists())
    val encrypted = File(directory, "$id.record").readBytes()
    encrypted[encrypted.lastIndex] = (encrypted.last().toInt() xor 1).toByte()
    File(directory, "$id.record").writeBytes(encrypted)
    val third = store(directory)
    assertThrows(Exception::class.java) { third.read(id) }
  }
}

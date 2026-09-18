package com.qrguitar.picker

import android.content.Intent
import android.os.Handler
import android.os.Looper
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

class SelectionOptions : Record {
  @Field val maxAssets: Int = 0
  @Field val remainingBytes: Int = 0
}

class QrguitarPhotoPickerModule : Module() {
  private var unsubscribe: (() -> Unit)? = null
  private val main = Handler(Looper.getMainLooper())
  private fun store() = SelectionStore.get(requireNotNull(appContext.reactContext).applicationContext)

  override fun definition() = ModuleDefinition {
    Name("QrguitarPhotoPicker")
    Constants("protocolVersion" to 1)
    Events("onSelectionChanged")

    OnCreate {
      unsubscribe = store().listen { id, status ->
        main.post { if (unsubscribe != null) sendEvent("onSelectionChanged", mapOf("selectionId" to id, "status" to status)) }
      }
    }
    OnDestroy { unsubscribe?.invoke(); unsubscribe = null }

    AsyncFunction("startSelectionAsync") { id: String, options: SelectionOptions, promise: Promise ->
      val storage = store()
      storage.executor.execute {
        try {
          val created = storage.prepare(id, options.maxAssets, options.remainingBytes)
          if (!created) {
            promise.resolve(storage.read(id))
          } else {
            main.post {
              try {
                val activity = appContext.currentActivity ?: error("picker_unavailable")
                if (activity.isFinishing || activity.isDestroyed) error("picker_unavailable")
                storage.dispatchPrepared(id) {
                  activity.startActivity(Intent(activity, PhotoSelectionActivity::class.java).putExtra(PhotoSelectionActivity.SELECTION_ID, id))
                }
                // No promise is held waiting for an external picker result.
                storage.executor.execute { respond(promise) { storage.read(id) } }
              } catch (_: Exception) {
                storage.executor.execute { respond(promise) { storage.failLaunch(id); storage.read(id) } }
              }
            }
          }
        } catch (_: Exception) { reject(promise) }
      }
    }
    AsyncFunction("readSelectionAsync") { id: String, promise: Promise ->
      val storage = store()
      storage.executor.execute { respond(promise) { storage.read(id) } }
    }
    AsyncFunction("acknowledgeSelectionAsync") { id: String, resultId: String, promise: Promise ->
      val storage = store()
      storage.executor.execute { respond(promise) { storage.acknowledge(id, resultId) } }
    }
    AsyncFunction("discardSelectionAsync") { id: String, promise: Promise ->
      val storage = store()
      storage.executor.execute { respond(promise) { storage.discard(id) } }
    }
  }

  private fun respond(promise: Promise, work: () -> Map<String, Any>) {
    try { promise.resolve(work()) }
    catch (_: Exception) { reject(promise) }
  }
  private fun reject(promise: Promise) {
    promise.reject("ERR_QRGUITAR_PHOTO_SELECTION", "The saved photo selection could not be updated. It has been kept for recovery.", null)
  }
}

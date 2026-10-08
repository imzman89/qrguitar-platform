package com.qrguitar.picker

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.view.Gravity
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts

/** A separate Activity gives each external picker request its own restored result registry. */
class PhotoSelectionActivity : ComponentActivity() {
  companion object { const val SELECTION_ID = "com.qrguitar.picker.selectionId" }
  private lateinit var selectionId: String
  private lateinit var storage: SelectionStore
  private lateinit var notice: TextView
  private var retryCapture: (() -> Unit)? = null

  // Always register in the same order, before creation, including after process recreation.
  private val picker = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
    val capture = {
      if (result.resultCode == Activity.RESULT_CANCELED) {
        storage.cancelled(selectionId)
      } else if (result.resultCode == Activity.RESULT_OK) {
        val data = result.data
        val uris = buildList {
          data?.data?.let { add(it) }
          data?.clipData?.let { clip -> for (index in 0 until clip.itemCount) add(clip.getItemAt(index).uri) }
        }.distinct()
        storage.capture(selectionId, uris)
      } else {
        storage.failLaunch(selectionId)
      }
      finish()
    }
    retryCapture = capture
    tryCapture()
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
    selectionId = intent.getStringExtra(SELECTION_ID) ?: run { finish(); return }
    try { SelectionPolicy.requireId(selectionId) } catch (_: Exception) { finish(); return }
    storage = SelectionStore.get(applicationContext)
    val content = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      setPadding(48, 48, 48, 48)
      setBackgroundColor(Color.rgb(12, 16, 18))
    }
    notice = TextView(this).apply {
      text = "Your selected photos are being saved securely."
      setTextColor(Color.WHITE)
      textSize = 18f
    }
    content.addView(notice)
    content.addView(Button(this).apply { text = "Retry saving"; setOnClickListener { tryCapture() } })
    content.addView(Button(this).apply { text = "Discard this selection"; setOnClickListener { discard() } })
    setContentView(content)
    onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
      override fun handleOnBackPressed() { discard() }
    })
    try {
      if (storage.claimLaunch(selectionId)) {
        val request = PickVisualMediaRequest.Builder().setMediaType(ActivityResultContracts.PickVisualMedia.ImageOnly).build()
        val maximum = storage.maximumAssets(selectionId)
        val pickerIntent = if (maximum == 1) ActivityResultContracts.PickVisualMedia().createIntent(this, request)
          else ActivityResultContracts.PickMultipleVisualMedia(maximum).createIntent(this, request)
        picker.launch(pickerIntent)
      } else if (!storage.resumeActivity(selectionId)) {
        finish()
      }
      // A restored launched request awaits its own result. It is never relaunched implicitly.
    } catch (_: Exception) {
      try { storage.failLaunch(selectionId); finish() }
      catch (_: Exception) { notice.text = "The photo selection could not be saved. Retry or discard this selection." }
    }
  }

  private fun tryCapture() {
    try { retryCapture?.invoke() }
    catch (_: Exception) { notice.text = "The photo selection could not be saved. Retry or discard this selection." }
  }
  private fun discard() {
    try { storage.discard(selectionId); finish() }
    catch (_: Exception) { notice.text = "The selection could not be discarded yet. Its saved state has been kept." }
  }
}

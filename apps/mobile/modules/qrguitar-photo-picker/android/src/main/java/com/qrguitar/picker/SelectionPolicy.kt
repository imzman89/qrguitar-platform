package com.qrguitar.picker

internal object SelectionPolicy {
  const val MAX_ASSETS = 8
  const val MAX_IMAGE_BYTES = 12 * 1024 * 1024
  const val MAX_TOTAL_BYTES = 16 * 1024 * 1024
  private val idPattern = Regex("^[a-zA-Z0-9-]{12,80}$")
  fun requireId(id: String) { require(idPattern.matches(id)) { "invalid_id" } }
  fun requireOptions(maxAssets: Int, remainingBytes: Int) {
    require(maxAssets in 1..MAX_ASSETS && remainingBytes in 1..MAX_TOTAL_BYTES) { "invalid_options" }
  }
  fun status(phase: String): String = when (phase) {
    "prepared", "launched", "captured" -> "pending"
    "ready", "cancelled", "discarded", "acknowledged", "failed" -> phase
    else -> error("invalid_state")
  }
  fun acceptsCallback(phase: String?) = phase == "launched"
  fun mayAcknowledge(phase: String, expected: String?, actual: String) =
    (phase == "ready" || phase == "acknowledged") && expected == actual
  fun requireImageSize(bytes: Int, usedBytes: Int, remainingBytes: Int) {
    require(bytes in 12..MAX_IMAGE_BYTES && usedBytes >= 0 && usedBytes.toLong() + bytes <= remainingBytes) { "image_too_large" }
  }
}

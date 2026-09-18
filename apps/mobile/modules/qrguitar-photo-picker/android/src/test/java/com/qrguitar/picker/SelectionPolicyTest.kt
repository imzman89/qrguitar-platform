package com.qrguitar.picker

import org.junit.Assert.*
import org.junit.Test

class SelectionPolicyTest {
  @Test fun onlyLaunchedExistingRequestAcceptsCallback() {
    for (phase in listOf(null, "prepared", "captured", "ready", "cancelled", "failed", "discarded", "acknowledged")) {
      assertFalse(SelectionPolicy.acceptsCallback(phase))
    }
    assertTrue(SelectionPolicy.acceptsCallback("launched"))
  }
  @Test fun acknowledgeBindsExactReceiptAndCannotPromotePending() {
    assertTrue(SelectionPolicy.mayAcknowledge("ready", "receipt-a", "receipt-a"))
    assertTrue(SelectionPolicy.mayAcknowledge("acknowledged", "receipt-a", "receipt-a"))
    assertFalse(SelectionPolicy.mayAcknowledge("ready", "receipt-a", "receipt-b"))
    assertFalse(SelectionPolicy.mayAcknowledge("launched", "receipt-a", "receipt-a"))
    assertFalse(SelectionPolicy.mayAcknowledge("discarded", "receipt-a", "receipt-a"))
  }
  @Test fun allActivePhasesRemainPending() {
    for (phase in listOf("prepared", "launched", "captured")) assertEquals("pending", SelectionPolicy.status(phase))
  }
  @Test fun namesAndOptionsAreBounded() {
    SelectionPolicy.requireId("selection-111111111111")
    for (id in listOf("", "../selection-1111111111", "x".repeat(81))) {
      assertThrows(IllegalArgumentException::class.java) { SelectionPolicy.requireId(id) }
    }
    SelectionPolicy.requireOptions(8, SelectionPolicy.MAX_TOTAL_BYTES)
    for (count in listOf(0, 9)) assertThrows(IllegalArgumentException::class.java) { SelectionPolicy.requireOptions(count, 10) }
    assertThrows(IllegalArgumentException::class.java) { SelectionPolicy.requireOptions(1, SelectionPolicy.MAX_TOTAL_BYTES + 1) }
  }
  @Test fun imageAndAggregateLimitsApplyBeforeDelivery() {
    SelectionPolicy.requireImageSize(SelectionPolicy.MAX_IMAGE_BYTES, 0, SelectionPolicy.MAX_TOTAL_BYTES)
    assertThrows(IllegalArgumentException::class.java) { SelectionPolicy.requireImageSize(SelectionPolicy.MAX_IMAGE_BYTES + 1, 0, SelectionPolicy.MAX_TOTAL_BYTES) }
    assertThrows(IllegalArgumentException::class.java) { SelectionPolicy.requireImageSize(12, SelectionPolicy.MAX_TOTAL_BYTES - 11, SelectionPolicy.MAX_TOTAL_BYTES) }
    assertThrows(IllegalArgumentException::class.java) { SelectionPolicy.requireImageSize(11, 0, SelectionPolicy.MAX_TOTAL_BYTES) }
  }
}

package com.qrguitar.picker

import android.content.ContentProvider
import android.content.ContentValues
import android.database.Cursor
import android.net.Uri
import android.os.ParcelFileDescriptor
import java.io.File
import java.io.FileNotFoundException

/** Reads only synthetic files in this test APK's private, per-test fixture directory. */
class PickerFixtureProvider : ContentProvider() {
  override fun onCreate() = true

  override fun openFile(uri: Uri, mode: String): ParcelFileDescriptor {
    if (mode != "r") throw FileNotFoundException("Read-only fixture")
    val parts = uri.pathSegments
    if (parts.size != 2 || !parts[0].matches(Regex("[a-f0-9-]{36}")) ||
      !parts[1].matches(Regex("[a-f0-9-]{36}\\.jpg"))) {
      throw FileNotFoundException("Unknown fixture")
    }
    val root = File(requireNotNull(context).noBackupFilesDir, FIXTURE_DIRECTORY).canonicalFile
    val file = File(File(root, parts[0]), parts[1]).canonicalFile
    if (!file.path.startsWith(root.path + File.separator) || !file.isFile) {
      throw FileNotFoundException("Unknown fixture")
    }
    return ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
  }

  override fun getType(uri: Uri) = "image/jpeg"
  override fun query(uri: Uri, projection: Array<out String>?, selection: String?, selectionArgs: Array<out String>?, sortOrder: String?): Cursor? = null
  override fun insert(uri: Uri, values: ContentValues?): Uri? = throw UnsupportedOperationException("Read-only fixture")
  override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?): Int = throw UnsupportedOperationException("Read-only fixture")
  override fun update(uri: Uri, values: ContentValues?, selection: String?, selectionArgs: Array<out String>?): Int = throw UnsupportedOperationException("Read-only fixture")

  companion object {
    const val FIXTURE_DIRECTORY = "qrguitar-picker-instrumentation-fixtures"
  }
}

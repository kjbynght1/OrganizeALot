package com.organizealot.inspections;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

@CapacitorPlugin(
    name = "GallerySaver",
    permissions = {
        @Permission(strings = { Manifest.permission.WRITE_EXTERNAL_STORAGE }, alias = "legacyStorage")
    }
)
public class GallerySaverPlugin extends Plugin {

    @PluginMethod
    public void saveImage(PluginCall call) {
        if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.P && getPermissionState("legacyStorage") != PermissionState.GRANTED) {
            requestPermissionForAlias("legacyStorage", call, "legacyStorageCallback");
            return;
        }
        saveImageInternal(call);
    }

    @PermissionCallback
    private void legacyStorageCallback(PluginCall call) {
        if (getPermissionState("legacyStorage") == PermissionState.GRANTED) {
            saveImageInternal(call);
        } else {
            call.reject("Storage permission is required on Android 9 and older.");
        }
    }

    private void saveImageInternal(PluginCall call) {
        final String data = call.getString("data");
        final String requestedName = call.getString("fileName", "OrganizeALot_" + System.currentTimeMillis() + ".jpg");
        final String mimeType = call.getString("mimeType", "image/jpeg");
        final String albumName = safeSegment(call.getString("albumName", "OrganizeALot"));
        final String inspectionFolder = safeSegment(call.getString("inspectionFolder", "Inspection"));

        if (data == null || data.isEmpty()) {
            call.reject("No photo data was provided.");
            return;
        }

        new Thread(() -> {
            Uri insertedUri = null;
            try {
                byte[] bytes = Base64.decode(data, Base64.DEFAULT);
                String fileName = safeFileName(requestedName);
                JSObject result = new JSObject();

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ContentResolver resolver = getContext().getContentResolver();
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.Images.Media.DISPLAY_NAME, fileName);
                    values.put(MediaStore.Images.Media.MIME_TYPE, mimeType);
                    values.put(MediaStore.Images.Media.RELATIVE_PATH,
                        Environment.DIRECTORY_PICTURES + "/" + albumName + "/" + inspectionFolder);
                    values.put(MediaStore.Images.Media.IS_PENDING, 1);

                    insertedUri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
                    if (insertedUri == null) {
                        throw new IllegalStateException("Android could not create the Gallery photo.");
                    }

                    try (OutputStream out = resolver.openOutputStream(insertedUri)) {
                        if (out == null) throw new IllegalStateException("Android could not open the Gallery photo.");
                        out.write(bytes);
                        out.flush();
                    }

                    ContentValues ready = new ContentValues();
                    ready.put(MediaStore.Images.Media.IS_PENDING, 0);
                    resolver.update(insertedUri, ready, null, null);

                    result.put("saved", true);
                    result.put("uri", insertedUri.toString());
                    result.put("fileName", fileName);
                    result.put("relativePath", Environment.DIRECTORY_PICTURES + "/" + albumName + "/" + inspectionFolder);
                    call.resolve(result);
                } else {
                    File pictures = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES);
                    File folder = new File(new File(pictures, albumName), inspectionFolder);
                    if (!folder.exists() && !folder.mkdirs()) {
                        throw new IllegalStateException("Could not create the OrganizeALot Gallery folder.");
                    }
                    File output = new File(folder, fileName);
                    try (FileOutputStream out = new FileOutputStream(output)) {
                        out.write(bytes);
                        out.flush();
                    }
                    MediaScannerConnection.scanFile(getContext(), new String[]{output.getAbsolutePath()}, new String[]{mimeType}, null);

                    result.put("saved", true);
                    result.put("uri", Uri.fromFile(output).toString());
                    result.put("fileName", fileName);
                    result.put("relativePath", output.getParent());
                    call.resolve(result);
                }
            } catch (Exception e) {
                if (insertedUri != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    try { getContext().getContentResolver().delete(insertedUri, null, null); } catch (Exception ignored) {}
                }
                call.reject("Gallery save failed: " + e.getMessage(), e);
            }
        }, "OrganizeALot-GallerySave").start();
    }

    private String safeSegment(String value) {
        String cleaned = value == null ? "" : value.trim().replaceAll("[^a-zA-Z0-9._ -]+", "_");
        cleaned = cleaned.replace('/', '_').replace('\\', '_');
        return cleaned.isEmpty() ? "Inspection" : cleaned;
    }

    private String safeFileName(String value) {
        String cleaned = value == null ? "" : value.trim().replaceAll("[^a-zA-Z0-9._-]+", "_");
        return cleaned.isEmpty() ? "OrganizeALot_" + System.currentTimeMillis() + ".jpg" : cleaned;
    }
}

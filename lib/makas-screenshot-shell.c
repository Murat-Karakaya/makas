/* makas-screenshot-shell.c - GNOME Shell D-Bus screenshot backend
 *
 * Adapted from gnome-screenshot:
 *   Copyright (C) 2001-2006  Jonathan Blandford <jrb@alum.mit.edu>
 *   Copyright (C) 2008 Cosimo Cecchi <cosimoc@gnome.org>
 *   Copyright (C) 2020 Alexander Mikhaylenko <alexm@gnome.org>
 */

#include <gdk-pixbuf/gdk-pixbuf.h>
#include <gdk/gdk.h>
#include <gio/gio.h>
#include <glib/gstdio.h>

/**
 * makas_screenshot_capture_window_shell:
 * @include_pointer: Whether to include the mouse pointer
 * @out_error: (out) (optional): Location to store error
 *
 * Captures the current window using GNOME Shell's D-Bus API.
 * This is occlusion-proof and handles decorations correctly.
 *
 * Returns: (transfer full) (nullable): A GdkPixbuf or NULL on failure.
 */
GdkPixbuf *makas_screenshot_capture_window_shell(gboolean include_pointer,
                                                 GError **out_error) {
  g_autoptr(GError) error = NULL;
  g_autofree gchar *path = NULL;
  g_autofree gchar *filename = NULL;
  g_autofree gchar *tmpname = NULL;
  GdkPixbuf *screenshot = NULL;
  GVariant *method_params;
  GDBusConnection *connection;

  path = g_build_filename(g_get_user_cache_dir(), "makas", NULL);
  g_mkdir_with_parents(path, 0700);

  const gchar *service_name = "org.gnome.Shell.Screenshot";
  const gchar *object_path = "/org/gnome/Shell/Screenshot";
  const gchar *interface_name = "org.gnome.Shell.Screenshot";

  tmpname = g_strdup_printf("scr-%d.png", g_random_int());
  filename = g_build_filename(path, tmpname, NULL);

  method_params = g_variant_new("(bbbs)", TRUE,        /* include_frame */
                                include_pointer, TRUE, /* flash */
                                filename);

  connection = g_bus_get_sync(G_BUS_TYPE_SESSION, NULL, &error);
  if (!connection) {
    g_propagate_error(out_error, g_steal_pointer(&error));
    return NULL;
  }

  /* Try GNOME Shell first */
  g_dbus_connection_call_sync(connection, service_name, object_path,
                              interface_name, "ScreenshotWindow", method_params,
                              NULL, G_DBUS_CALL_FLAGS_NONE, -1, NULL, &error);

  /* If GNOME Shell fails, try Cinnamon */
  if (error &&
      g_error_matches(error, G_DBUS_ERROR, G_DBUS_ERROR_SERVICE_UNKNOWN)) {
    g_clear_error(&error);
    service_name = "org.Cinnamon.Screenshot";
    object_path = "/org/Cinnamon/Screenshot";
    interface_name = "org.Cinnamon.Screenshot";

    g_dbus_connection_call_sync(connection, service_name, object_path,
                                interface_name, "ScreenshotWindow",
                                method_params, NULL, G_DBUS_CALL_FLAGS_NONE, -1,
                                NULL, &error);
  }

  if (error != NULL) {
    g_propagate_error(out_error, g_steal_pointer(&error));
    return NULL;
  }

  screenshot = gdk_pixbuf_new_from_file(filename, &error);
  if (error != NULL) {
    g_propagate_error(out_error, g_steal_pointer(&error));
    /* Ensure we return NULL if load failed */
  }

  /* remove the temporary file */
  g_unlink(filename);

  return screenshot;
}

#ifndef MAKAS_ZWLR_SCREEN_H
#define MAKAS_ZWLR_SCREEN_H

#include <gdk-pixbuf/gdk-pixbuf.h>
#include <glib-object.h>

G_BEGIN_DECLS

/**
 * makas_capture_screencopy:
 * @with_cursor: Whether to include the cursor in the screenshot.
 *
 * Captures the screen using the zwlr_screencopy_v1 protocol.
 *
 * Returns: (transfer full) (nullable): A GdkPixbuf with the screenshot, or NULL on failure.
 */
GdkPixbuf *makas_capture_screencopy(gboolean with_cursor);

G_END_DECLS

#endif /* MAKAS_ZWLR_SCREEN_H */

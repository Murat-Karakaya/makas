#ifndef MAKAS_SCREENSHOT_H
#define MAKAS_SCREENSHOT_H

#include <gdk-pixbuf/gdk-pixbuf.h>
#include <gdk/gdk.h>
#include <glib-object.h>

G_BEGIN_DECLS

/**
 * makas_capture_window_x11:
 * @x: X coordinate to find window
 * @y: Y coordinate to find window
 * @out_x_offset: (out): Return location for the X offset of the content
 * relative to the root window
 * @out_y_offset: (out): Return location for the Y offset of the content
 * relative to the root window
 *
 * Returns: (transfer full) (nullable): A GdkPixbuf with the screenshot, or NULL
 * on failure
 */
GdkPixbuf *makas_capture_window_x11(gint x, gint y, gint *out_x_offset,
                                    gint *out_y_offset);

G_END_DECLS

#endif /* MAKAS_SCREENSHOT_H */

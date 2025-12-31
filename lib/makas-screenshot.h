#ifndef MAKAS_SCREENSHOT_H
#define MAKAS_SCREENSHOT_H

#include <gdk-pixbuf/gdk-pixbuf.h>
#include <gdk/gdk.h>
#include <glib-object.h>

G_BEGIN_DECLS

#define MAKAS_TYPE_SCREENSHOT (makas_screenshot_get_type())
G_DECLARE_FINAL_TYPE(MakasScreenshot, makas_screenshot, MAKAS, SCREENSHOT,
                     GObject)

/**
 * makas_screenshot_new:
 *
 * Creates a new MakasScreenshot instance.
 *
 * Returns: (transfer full): A new MakasScreenshot
 */
MakasScreenshot *makas_screenshot_new(void);

/**
 * makas_screenshot_capture_window:
 * @self: A MakasScreenshot instance
 * @x: X coordinate to find window
 * @y: Y coordinate to find window
 * include_window_decorations: Whether to include window decorations
 * @out_x_offset: (out): Return location for the X offset of the content
 * relative to the root window
 * @out_y_offset: (out): Return location for the Y offset of the content
 * relative to the root window
 *
 * Returns: (transfer full) (nullable): A GdkPixbuf with the screenshot, or NULL
 * on failure
 */
GdkPixbuf *makas_screenshot_capture_window(MakasScreenshot *self, gint x,
                                           gint y, gint *out_x_offset,
                                           gint *out_y_offset);

G_END_DECLS

#endif /* MAKAS_SCREENSHOT_H */

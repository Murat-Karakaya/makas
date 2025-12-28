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
 * @include_pointer: Whether to include the mouse pointer
 *
 * Captures a window at the given coordinates, including window decorations.
 * Uses XShape to create transparent rounded corners.
 *
 * Returns: (transfer full) (nullable): A GdkPixbuf with the screenshot, or NULL
 * on failure
 */
GdkPixbuf *makas_screenshot_capture_window(MakasScreenshot *self, gint x,
                                           gint y, gboolean include_pointer);

/**
 * makas_screenshot_composite_cursor:
 * @self: A MakasScreenshot instance
 * @pixbuf: The GdkPixbuf to composite the cursor onto
 * @root_x_offset: X offset of the pixbuf relative to the root window (usually
 * capture area x or window x)
 * @root_y_offset: Y offset of the pixbuf relative to the root window (usually
 * capture area y or window y)
 *
 * Composites the mouse cursor onto the given pixbuf.
 */
void makas_screenshot_composite_cursor(MakasScreenshot *self, GdkPixbuf *pixbuf,
                                       gint root_x_offset, gint root_y_offset);

G_END_DECLS

#endif /* MAKAS_SCREENSHOT_H */

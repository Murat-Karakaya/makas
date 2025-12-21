/* makas-screenshot-shell.h */

#ifndef MAKAS_SCREENSHOT_SHELL_H
#define MAKAS_SCREENSHOT_SHELL_H

#include <gdk-pixbuf/gdk-pixbuf.h>
#include <glib.h>

GdkPixbuf *makas_screenshot_capture_window_shell(gboolean include_pointer,
                                                 GError **out_error);

#endif /* MAKAS_SCREENSHOT_SHELL_H */

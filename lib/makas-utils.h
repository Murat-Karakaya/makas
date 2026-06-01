#ifndef MAKAS_UTILS_H
#define MAKAS_UTILS_H

#include <glib.h>

G_BEGIN_DECLS

/**
 * makas_is_ext_img_supported:
 *
 * Checks if the current session supports the necessary protocols for
 * ext-image copy capture (e.g. wl_shm, ext-image-copy-capture, etc.).
 *
 * Returns: TRUE if supported, FALSE otherwise.
 */
gboolean makas_is_ext_img_supported(void);

/**
 * makas_is_zwlr_screencopy_supported:
 *
 * Checks if the current session supports the necessary protocols for
 * zwlr-screencopy (e.g. wl_shm, screencopy-manager, etc.).
 *
 * Returns: TRUE if supported, FALSE otherwise.
 */
gboolean makas_is_zwlr_screencopy_supported(void);

/**
 * makas_utils_is_layer_shell_supported:
 *
 * Checks if the current session supports the zwlr_layer_shell_v1 protocol.
 *
 * Returns: TRUE if supported, FALSE otherwise.
 */
gboolean makas_utils_is_layer_shell_supported(void);

G_END_DECLS

#endif /* MAKAS_UTILS_H */

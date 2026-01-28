#ifndef MAKAS_UTILS_H
#define MAKAS_UTILS_H

#include <glib.h>

G_BEGIN_DECLS

/**
 * makas_utils_is_grim_supported:
 *
 * Checks if the current session supports the necessary protocols for
 * grim to capture screenshots (e.g. wl_shm, screencopy, etc.).
 *
 * Returns: TRUE if supported, FALSE otherwise.
 */
gboolean makas_utils_is_grim_supported(void);

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

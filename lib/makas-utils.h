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

G_END_DECLS

#endif /* MAKAS_UTILS_H */

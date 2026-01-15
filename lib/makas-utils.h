#ifndef MAKAS_UTILS_H
#define MAKAS_UTILS_H

#include <glib.h>

G_BEGIN_DECLS

/**
 * makas_utils_has_wlroots:
 *
 * Checks if the current session supports wlroots-compatible Wayland protocols.
 *
 * Returns: TRUE if wlroots is supported, FALSE otherwise.
 */
gboolean makas_utils_has_wlroots(void);

G_END_DECLS

#endif /* MAKAS_UTILS_H */

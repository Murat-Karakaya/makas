#include "makas-utils.h"
#include <dlfcn.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

// Minimal Wayland opaque types and function signatures
typedef void (*wl_registry_global_func_t)(void *, void *, uint32_t,
                                          const char *, uint32_t);
struct wl_registry_listener {
  wl_registry_global_func_t global;
  void (*global_remove)(void *, void *, uint32_t);
};

static void registry_global_handler(void *data, G_GNUC_UNUSED void *registry,
                                    G_GNUC_UNUSED uint32_t name,
                                    const char *interface,
                                    G_GNUC_UNUSED uint32_t version) {
  int *has_wlroots = (int *)data;
  if (strncmp(interface, "zwlr_", 5) == 0) {
    *has_wlroots = 1;
  }
}

gboolean makas_utils_has_wlroots(void) {
  void *handle = dlopen("libwayland-client.so.0", RTLD_LAZY);
  if (!handle) {
    return FALSE;
  }

  // Map the symbols we need
  void *(*wl_display_connect)(const char *) =
      dlsym(handle, "wl_display_connect");
  void *(*wl_display_get_registry)(void *) =
      dlsym(handle, "wl_display_get_registry");
  int (*wl_registry_add_listener)(void *, const struct wl_registry_listener *,
                                  void *) =
      dlsym(handle, "wl_registry_add_listener");
  int (*wl_display_roundtrip)(void *) = dlsym(handle, "wl_display_roundtrip");
  void (*wl_display_disconnect)(void *) =
      dlsym(handle, "wl_display_disconnect");

  if (!wl_display_connect || !wl_display_get_registry ||
      !wl_registry_add_listener || !wl_display_roundtrip ||
      !wl_display_disconnect) {
    dlclose(handle);
    return FALSE;
  }

  void *display = wl_display_connect(NULL);
  if (!display) {
    dlclose(handle);
    return FALSE;
  }

  int has_wlroots_val = 0;
  void *registry = wl_display_get_registry(display);
  struct wl_registry_listener listener = {.global = registry_global_handler,
                                          .global_remove = NULL};

  wl_registry_add_listener(registry, &listener, &has_wlroots_val);
  wl_display_roundtrip(display); // Sync to get the list of globals

  wl_display_disconnect(display);
  dlclose(handle);

  return has_wlroots_val ? TRUE : FALSE;
}

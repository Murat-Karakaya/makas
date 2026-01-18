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

// Struct to track which globals are advertised by the compositor
typedef struct {
  gboolean has_shm;
  gboolean has_zxdg_output_manager;
  gboolean has_ext_output_image_capture_source_manager;
  gboolean has_ext_foreign_toplevel_image_capture_source_manager;
  gboolean has_ext_image_copy_capture_manager;
  gboolean has_screencopy_manager;
  gboolean has_outputs;
} MakasGrimSupportState;

// Registry listener to populate state
static void grim_support_registry_handler(void *data,
                                          G_GNUC_UNUSED void *registry,
                                          G_GNUC_UNUSED uint32_t name,
                                          const char *interface,
                                          G_GNUC_UNUSED uint32_t version) {
  MakasGrimSupportState *state = (MakasGrimSupportState *)data;

  if (strcmp(interface, "wl_shm") == 0) {
    state->has_shm = TRUE;
  } else if (strcmp(interface, "zxdg_output_manager_v1") == 0) {
    state->has_zxdg_output_manager = TRUE;
  } else if (strcmp(interface, "wl_output") == 0) {
    state->has_outputs = TRUE;
  } else if (strcmp(interface, "ext_output_image_capture_source_manager_v1") ==
             0) {
    state->has_ext_output_image_capture_source_manager = TRUE;
  } else if (strcmp(interface,
                    "ext_foreign_toplevel_image_capture_source_manager_v1") ==
             0) {
    state->has_ext_foreign_toplevel_image_capture_source_manager = TRUE;
  } else if (strcmp(interface, "ext_image_copy_capture_manager_v1") == 0) {
    state->has_ext_image_copy_capture_manager = TRUE;
  } else if (strcmp(interface, "zwlr_screencopy_manager_v1") == 0) {
    state->has_screencopy_manager = TRUE;
  }
}

gboolean makas_utils_is_grim_supported(void) {
  void *handle = dlopen("libwayland-client.so.0", RTLD_LAZY);
  if (!handle) {
    fprintf(stderr, "DEBUG: Failed to dlopen libwayland-client.so.0: %s\n",
            dlerror());
    return FALSE;
  }

  // Symbol loading
  void *(*wl_display_connect)(const char *) =
      dlsym(handle, "wl_display_connect");
  // wl_display_get_registry is often inline, so we use the underlying marshal
  // function
  void *(*wl_proxy_marshal_constructor)(void *, uint32_t, void *, ...) =
      dlsym(handle, "wl_proxy_marshal_constructor");
  void *wl_registry_interface = dlsym(handle, "wl_registry_interface");

  int (*wl_proxy_add_listener)(void *, void (**)(void), void *) =
      dlsym(handle, "wl_proxy_add_listener");
  int (*wl_display_roundtrip)(void *) = dlsym(handle, "wl_display_roundtrip");
  void (*wl_display_disconnect)(void *) =
      dlsym(handle, "wl_display_disconnect");

  if (!wl_display_connect || !wl_proxy_marshal_constructor ||
      !wl_registry_interface || !wl_proxy_add_listener ||
      !wl_display_roundtrip || !wl_display_disconnect) {
    if (!wl_display_connect)
      fprintf(stderr, "DEBUG: Missing wl_display_connect\n");
    if (!wl_proxy_marshal_constructor)
      fprintf(stderr, "DEBUG: Missing wl_proxy_marshal_constructor\n");
    if (!wl_registry_interface)
      fprintf(stderr, "DEBUG: Missing wl_registry_interface\n");
    if (!wl_proxy_add_listener)
      fprintf(stderr, "DEBUG: Missing wl_proxy_add_listener\n");
    if (!wl_display_roundtrip)
      fprintf(stderr, "DEBUG: Missing wl_display_roundtrip\n");
    if (!wl_display_disconnect)
      fprintf(stderr, "DEBUG: Missing wl_display_disconnect\n");

    fprintf(stderr, "DEBUG: Failed to load symbols from libwayland-client\n");
    dlclose(handle);
    return FALSE;
  }

  void *display = wl_display_connect(NULL);
  if (!display) {
    fprintf(stderr, "DEBUG: Failed to connect to Wayland display\n");
    dlclose(handle);
    return FALSE;
  }

  // Initialize checks
  MakasGrimSupportState state = {0};
  // WL_DISPLAY_GET_REGISTRY = 1
  void *registry =
      wl_proxy_marshal_constructor(display, 1, wl_registry_interface, NULL);

  if (!registry) {
    fprintf(stderr, "DEBUG: Failed to get registry\n");
    wl_display_disconnect(display);
    dlclose(handle);
    return FALSE;
  }

  struct wl_registry_listener listener = {
      .global = grim_support_registry_handler, .global_remove = NULL};

  wl_proxy_add_listener(registry, (void (**)(void))&listener, &state);

  if (wl_display_roundtrip(display) < 0) {
    fprintf(stderr, "DEBUG: wl_display_roundtrip failed\n");
    wl_display_disconnect(display);
    dlclose(handle);
    return FALSE;
  }

  wl_display_disconnect(display);
  dlclose(handle);

  // Logic copied from grim/main.c

  // 1. Check for SHM
  if (!state.has_shm) {
    fprintf(stderr, "DEBUG: Missing wl_shm\n");
    return FALSE;
  }

  // 2. Check for capture capability
  gboolean can_capture = state.has_screencopy_manager ||
                         (state.has_ext_output_image_capture_source_manager &&
                          state.has_ext_image_copy_capture_manager);

  if (!can_capture) {
    fprintf(stderr,
            "DEBUG: Missing capture managers. Screencopy: %d, ExtSrc: %d, "
            "ExtCopy: %d\n",
            state.has_screencopy_manager,
            state.has_ext_output_image_capture_source_manager,
            state.has_ext_image_copy_capture_manager);
    return FALSE;
  }

  // 3. Check for outputs (grim requires at least one output if not capturing a
  // specific toplevel)
  if (!state.has_outputs) {
    fprintf(stderr, "DEBUG: No wl_output found\n");
    return FALSE;
  }

  // printf("DEBUG: Grim support check passed\n");
  return TRUE;
}

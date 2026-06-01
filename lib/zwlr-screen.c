#include "wayland-common.h"
#include "zwlr-screen.h"

static __thread gboolean capture_failed = FALSE;


/* --- Output Listener Callback Implementations --- */

static void output_handle_geometry(void *data, struct wl_output *wl_output G_GNUC_UNUSED,
		int32_t x, int32_t y, int32_t physical_width G_GNUC_UNUSED, int32_t physical_height G_GNUC_UNUSED,
		int32_t subpixel G_GNUC_UNUSED, const char *make G_GNUC_UNUSED, const char *model G_GNUC_UNUSED,
		int32_t transform) {
	struct grim_output *output = data;

	output->fallback_x = x;
	output->fallback_y = y;
	output->transform = transform;
}

static void output_handle_mode(void *data, struct wl_output *wl_output G_GNUC_UNUSED,
		uint32_t flags, int32_t width, int32_t height, int32_t refresh G_GNUC_UNUSED) {
	struct grim_output *output = data;

	if ((flags & WL_OUTPUT_MODE_CURRENT) != 0) {
		output->mode_width = width;
		output->mode_height = height;
	}
}

static void output_handle_done(void *data G_GNUC_UNUSED, struct wl_output *wl_output G_GNUC_UNUSED) {
	// No-op
}

static void output_handle_scale(void *data, struct wl_output *wl_output G_GNUC_UNUSED,
		int32_t factor) {
	struct grim_output *output = data;
	output->scale = factor;
}

static void output_handle_name(void *data, struct wl_output *wl_output G_GNUC_UNUSED,
		const char *name) {
	struct grim_output *output = data;
	output->name = strdup(name);
}

static void output_handle_description(void *data G_GNUC_UNUSED, struct wl_output *wl_output G_GNUC_UNUSED,
		const char *description G_GNUC_UNUSED) {
	// No-op
}

static const struct wl_output_listener output_listener = {
	.geometry = output_handle_geometry,
	.mode = output_handle_mode,
	.done = output_handle_done,
	.scale = output_handle_scale,
	.name = output_handle_name,
	.description = output_handle_description,
};

static void xdg_output_handle_logical_position(void *data,
		struct zxdg_output_v1 *xdg_output G_GNUC_UNUSED, int32_t x, int32_t y) {
	struct grim_output *output = data;

	output->logical_geometry.x = x;
	output->logical_geometry.y = y;
}

static void xdg_output_handle_logical_size(void *data,
		struct zxdg_output_v1 *xdg_output G_GNUC_UNUSED, int32_t width, int32_t height) {
	struct grim_output *output = data;

	output->logical_geometry.width = width;
	output->logical_geometry.height = height;
}

static void xdg_output_handle_done(void *data,
		struct zxdg_output_v1 *xdg_output G_GNUC_UNUSED) {
	struct grim_output *output = data;

	int32_t width = output->mode_width;
	int32_t height = output->mode_height;
	apply_output_transform(output->transform, &width, &height);
	output->logical_scale = (double)width / output->logical_geometry.width;
}

static void xdg_output_handle_name(void *data,
		struct zxdg_output_v1 *xdg_output G_GNUC_UNUSED, const char *name) {
	struct grim_output *output = data;
	if (output->name) {
		return;
	}
	output->name = strdup(name);
}

static void xdg_output_handle_description(void *data G_GNUC_UNUSED,
		struct zxdg_output_v1 *xdg_output G_GNUC_UNUSED, const char *name G_GNUC_UNUSED) {
	// No-op
}

static const struct zxdg_output_v1_listener xdg_output_listener = {
	.logical_position = xdg_output_handle_logical_position,
	.logical_size = xdg_output_handle_logical_size,
	.done = xdg_output_handle_done,
	.name = xdg_output_handle_name,
	.description = xdg_output_handle_description,
};

/* --- Screencopy Frame Listener Callback Implementations --- */

static void screencopy_frame_handle_buffer(void *data,
		struct zwlr_screencopy_frame_v1 *frame, uint32_t format, uint32_t width,
		uint32_t height, uint32_t stride) {
	struct grim_capture *capture = data;

	capture->buffer =
		create_buffer(capture->state->shm, format, width, height, stride);
	if (capture->buffer == NULL) {
		g_warning("failed to create buffer");
		capture_failed = TRUE;
		return;
	}

	zwlr_screencopy_frame_v1_copy(frame, capture->buffer->wl_buffer);
}

static void screencopy_frame_handle_flags(void *data,
		struct zwlr_screencopy_frame_v1 *frame G_GNUC_UNUSED, uint32_t flags) {
	struct grim_capture *capture = data;
	capture->screencopy_frame_flags = flags;
	capture->y_invert = (flags & ZWLR_SCREENCOPY_FRAME_V1_FLAGS_Y_INVERT) != 0;
}

static void screencopy_frame_handle_ready(void *data,
		struct zwlr_screencopy_frame_v1 *frame G_GNUC_UNUSED, uint32_t tv_sec_hi G_GNUC_UNUSED,
		uint32_t tv_sec_lo G_GNUC_UNUSED, uint32_t tv_nsec G_GNUC_UNUSED) {
	struct grim_capture *capture = data;
	++capture->state->n_done;
}

static void screencopy_frame_handle_failed(void *data,
		struct zwlr_screencopy_frame_v1 *frame G_GNUC_UNUSED) {
	struct grim_capture *capture = data;
	g_warning("failed to copy output %s", capture->output->name ? capture->output->name : "unknown");
	capture_failed = TRUE;
}

static const struct zwlr_screencopy_frame_v1_listener screencopy_frame_listener = {
	.buffer = screencopy_frame_handle_buffer,
	.flags = screencopy_frame_handle_flags,
	.ready = screencopy_frame_handle_ready,
	.failed = screencopy_frame_handle_failed,
};

/* --- Global Registry Handlers --- */

static void screencopy_handle_global(void *data, struct wl_registry *registry,
		uint32_t name, const char *interface, uint32_t version) {
	struct grim_state *state = data;

	if (strcmp(interface, wl_shm_interface.name) == 0) {
		state->shm = wl_registry_bind(registry, name, &wl_shm_interface, 1);
	} else if (strcmp(interface, zxdg_output_manager_v1_interface.name) == 0) {
		uint32_t bind_version = (version > 2) ? 2 : version;
		state->xdg_output_manager = wl_registry_bind(registry, name,
			&zxdg_output_manager_v1_interface, bind_version);
	} else if (strcmp(interface, wl_output_interface.name) == 0) {
		uint32_t bind_version = (version >= 4) ? 4 : 3;
		struct grim_output *output = calloc(1, sizeof(struct grim_output));
		output->state = state;
		output->scale = 1;
		output->wl_output =  wl_registry_bind(registry, name,
			&wl_output_interface, bind_version);
		wl_output_add_listener(output->wl_output, &output_listener, output);
		wl_list_insert(&state->outputs, &output->link);
	} else if (strcmp(interface, zwlr_screencopy_manager_v1_interface.name) == 0) {
		state->screencopy_manager = wl_registry_bind(registry, name,
			&zwlr_screencopy_manager_v1_interface, 1);
	}
}

static const struct wl_registry_listener screencopy_registry_listener = {
	.global = screencopy_handle_global,
	.global_remove = NULL,
};

/* --- Capture Creation Helper Functions --- */

static void create_screencopy_capture(struct grim_state *state, struct grim_output *output, gboolean with_cursor) {
	struct grim_capture *capture = calloc(1, sizeof(*capture));
	capture->state = state;
	capture->output = output;
	capture->transform = output->transform;
	capture->logical_geometry = output->logical_geometry;
	wl_list_insert(&state->captures, &capture->link);

	capture->screencopy_frame = zwlr_screencopy_manager_v1_capture_output(
		state->screencopy_manager, with_cursor, output->wl_output);
	zwlr_screencopy_frame_v1_add_listener(capture->screencopy_frame,
		&screencopy_frame_listener, capture);
}

/* --- Cleanup Helper --- */

static void cleanup_grim_state(struct grim_state *state) {
	struct grim_capture *capture, *capture_tmp;
	wl_list_for_each_safe(capture, capture_tmp, &state->captures, link) {
		wl_list_remove(&capture->link);
		if (capture->screencopy_frame != NULL) {
			zwlr_screencopy_frame_v1_destroy(capture->screencopy_frame);
		}
		if (capture->buffer != NULL) {
			destroy_buffer(capture->buffer);
		}
		free(capture);
	}
	struct grim_output *output, *output_tmp;
	wl_list_for_each_safe(output, output_tmp, &state->outputs, link) {
		wl_list_remove(&output->link);
		free(output->name);
		if (output->xdg_output != NULL) {
			zxdg_output_v1_destroy(output->xdg_output);
		}
		wl_output_release(output->wl_output);
		free(output);
	}
	if (state->screencopy_manager != NULL) {
		zwlr_screencopy_manager_v1_destroy(state->screencopy_manager);
	}
	if (state->xdg_output_manager != NULL) {
		zxdg_output_manager_v1_destroy(state->xdg_output_manager);
	}
	if (state->shm != NULL) {
		wl_shm_destroy(state->shm);
	}
	if (state->registry != NULL) {
		wl_registry_destroy(state->registry);
	}
	if (state->display != NULL) {
		wl_display_disconnect(state->display);
	}
}

/* --- Public Methods --- */

GdkPixbuf *makas_capture_screencopy(gboolean with_cursor) {
	capture_failed = FALSE;

	struct grim_state state = {0};
	wl_list_init(&state.outputs);
	wl_list_init(&state.captures);

	state.display = wl_display_connect(NULL);
	if (state.display == NULL) {
		g_warning("failed to connect to Wayland display");
		return NULL;
	}

	state.registry = wl_display_get_registry(state.display);
	wl_registry_add_listener(state.registry, &screencopy_registry_listener, &state);
	if (wl_display_roundtrip(state.display) < 0) {
		g_warning("wl_display_roundtrip() failed");
		cleanup_grim_state(&state);
		return NULL;
	}

	if (state.shm == NULL) {
		g_warning("compositor doesn't support wl_shm");
		cleanup_grim_state(&state);
		return NULL;
	}

	if (state.screencopy_manager == NULL) {
		g_warning("compositor doesn't support zwlr_screencopy_manager_v1");
		cleanup_grim_state(&state);
		return NULL;
	}

	if (wl_list_empty(&state.outputs)) {
		g_warning("no wl_output found");
		cleanup_grim_state(&state);
		return NULL;
	}

	if (state.xdg_output_manager != NULL) {
		struct grim_output *output;
		wl_list_for_each(output, &state.outputs, link) {
			output->xdg_output = zxdg_output_manager_v1_get_xdg_output(
				state.xdg_output_manager, output->wl_output);
			zxdg_output_v1_add_listener(output->xdg_output,
				&xdg_output_listener, output);
		}
	} else {
		struct grim_output *output;
		wl_list_for_each(output, &state.outputs, link) {
			guess_output_logical_geometry(output);
		}
	}

	if (state.xdg_output_manager != NULL) {
		if (wl_display_roundtrip(state.display) < 0) {
			g_warning("wl_display_roundtrip() failed");
			cleanup_grim_state(&state);
			return NULL;
		}
	}

	struct grim_output *output;
	wl_list_for_each(output, &state.outputs, link) {
		create_screencopy_capture(&state, output, with_cursor);
	}

	if (wl_list_empty(&state.captures)) {
		g_warning("failed to create any screencopy captures");
		cleanup_grim_state(&state);
		return NULL;
	}

	size_t n_pending = wl_list_length(&state.captures);
	while (!capture_failed && state.n_done < n_pending && wl_display_dispatch(state.display) != -1) {
		// Event loop
	}

	if (capture_failed || state.n_done < n_pending) {
		g_warning("failed to capture all outputs via screencopy");
		cleanup_grim_state(&state);
		return NULL;
	}

	struct grim_box geometry = {0};
	get_capture_layout_extents(&state, &geometry);

	double scale = 1.0;
	struct grim_output *out;
	wl_list_for_each(out, &state.outputs, link) {
		if (out->logical_scale > scale) {
			scale = out->logical_scale;
		}
	}

	pixman_image_t *image = grim_render(&state, &geometry, scale);
	if (image == NULL) {
		cleanup_grim_state(&state);
		return NULL;
	}

	int width = pixman_image_get_width(image);
	int height = pixman_image_get_height(image);

	GdkPixbuf *pixbuf = gdk_pixbuf_new(GDK_COLORSPACE_RGB, TRUE, 8, width, height);
	if (pixbuf == NULL) {
		pixman_image_unref(image);
		cleanup_grim_state(&state);
		return NULL;
	}

	uint32_t *src_pixels = (uint32_t *)pixman_image_get_data(image);
	int src_stride = pixman_image_get_stride(image) / 4;
	guchar *dest_pixels = gdk_pixbuf_get_pixels(pixbuf);
	int dest_stride = gdk_pixbuf_get_rowstride(pixbuf);

	for (int y = 0; y < height; y++) {
		for (int x = 0; x < width; x++) {
			uint32_t pixel = src_pixels[y * src_stride + x];
			guchar *p = dest_pixels + y * dest_stride + x * 4;
			p[0] = (pixel >> 16) & 0xFF; // R
			p[1] = (pixel >> 8) & 0xFF;  // G
			p[2] = pixel & 0xFF;         // B
			p[3] = (pixel >> 24) & 0xFF; // A
		}
	}

	pixman_image_unref(image);
	cleanup_grim_state(&state);
	return pixbuf;
}

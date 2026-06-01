#include "wayland-common.h"
#include "ext-image.h"

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

/* --- Ext Image Copy Frame/Session Listener Callback Implementations --- */

static void ext_image_copy_capture_frame_handle_transform(void *data,
		struct ext_image_copy_capture_frame_v1 *frame G_GNUC_UNUSED, uint32_t transform) {
	struct grim_capture *capture = data;
	capture->transform = transform;
}

static void ext_image_copy_capture_frame_handle_damage(void *data G_GNUC_UNUSED,
		struct ext_image_copy_capture_frame_v1 *frame G_GNUC_UNUSED, int32_t x G_GNUC_UNUSED, int32_t y G_GNUC_UNUSED,
		int32_t wdth G_GNUC_UNUSED, int32_t height G_GNUC_UNUSED) {
	// No-op
}

static void ext_image_copy_capture_frame_handle_presentation_time(void *data G_GNUC_UNUSED,
		struct ext_image_copy_capture_frame_v1 *frame G_GNUC_UNUSED, uint32_t tv_sec_hi G_GNUC_UNUSED,
		uint32_t tv_sec_lo G_GNUC_UNUSED, uint32_t tv_nsec G_GNUC_UNUSED) {
	// No-op
}

static void ext_image_copy_capture_frame_handle_ready(void *data,
		struct ext_image_copy_capture_frame_v1 *frame G_GNUC_UNUSED) {
	struct grim_capture *capture = data;
	++capture->state->n_done;
}

static void ext_image_copy_capture_frame_handle_failed(void *data,
		struct ext_image_copy_capture_frame_v1 *frame G_GNUC_UNUSED, uint32_t reason) {
	struct grim_capture *capture = data;
	g_warning("failed to copy output %s, reason: %u", capture->output->name ? capture->output->name : "unknown", reason);
	capture_failed = TRUE;
}

static const struct ext_image_copy_capture_frame_v1_listener ext_image_copy_capture_frame_listener = {
	.transform = ext_image_copy_capture_frame_handle_transform,
	.damage = ext_image_copy_capture_frame_handle_damage,
	.presentation_time = ext_image_copy_capture_frame_handle_presentation_time,
	.ready = ext_image_copy_capture_frame_handle_ready,
	.failed = ext_image_copy_capture_frame_handle_failed,
};

static void ext_image_copy_capture_session_handle_buffer_size(void *data,
		struct ext_image_copy_capture_session_v1 *session G_GNUC_UNUSED, uint32_t width, uint32_t height) {
	struct grim_capture *capture = data;
	capture->buffer_width = width;
	capture->buffer_height = height;
}

static void ext_image_copy_capture_session_handle_shm_format(void *data,
		struct ext_image_copy_capture_session_v1 *session G_GNUC_UNUSED, uint32_t format) {
	struct grim_capture *capture = data;
	if (capture->has_shm_format || !is_format_supported(format)) {
		return;
	}
	capture->shm_format = format;
	capture->has_shm_format = true;
}

static void ext_image_copy_capture_session_handle_dmabuf_device(void *data G_GNUC_UNUSED,
		struct ext_image_copy_capture_session_v1 *session G_GNUC_UNUSED, struct wl_array *dev_id_array G_GNUC_UNUSED) {
	// No-op
}

static void ext_image_copy_capture_session_handle_dmabuf_format(void *data G_GNUC_UNUSED,
		struct ext_image_copy_capture_session_v1 *session G_GNUC_UNUSED, uint32_t format G_GNUC_UNUSED,
		struct wl_array *modifiers G_GNUC_UNUSED) {
	// No-op
}

static void ext_image_copy_capture_session_handle_done(void *data,
		struct ext_image_copy_capture_session_v1 *session) {
	struct grim_capture *capture = data;

	if (capture->ext_image_copy_capture_frame != NULL) {
		return;
	}

	if (!capture->has_shm_format) {
		g_warning("no supported format found");
		capture_failed = TRUE;
		return;
	}

	int32_t stride = get_format_min_stride(capture->shm_format, capture->buffer_width);
	capture->buffer =
		create_buffer(capture->state->shm, capture->shm_format, capture->buffer_width, capture->buffer_height, stride);
	if (capture->buffer == NULL) {
		g_warning("failed to create buffer");
		capture_failed = TRUE;
		return;
	}

	capture->ext_image_copy_capture_frame = ext_image_copy_capture_session_v1_create_frame(session);
	ext_image_copy_capture_frame_v1_add_listener(capture->ext_image_copy_capture_frame,
		&ext_image_copy_capture_frame_listener, capture);

	ext_image_copy_capture_frame_v1_attach_buffer(capture->ext_image_copy_capture_frame, capture->buffer->wl_buffer);
	ext_image_copy_capture_frame_v1_damage_buffer(capture->ext_image_copy_capture_frame,
		0, 0, INT32_MAX, INT32_MAX);
	ext_image_copy_capture_frame_v1_capture(capture->ext_image_copy_capture_frame);
}

static void ext_image_copy_capture_session_handle_stopped(void *data G_GNUC_UNUSED,
		struct ext_image_copy_capture_session_v1 *session G_GNUC_UNUSED) {
	// No-op
}

static const struct ext_image_copy_capture_session_v1_listener ext_image_copy_capture_session_listener = {
	.buffer_size = ext_image_copy_capture_session_handle_buffer_size,
	.shm_format = ext_image_copy_capture_session_handle_shm_format,
	.dmabuf_device = ext_image_copy_capture_session_handle_dmabuf_device,
	.dmabuf_format = ext_image_copy_capture_session_handle_dmabuf_format,
	.done = ext_image_copy_capture_session_handle_done,
	.stopped = ext_image_copy_capture_session_handle_stopped,
};

/* --- Global Registry Handlers --- */

static void ext_image_copy_handle_global(void *data, struct wl_registry *registry,
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
	} else if (strcmp(interface, ext_output_image_capture_source_manager_v1_interface.name) == 0) {
		state->ext_output_image_capture_source_manager = wl_registry_bind(registry, name,
			&ext_output_image_capture_source_manager_v1_interface, 1);
	} else if (strcmp(interface, ext_image_copy_capture_manager_v1_interface.name) == 0) {
		state->ext_image_copy_capture_manager = wl_registry_bind(registry, name,
			&ext_image_copy_capture_manager_v1_interface, 1);
	}
}

static const struct wl_registry_listener ext_image_copy_registry_listener = {
	.global = ext_image_copy_handle_global,
	.global_remove = NULL,
};

/* --- Capture Creation Helper Functions --- */

static void create_ext_image_copy_capture(struct grim_state *state, struct grim_output *output, gboolean with_cursor) {
	struct grim_capture *capture = calloc(1, sizeof(*capture));
	capture->state = state;
	capture->output = output;
	capture->transform = output->transform;
	capture->logical_geometry = output->logical_geometry;
	wl_list_insert(&state->captures, &capture->link);

	uint32_t options = 0;
	if (with_cursor) {
		options |= EXT_IMAGE_COPY_CAPTURE_MANAGER_V1_OPTIONS_PAINT_CURSORS;
	}
	struct ext_image_capture_source_v1 *source = ext_output_image_capture_source_manager_v1_create_source(
		state->ext_output_image_capture_source_manager, output->wl_output);
	capture->ext_image_copy_capture_session = ext_image_copy_capture_manager_v1_create_session(
		state->ext_image_copy_capture_manager, source, options);
	ext_image_copy_capture_session_v1_add_listener(capture->ext_image_copy_capture_session,
		&ext_image_copy_capture_session_listener, capture);
	ext_image_capture_source_v1_destroy(source);
}

/* --- Cleanup Helper --- */

static void cleanup_grim_state(struct grim_state *state) {
	struct grim_capture *capture, *capture_tmp;
	wl_list_for_each_safe(capture, capture_tmp, &state->captures, link) {
		wl_list_remove(&capture->link);
		if (capture->ext_image_copy_capture_frame != NULL) {
			ext_image_copy_capture_frame_v1_destroy(capture->ext_image_copy_capture_frame);
		}
		if (capture->ext_image_copy_capture_session != NULL) {
			ext_image_copy_capture_session_v1_destroy(capture->ext_image_copy_capture_session);
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
	if (state->ext_output_image_capture_source_manager != NULL) {
		ext_output_image_capture_source_manager_v1_destroy(state->ext_output_image_capture_source_manager);
	}
	if (state->ext_image_copy_capture_manager != NULL) {
		ext_image_copy_capture_manager_v1_destroy(state->ext_image_copy_capture_manager);
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

GdkPixbuf *makas_capture_ext_image_copy(gboolean with_cursor) {
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
	wl_registry_add_listener(state.registry, &ext_image_copy_registry_listener, &state);
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

	if (state.ext_output_image_capture_source_manager == NULL || state.ext_image_copy_capture_manager == NULL) {
		g_warning("compositor doesn't support ext-image-copy-capture");
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
		create_ext_image_copy_capture(&state, output, with_cursor);
	}

	if (wl_list_empty(&state.captures)) {
		g_warning("failed to create any ext-image-copy captures");
		cleanup_grim_state(&state);
		return NULL;
	}

	size_t n_pending = wl_list_length(&state.captures);
	while (!capture_failed && state.n_done < n_pending) {
		if (wl_display_dispatch(state.display) == -1) {
			break;
		}
		wl_display_flush(state.display);
	}

	if (capture_failed || state.n_done < n_pending) {
		g_warning("failed to capture all outputs via ext-image-copy");
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

	uint32_t *src_pixels_ptr = (uint32_t *)pixman_image_get_data(image);
	int src_stride = pixman_image_get_stride(image) / 4;
	guchar *dest_pixels = gdk_pixbuf_get_pixels(pixbuf);
	int dest_stride = gdk_pixbuf_get_rowstride(pixbuf);

	for (int y = 0; y < height; y++) {
		for (int x = 0; x < width; x++) {
			uint32_t pixel = src_pixels_ptr[y * src_stride + x];
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

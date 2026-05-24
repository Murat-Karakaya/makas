#include "makas-grim.h"
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <errno.h>
#include <limits.h>
#include <math.h>
#include <fcntl.h>
#include <sys/mman.h>
#include <unistd.h>
#include <time.h>
#include <pixman.h>
#include <wayland-client.h>
#include "ext-image-capture-source-v1-protocol.h"
#include "ext-image-copy-capture-v1-protocol.h"
#include "wlr-screencopy-unstable-v1-protocol.h"
#include "xdg-output-unstable-v1-protocol.h"

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

#ifndef GRIM_LITTLE_ENDIAN
#if G_BYTE_ORDER == G_LITTLE_ENDIAN
#define GRIM_LITTLE_ENDIAN 1
#else
#define GRIM_LITTLE_ENDIAN 0
#endif
#endif

/* --- Structure Definitions --- */

struct grim_box {
	int32_t x, y;
	int32_t width, height;
};

struct grim_state {
	struct wl_display *display;
	struct wl_registry *registry;
	struct wl_shm *shm;
	struct zxdg_output_manager_v1 *xdg_output_manager;
	struct ext_output_image_capture_source_manager_v1 *ext_output_image_capture_source_manager;
	struct ext_image_copy_capture_manager_v1 *ext_image_copy_capture_manager;
	struct zwlr_screencopy_manager_v1 *screencopy_manager;

	struct wl_list outputs;

	struct wl_list captures;
	size_t n_done;
};

struct grim_buffer {
	struct wl_buffer *wl_buffer;
	void *data;
	int32_t width, height, stride;
	size_t size;
	enum wl_shm_format format;
};

struct grim_output {
	struct grim_state *state;
	struct wl_output *wl_output;
	struct zxdg_output_v1 *xdg_output;
	struct wl_list link;

	int32_t fallback_x, fallback_y;
	uint32_t mode_width, mode_height;
	enum wl_output_transform transform;
	int32_t scale;

	struct grim_box logical_geometry;
	double logical_scale;
	char *name;
};

struct grim_capture {
	struct grim_state *state;
	struct grim_output *output;
	struct wl_list link;

	enum wl_output_transform transform;
	struct grim_box logical_geometry;

	struct grim_buffer *buffer;

	struct ext_image_copy_capture_session_v1 *ext_image_copy_capture_session;
	struct ext_image_copy_capture_frame_v1 *ext_image_copy_capture_frame;
	uint32_t buffer_width, buffer_height;
	enum wl_shm_format shm_format;
	gboolean has_shm_format;

	struct zwlr_screencopy_frame_v1 *screencopy_frame;
	uint32_t screencopy_frame_flags;
};

static __thread gboolean capture_failed = FALSE;

/* --- Geometry Helper Functions --- */

static gboolean intersect_box(const struct grim_box *box_a, const struct grim_box *box_b) {
	int32_t x1 = box_a->x > box_b->x ? box_a->x : box_b->x;
	int32_t y1 = box_a->y > box_b->y ? box_a->y : box_b->y;
	int32_t x2 = box_a->x + box_a->width < box_b->x + box_b->width ?
		box_a->x + box_a->width : box_b->x + box_b->width;
	int32_t y2 = box_a->y + box_a->height < box_b->y + box_b->height ?
		box_a->y + box_a->height : box_b->y + box_b->height;
	return x1 < x2 && y1 < y2;
}

static void get_capture_layout_extents(struct grim_state *state, struct grim_box *box) {
	int32_t x1 = INT_MAX, y1 = INT_MAX;
	int32_t x2 = INT_MIN, y2 = INT_MIN;

	struct grim_capture *capture;
	wl_list_for_each(capture, &state->captures, link) {
		if (capture->logical_geometry.x < x1) {
			x1 = capture->logical_geometry.x;
		}
		if (capture->logical_geometry.y < y1) {
			y1 = capture->logical_geometry.y;
		}
		if (capture->logical_geometry.x + capture->logical_geometry.width > x2) {
			x2 = capture->logical_geometry.x + capture->logical_geometry.width;
		}
		if (capture->logical_geometry.y + capture->logical_geometry.height > y2) {
			y2 = capture->logical_geometry.y + capture->logical_geometry.height;
		}
	}

	box->x = x1;
	box->y = y1;
	box->width = x2 - x1;
	box->height = y2 - y1;
}

static void apply_output_transform(enum wl_output_transform transform,
		int32_t *width, int32_t *height) {
	if (transform & WL_OUTPUT_TRANSFORM_90) {
		int32_t tmp = *width;
		*width = *height;
		*height = tmp;
	}
}

static double get_output_rotation(enum wl_output_transform transform) {
	switch (transform & ~WL_OUTPUT_TRANSFORM_FLIPPED) {
	case WL_OUTPUT_TRANSFORM_90:
		return M_PI / 2;
	case WL_OUTPUT_TRANSFORM_180:
		return M_PI;
	case WL_OUTPUT_TRANSFORM_270:
		return 3 * M_PI / 2;
	}
	return 0;
}

static int get_output_flipped(enum wl_output_transform transform) {
	return transform & WL_OUTPUT_TRANSFORM_FLIPPED ? -1 : 1;
}

static void guess_output_logical_geometry(struct grim_output *output) {
	output->logical_geometry.x = output->fallback_x;
	output->logical_geometry.y = output->fallback_y;
	output->logical_geometry.width = output->mode_width / output->scale;
	output->logical_geometry.height = output->mode_height / output->scale;
	apply_output_transform(output->transform,
		&output->logical_geometry.width,
		&output->logical_geometry.height);
	output->logical_scale = output->scale;
}

/* --- Shared Memory Allocation Functions --- */

static void randname(char *buf) {
	struct timespec ts;
	clock_gettime(CLOCK_REALTIME, &ts);
	long r = ts.tv_nsec;
	for (int i = 0; i < 6; ++i) {
		buf[i] = 'A'+(r&15)+(r&16)*2;
		r >>= 5;
	}
}

static int anonymous_shm_open(void) {
	char name[] = "/grim-XXXXXX";
	int retries = 100;

	do {
		randname(name + strlen(name) - 6);

		--retries;
		int fd = shm_open(name, O_RDWR | O_CREAT | O_EXCL, 0600);
		if (fd >= 0) {
			shm_unlink(name);
			return fd;
		}
	} while (retries > 0 && errno == EEXIST);

	return -1;
}

static int create_shm_file(off_t size) {
	int fd = anonymous_shm_open();
	if (fd < 0) {
		return fd;
	}

	if (ftruncate(fd, size) < 0) {
		close(fd);
		return -1;
	}

	return fd;
}

static struct grim_buffer *create_buffer(struct wl_shm *shm, enum wl_shm_format format,
		int32_t width, int32_t height, int32_t stride) {
	size_t size = stride * height;

	int fd = create_shm_file(size);
	if (fd == -1) {
		return NULL;
	}

	void *data = mmap(NULL, size, PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0);
	if (data == MAP_FAILED) {
		close(fd);
		return NULL;
	}

	struct wl_shm_pool *pool = wl_shm_create_pool(shm, fd, size);
	struct wl_buffer *wl_buffer =
		wl_shm_pool_create_buffer(pool, 0, width, height, stride, format);
	wl_shm_pool_destroy(pool);

	close(fd);

	struct grim_buffer *buffer = calloc(1, sizeof(struct grim_buffer));
	buffer->wl_buffer = wl_buffer;
	buffer->data = data;
	buffer->width = width;
	buffer->height = height;
	buffer->stride = stride;
	buffer->size = size;
	buffer->format = format;
	return buffer;
}

static void destroy_buffer(struct grim_buffer *buffer) {
	if (buffer == NULL) {
		return;
	}
	munmap(buffer->data, buffer->size);
	wl_buffer_destroy(buffer->wl_buffer);
	free(buffer);
}

/* --- Pixman Rendering Logic --- */

static pixman_format_code_t get_pixman_format(enum wl_shm_format wl_fmt) {
	switch (wl_fmt) {
#if GRIM_LITTLE_ENDIAN
	case WL_SHM_FORMAT_RGB332:
		return PIXMAN_r3g3b2;
	case WL_SHM_FORMAT_BGR233:
		return PIXMAN_b2g3r3;
	case WL_SHM_FORMAT_ARGB4444:
		return PIXMAN_a4r4g4b4;
	case WL_SHM_FORMAT_XRGB4444:
		return PIXMAN_x4r4g4b4;
	case WL_SHM_FORMAT_ABGR4444:
		return PIXMAN_a4b4g4r4;
	case WL_SHM_FORMAT_XBGR4444:
		return PIXMAN_x4b4g4r4;
	case WL_SHM_FORMAT_ARGB1555:
		return PIXMAN_a1r5g5b5;
	case WL_SHM_FORMAT_XRGB1555:
		return PIXMAN_x1r5g5b5;
	case WL_SHM_FORMAT_ABGR1555:
		return PIXMAN_a1b5g5r5;
	case WL_SHM_FORMAT_XBGR1555:
		return PIXMAN_x1b5g5r5;
	case WL_SHM_FORMAT_RGB565:
		return PIXMAN_r5g6b5;
	case WL_SHM_FORMAT_BGR565:
		return PIXMAN_b5g6r5;
	case WL_SHM_FORMAT_RGB888:
		return PIXMAN_r8g8b8;
	case WL_SHM_FORMAT_BGR888:
		return PIXMAN_b8g8r8;
	case WL_SHM_FORMAT_ARGB8888:
		return PIXMAN_a8r8g8b8;
	case WL_SHM_FORMAT_XRGB8888:
		return PIXMAN_x8r8g8b8;
	case WL_SHM_FORMAT_ABGR8888:
		return PIXMAN_a8b8g8r8;
	case WL_SHM_FORMAT_XBGR8888:
		return PIXMAN_x8b8g8r8;
	case WL_SHM_FORMAT_BGRA8888:
		return PIXMAN_b8g8r8a8;
	case WL_SHM_FORMAT_BGRX8888:
		return PIXMAN_b8g8r8x8;
	case WL_SHM_FORMAT_RGBA8888:
		return PIXMAN_r8g8b8a8;
	case WL_SHM_FORMAT_RGBX8888:
		return PIXMAN_r8g8b8x8;
	case WL_SHM_FORMAT_ARGB2101010:
		return PIXMAN_a2r10g10b10;
	case WL_SHM_FORMAT_ABGR2101010:
		return PIXMAN_a2b10g10r10;
	case WL_SHM_FORMAT_XRGB2101010:
		return PIXMAN_x2r10g10b10;
	case WL_SHM_FORMAT_XBGR2101010:
		return PIXMAN_x2b10g10r10;
#else
	case WL_SHM_FORMAT_ARGB8888:
		return PIXMAN_b8g8r8a8;
	case WL_SHM_FORMAT_XRGB8888:
		return PIXMAN_b8g8r8x8;
	case WL_SHM_FORMAT_ABGR8888:
		return PIXMAN_r8g8b8a8;
	case WL_SHM_FORMAT_XBGR8888:
		return PIXMAN_r8g8b8x8;
	case WL_SHM_FORMAT_BGRA8888:
		return PIXMAN_a8r8g8b8;
	case WL_SHM_FORMAT_BGRX8888:
		return PIXMAN_x8r8g8b8;
	case WL_SHM_FORMAT_RGBA8888:
		return PIXMAN_a8b8g8r8;
	case WL_SHM_FORMAT_RGBX8888:
		return PIXMAN_x8b8g8r8;
#endif
	default:
		return 0;
	}
}

static gboolean is_format_supported(enum wl_shm_format fmt) {
	return get_pixman_format(fmt) != 0;
}

static uint32_t get_format_min_stride(enum wl_shm_format fmt, uint32_t width) {
	uint32_t bits_per_pixel = PIXMAN_FORMAT_BPP(get_pixman_format(fmt));
	return ((width * bits_per_pixel + 0x1f) >> 5) * sizeof(uint32_t);
}

static void compute_composite_region(const struct pixman_f_transform *out2com,
		int output_width, int output_height, struct grim_box *dest,
		gboolean *grid_aligned) {
	struct pixman_transform o2c_fixedpt;
	pixman_transform_from_pixman_f_transform(&o2c_fixedpt, out2com);

	pixman_fixed_t w = pixman_int_to_fixed(output_width);
	pixman_fixed_t h = pixman_int_to_fixed(output_height);
	struct pixman_vector corners[4] = {
		{{0, 0, pixman_fixed_1}},
		{{w, 0, pixman_fixed_1}},
		{{0, h, pixman_fixed_1}},
		{{w, h, pixman_fixed_1}},
	};

	pixman_fixed_t x_min = INT32_MAX, x_max = INT32_MIN,
		y_min = INT32_MAX, y_max = INT32_MIN;
	for (int i = 0; i < 4; i++) {
		pixman_transform_point(&o2c_fixedpt, &corners[i]);
		x_min = corners[i].vector[0] < x_min ? corners[i].vector[0] : x_min;
		x_max = corners[i].vector[0] > x_max ? corners[i].vector[0] : x_max;
		y_min = corners[i].vector[1] < y_min ? corners[i].vector[1] : y_min;
		y_max = corners[i].vector[1] > y_max ? corners[i].vector[1] : y_max;
	}

	*grid_aligned = pixman_fixed_frac(x_min) == 0 &&
		pixman_fixed_frac(x_max) == 0 &&
		pixman_fixed_frac(y_min) == 0 &&
		pixman_fixed_frac(y_max) == 0;

	int32_t x1 = pixman_fixed_to_int(pixman_fixed_floor(x_min));
	int32_t x2 = pixman_fixed_to_int(pixman_fixed_ceil(x_max));
	int32_t y1 = pixman_fixed_to_int(pixman_fixed_floor(y_min));
	int32_t y2 = pixman_fixed_to_int(pixman_fixed_ceil(y_max));
	*dest = (struct grim_box) {
		.x = x1,
		.y = y1,
		.width = x2 - x1,
		.height = y2 - y1
	};
}

static pixman_image_t *grim_render(struct grim_state *state, struct grim_box *geometry,
		double scale) {
	int common_width = geometry->width * scale;
	int common_height = geometry->height * scale;
	pixman_image_t *common_image = pixman_image_create_bits(PIXMAN_a8r8g8b8,
		common_width, common_height, NULL, 0);
	if (!common_image) {
		g_warning("failed to create image with size: %d x %d",
			common_width, common_height);
		return NULL;
	}

	struct grim_capture *capture;
	wl_list_for_each(capture, &state->captures, link) {
		struct grim_buffer *buffer = capture->buffer;
		if (buffer == NULL) {
			continue;
		}

		pixman_format_code_t pixman_fmt = get_pixman_format(buffer->format);
		if (!pixman_fmt) {
			g_warning("unsupported format %d = 0x%08x",
				buffer->format, buffer->format);
			pixman_image_unref(common_image);
			return NULL;
		}

		int32_t output_x = capture->logical_geometry.x - geometry->x;
		int32_t output_y = capture->logical_geometry.y - geometry->y;
		int32_t output_width = capture->logical_geometry.width;
		int32_t output_height = capture->logical_geometry.height;

		int32_t raw_output_width = buffer->width;
		int32_t raw_output_height = buffer->height;
		apply_output_transform(capture->transform, &raw_output_width, &raw_output_height);

		int output_flipped_x = get_output_flipped(capture->transform);
		int output_flipped_y = capture->screencopy_frame_flags &
			ZWLR_SCREENCOPY_FRAME_V1_FLAGS_Y_INVERT ? -1 : 1;

		pixman_image_t *output_image = pixman_image_create_bits(
			pixman_fmt, buffer->width, buffer->height,
			buffer->data, buffer->stride);
		if (!output_image) {
			g_warning("Failed to create image");
			pixman_image_unref(common_image);
			return NULL;
		}

		struct pixman_f_transform out2com;
		pixman_f_transform_init_identity(&out2com);
		pixman_f_transform_translate(&out2com, NULL,
			-(double)buffer->width / 2,
			-(double)buffer->height / 2);
		pixman_f_transform_scale(&out2com, NULL,
			(double)output_width / raw_output_width,
			(double)output_height * output_flipped_y / raw_output_height);
		pixman_f_transform_rotate(&out2com, NULL,
			round(cos(get_output_rotation(capture->transform))),
			round(sin(get_output_rotation(capture->transform))));
		pixman_f_transform_scale(&out2com, NULL, output_flipped_x, 1);
		pixman_f_transform_translate(&out2com, NULL,
			(double)output_width / 2,
			(double)output_height / 2);
		pixman_f_transform_translate(&out2com, NULL, output_x, output_y);
		pixman_f_transform_scale(&out2com, NULL, scale, scale);

		struct grim_box composite_dest;
		gboolean grid_aligned;
		compute_composite_region(&out2com, buffer->width,
			buffer->height, &composite_dest, &grid_aligned);

		pixman_f_transform_translate(&out2com, NULL,
			-composite_dest.x, -composite_dest.y);

		struct pixman_f_transform com2out;
		pixman_f_transform_invert(&com2out, &out2com);
		struct pixman_transform c2o_fixedpt;
		pixman_transform_from_pixman_f_transform(&c2o_fixedpt, &com2out);
		pixman_image_set_transform(output_image, &c2o_fixedpt);

		double x_scale = fmax(fabs(out2com.m[0][0]), fabs(out2com.m[0][1]));
		double y_scale = fmax(fabs(out2com.m[1][0]), fabs(out2com.m[1][1]));
		if (x_scale >= 0.75 && y_scale >= 0.75) {
			pixman_image_set_filter(output_image,
				PIXMAN_FILTER_BILINEAR, NULL, 0);
		} else {
			int n_values = 0;
			pixman_fixed_t *conv = pixman_filter_create_separable_convolution(
				&n_values,
				pixman_double_to_fixed(fmax(1., 1. / x_scale)),
				pixman_double_to_fixed(fmax(1., 1. / y_scale)),
				PIXMAN_KERNEL_IMPULSE, PIXMAN_KERNEL_IMPULSE,
				PIXMAN_KERNEL_LANCZOS2, PIXMAN_KERNEL_LANCZOS2,
				2, 2);
			pixman_image_set_filter(output_image,
				PIXMAN_FILTER_SEPARABLE_CONVOLUTION, conv, n_values);
			free(conv);
		}

		gboolean overlapping = false;
		struct grim_capture *other_capture;
		wl_list_for_each(other_capture, &state->captures, link) {
			if (capture != other_capture && intersect_box(&capture->logical_geometry,
					&other_capture->logical_geometry)) {
				overlapping = true;
			}
		}
		pixman_op_t op = (grid_aligned && !overlapping) ? PIXMAN_OP_SRC : PIXMAN_OP_OVER;
		pixman_image_composite32(op, output_image, NULL, common_image,
			0, 0, 0, 0, composite_dest.x, composite_dest.y,
			composite_dest.width, composite_dest.height);

		pixman_image_unref(output_image);
	}

	return common_image;
}

/* --- Output Listener Callback Implementations --- */

static void output_handle_geometry(void *data, struct wl_output *wl_output,
		int32_t x, int32_t y, int32_t physical_width, int32_t physical_height,
		int32_t subpixel, const char *make, const char *model,
		int32_t transform) {
	struct grim_output *output = data;

	output->fallback_x = x;
	output->fallback_y = y;
	output->transform = transform;
}

static void output_handle_mode(void *data, struct wl_output *wl_output,
		uint32_t flags, int32_t width, int32_t height, int32_t refresh) {
	struct grim_output *output = data;

	if ((flags & WL_OUTPUT_MODE_CURRENT) != 0) {
		output->mode_width = width;
		output->mode_height = height;
	}
}

static void output_handle_done(void *data, struct wl_output *wl_output) {
	// No-op
}

static void output_handle_scale(void *data, struct wl_output *wl_output,
		int32_t factor) {
	struct grim_output *output = data;
	output->scale = factor;
}

static void output_handle_name(void *data, struct wl_output *wl_output,
		const char *name) {
	struct grim_output *output = data;
	output->name = strdup(name);
}

static void output_handle_description(void *data, struct wl_output *wl_output,
		const char *description) {
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
		struct zxdg_output_v1 *xdg_output, int32_t x, int32_t y) {
	struct grim_output *output = data;

	output->logical_geometry.x = x;
	output->logical_geometry.y = y;
}

static void xdg_output_handle_logical_size(void *data,
		struct zxdg_output_v1 *xdg_output, int32_t width, int32_t height) {
	struct grim_output *output = data;

	output->logical_geometry.width = width;
	output->logical_geometry.height = height;
}

static void xdg_output_handle_done(void *data,
		struct zxdg_output_v1 *xdg_output) {
	struct grim_output *output = data;

	int32_t width = output->mode_width;
	int32_t height = output->mode_height;
	apply_output_transform(output->transform, &width, &height);
	output->logical_scale = (double)width / output->logical_geometry.width;
}

static void xdg_output_handle_name(void *data,
		struct zxdg_output_v1 *xdg_output, const char *name) {
	struct grim_output *output = data;
	if (output->name) {
		return;
	}
	output->name = strdup(name);
}

static void xdg_output_handle_description(void *data,
		struct zxdg_output_v1 *xdg_output, const char *name) {
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
		struct zwlr_screencopy_frame_v1 *frame, uint32_t flags) {
	struct grim_capture *capture = data;
	capture->screencopy_frame_flags = flags;
}

static void screencopy_frame_handle_ready(void *data,
		struct zwlr_screencopy_frame_v1 *frame, uint32_t tv_sec_hi,
		uint32_t tv_sec_lo, uint32_t tv_nsec) {
	struct grim_capture *capture = data;
	++capture->state->n_done;
}

static void screencopy_frame_handle_failed(void *data,
		struct zwlr_screencopy_frame_v1 *frame) {
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

/* --- Ext Image Copy Frame/Session Listener Callback Implementations --- */

static void ext_image_copy_capture_frame_handle_transform(void *data,
		struct ext_image_copy_capture_frame_v1 *frame, uint32_t transform) {
	struct grim_capture *capture = data;
	capture->transform = transform;
}

static void ext_image_copy_capture_frame_handle_damage(void *data,
		struct ext_image_copy_capture_frame_v1 *frame, int32_t x, int32_t y,
		int32_t wdth, int32_t height) {
	// No-op
}

static void ext_image_copy_capture_frame_handle_presentation_time(void *data,
		struct ext_image_copy_capture_frame_v1 *frame, uint32_t tv_sec_hi,
		uint32_t tv_sec_lo, uint32_t tv_nsec) {
	// No-op
}

static void ext_image_copy_capture_frame_handle_ready(void *data,
		struct ext_image_copy_capture_frame_v1 *frame) {
	struct grim_capture *capture = data;
	++capture->state->n_done;
}

static void ext_image_copy_capture_frame_handle_failed(void *data,
		struct ext_image_copy_capture_frame_v1 *frame, uint32_t reason) {
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
		struct ext_image_copy_capture_session_v1 *session, uint32_t width, uint32_t height) {
	struct grim_capture *capture = data;
	capture->buffer_width = width;
	capture->buffer_height = height;
}

static void ext_image_copy_capture_session_handle_shm_format(void *data,
		struct ext_image_copy_capture_session_v1 *session, uint32_t format) {
	struct grim_capture *capture = data;
	if (is_format_supported(format)) {
		capture->shm_format = format;
		capture->has_shm_format = true;
	}
}

static void ext_image_copy_capture_session_handle_dmabuf_device(void *data,
		struct ext_image_copy_capture_session_v1 *session, struct wl_array *dev_id_array) {
	// No-op
}

static void ext_image_copy_capture_session_handle_dmabuf_format(void *data,
		struct ext_image_copy_capture_session_v1 *session, uint32_t format,
		struct wl_array *modifiers) {
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

static void ext_image_copy_capture_session_handle_stopped(void *data,
		struct ext_image_copy_capture_session_v1 *session) {
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
	if (state->ext_output_image_capture_source_manager != NULL) {
		ext_output_image_capture_source_manager_v1_destroy(state->ext_output_image_capture_source_manager);
	}
	if (state->ext_image_copy_capture_manager != NULL) {
		ext_image_copy_capture_manager_v1_destroy(state->ext_image_copy_capture_manager);
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
	while (!capture_failed && state.n_done < n_pending && wl_display_dispatch(state.display) != -1) {
		// Event loop
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

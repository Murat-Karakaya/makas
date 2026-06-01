#ifndef WAYLAND_COMMON_H
#define WAYLAND_COMMON_H

#include <stdbool.h>
#include <stdint.h>
#include <stdlib.h>
#include <stdio.h>
#include <string.h>
#include <limits.h>
#include <math.h>
#include <fcntl.h>
#include <sys/mman.h>
#include <unistd.h>
#include <time.h>
#include <pixman.h>
#include <wayland-client.h>
#include <glib.h>
#include <gdk-pixbuf/gdk-pixbuf.h>

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
	gboolean y_invert;

	struct ext_image_copy_capture_session_v1 *ext_image_copy_capture_session;
	struct ext_image_copy_capture_frame_v1 *ext_image_copy_capture_frame;
	uint32_t buffer_width, buffer_height;
	enum wl_shm_format shm_format;
	gboolean has_shm_format;

	struct zwlr_screencopy_frame_v1 *screencopy_frame;
	uint32_t screencopy_frame_flags;
};

/* --- Geometry Helper Functions --- */
gboolean intersect_box(const struct grim_box *box_a, const struct grim_box *box_b);
void get_capture_layout_extents(struct grim_state *state, struct grim_box *box);
void apply_output_transform(enum wl_output_transform transform, int32_t *width, int32_t *height);
double get_output_rotation(enum wl_output_transform transform);
int get_output_flipped(enum wl_output_transform transform);
void guess_output_logical_geometry(struct grim_output *output);

/* --- Shared Memory Allocation Functions --- */
void randname(char *buf);
int anonymous_shm_open(void);
int create_shm_file(off_t size);
struct grim_buffer *create_buffer(struct wl_shm *shm, enum wl_shm_format format, int32_t width, int32_t height, int32_t stride);
void destroy_buffer(struct grim_buffer *buffer);

/* --- Pixman/Formatting Helpers --- */
pixman_format_code_t get_pixman_format(enum wl_shm_format wl_fmt);
gboolean is_format_supported(enum wl_shm_format fmt);
uint32_t get_format_min_stride(enum wl_shm_format fmt, uint32_t width);
void compute_composite_region(const struct pixman_f_transform *out2com, int output_width, int output_height, struct grim_box *dest, gboolean *grid_aligned);
pixman_image_t *grim_render(struct grim_state *state, struct grim_box *geometry, double scale);

#endif /* WAYLAND_COMMON_H */

/* makas-screenshot.c - Window screenshot with XComposite + XShape
 *
 * ATTRIBUTION: This file contains code adapted from gnome-screenshot
 * (https://gitlab.gnome.org/GNOME/gnome-screenshot)
 *
 * Original authors:
 *   Copyright (C) 2001-2006  Jonathan Blandford <jrb@alum.mit.edu>
 *   Copyright (C) 2008 Cosimo Cecchi <cosimoc@gnome.org>
 *   Copyright (C) 2020 Alexander Mikhaylenko <alexm@gnome.org>
 *
 * Modified for Makas by Murat Karakaya
 * SPDX-License-Identifier: GPL-2.0-or-later
 *
 * BORROWED CODE FROM gnome-screenshot/src/screenshot-backend-x11.c:
 * - find_wm_window(): Lines 78-104 - Traverse X11 window tree to find WM frame
 * - XShape transparency logic: Lines 398-495 - Apply XShape mask for rounded
 * corners
 */

#include "makas-screenshot.h"

#include <X11/Xlib.h>
#include <X11/extensions/Xcomposite.h>
#include <X11/extensions/shape.h>
#include <gdk/gdkx.h>
#include <gtk/gtk.h>

struct _MakasScreenshot {
  GObject parent_instance;
};

G_DEFINE_TYPE(MakasScreenshot, makas_screenshot, G_TYPE_OBJECT);

static void makas_screenshot_class_init(MakasScreenshotClass *klass) {
  (void)klass;
}

static void makas_screenshot_init(MakasScreenshot *self) { (void)self; }

MakasScreenshot *makas_screenshot_new(void) {
  return g_object_new(MAKAS_TYPE_SCREENSHOT, NULL);
}

/* BORROWED: find_wm_window from gnome-screenshot:78-104
 * Traverses the X11 window tree to find the WM frame window (includes
 * decorations).
 */
static Window find_wm_window(GdkWindow *window) {
  Window xid, root, parent, *children;
  unsigned int nchildren;

  if (window == gdk_get_default_root_window())
    return None;

  xid = GDK_WINDOW_XID(window);

  do {
    if (XQueryTree(GDK_DISPLAY_XDISPLAY(gdk_display_get_default()), xid, &root,
                   &parent, &children, &nchildren) == 0) {
      g_warning("Couldn't find window manager window");
      return None;
    }

    if (children)
      XFree(children);

    if (root == parent)
      return xid;

    xid = parent;
  } while (TRUE);
}

/* Find the window at coordinates (x, y) */
static GdkWindow *find_window_at_coords(gint x, gint y) {
  GdkScreen *screen = gdk_screen_get_default();
  GList *windows = gdk_screen_get_window_stack(screen);
  GdkWindow *found = NULL;

  if (!windows)
    return NULL;

  /* Reverse to get top-to-bottom order */
  windows = g_list_reverse(windows);

  for (GList *l = windows; l != NULL; l = l->next) {
    GdkWindow *win = l->data;
    GdkRectangle rect;
    GdkWindowTypeHint type_hint;

    if (!gdk_window_is_viewable(win))
      continue;

    type_hint = gdk_window_get_type_hint(win);
    if (type_hint == GDK_WINDOW_TYPE_HINT_DESKTOP ||
        type_hint == GDK_WINDOW_TYPE_HINT_DOCK)
      continue;

    gdk_window_get_frame_extents(win, &rect);

    if (x >= rect.x && x < rect.x + rect.width && y >= rect.y &&
        y < rect.y + rect.height) {
      found = gdk_window_get_toplevel(win);
      break;
    }
  }

  g_list_free(windows);
  return found;
}

/* Capture window using XComposite to get full content (even
 * off-screen/occluded) */
static GdkPixbuf *capture_window_pixmap(Display *display, Window wm_xid,
                                        gint width, gint height) {
  Pixmap pixmap;
  GdkPixbuf *screenshot = NULL;
  XWindowAttributes attrs;

  /* Get window attributes for depth info */
  if (!XGetWindowAttributes(display, wm_xid, &attrs)) {
    g_warning("Failed to get window attributes");
    return NULL;
  }

  /* Redirect window to get its backing store */
  XCompositeRedirectWindow(display, wm_xid, CompositeRedirectAutomatic);
  XSync(display, False);

  /* Get the pixmap containing the window's content */
  pixmap = XCompositeNameWindowPixmap(display, wm_xid);
  if (pixmap == None) {
    g_warning("XCompositeNameWindowPixmap failed");
    XCompositeUnredirectWindow(display, wm_xid, CompositeRedirectAutomatic);
    return NULL;
  }

  /* Create XImage from the pixmap */
  XImage *image =
      XGetImage(display, pixmap, 0, 0, width, height, AllPlanes, ZPixmap);
  if (!image) {
    g_warning("XGetImage failed");
    XFreePixmap(display, pixmap);
    XCompositeUnredirectWindow(display, wm_xid, CompositeRedirectAutomatic);
    return NULL;
  }

  /* Determine if we have alpha channel */
  gboolean has_alpha = (image->depth == 32);

  /* Create GdkPixbuf from XImage data */
  screenshot = gdk_pixbuf_new(GDK_COLORSPACE_RGB, has_alpha, 8, width, height);
  if (!screenshot) {
    XDestroyImage(image);
    XFreePixmap(display, pixmap);
    XCompositeUnredirectWindow(display, wm_xid, CompositeRedirectAutomatic);
    return NULL;
  }

  guchar *pixels = gdk_pixbuf_get_pixels(screenshot);
  int rowstride = gdk_pixbuf_get_rowstride(screenshot);
  int n_channels = gdk_pixbuf_get_n_channels(screenshot);

  /* Copy pixels from XImage to GdkPixbuf */
  for (int y = 0; y < height; y++) {
    for (int x = 0; x < width; x++) {
      unsigned long pixel = XGetPixel(image, x, y);
      guchar *p = pixels + y * rowstride + x * n_channels;

      /* Extract RGB(A) - X11 stores in BGRA for 32-bit */
      if (image->depth == 32) {
        p[0] = (pixel >> 16) & 0xFF; /* R */
        p[1] = (pixel >> 8) & 0xFF;  /* G */
        p[2] = pixel & 0xFF;         /* B */
        p[3] = (pixel >> 24) & 0xFF; /* A */
      } else {
        p[0] = (pixel >> 16) & 0xFF; /* R */
        p[1] = (pixel >> 8) & 0xFF;  /* G */
        p[2] = pixel & 0xFF;         /* B */
        if (has_alpha)
          p[3] = 255;
      }
    }
  }

  XDestroyImage(image);
  XFreePixmap(display, pixmap);
  XCompositeUnredirectWindow(display, wm_xid, CompositeRedirectAutomatic);

  return screenshot;
}

/* Apply XShape mask to make non-visible areas transparent */
static void apply_xshape_mask(GdkPixbuf *pixbuf, Display *display,
                              Window wm_xid, int scale_factor) {
  XRectangle *rectangles;
  int rectangle_count, rectangle_order;

  rectangles = XShapeGetRectangles(display, wm_xid, ShapeBounding,
                                   &rectangle_count, &rectangle_order);

  if (!rectangles || rectangle_count <= 0)
    return;

  int width = gdk_pixbuf_get_width(pixbuf);
  int height = gdk_pixbuf_get_height(pixbuf);
  gboolean has_alpha = gdk_pixbuf_get_has_alpha(pixbuf);

  if (!has_alpha) {
    /* Need to add alpha channel */
    /* Caller should have added an alpha channel already */
    g_warning("apply_xshape_mask: pixbuf has no alpha channel");
    XFree(rectangles);
    return;
  }

  /* Create a visibility map */
  gboolean *visible = g_new0(gboolean, width * height);

  /* Mark visible pixels based on XShape rectangles */
  for (int i = 0; i < rectangle_count; i++) {
    int rx = rectangles[i].x / scale_factor;
    int ry = rectangles[i].y / scale_factor;
    int rw = rectangles[i].width / scale_factor;
    int rh = rectangles[i].height / scale_factor;

    for (int y = ry; y < ry + rh && y < height; y++) {
      for (int x = rx; x < rx + rw && x < width; x++) {
        if (x >= 0 && y >= 0)
          visible[y * width + x] = TRUE;
      }
    }
  }

  /* Set alpha to 0 for non-visible pixels */
  guchar *pixels = gdk_pixbuf_get_pixels(pixbuf);
  int rowstride = gdk_pixbuf_get_rowstride(pixbuf);

  for (int y = 0; y < height; y++) {
    for (int x = 0; x < width; x++) {
      if (!visible[y * width + x]) {
        guchar *p = pixels + y * rowstride + x * 4;
        p[3] = 0; /* Set alpha to transparent */
      }
    }
  }

  g_free(visible);
  XFree(rectangles);
}

/* Composite cursor onto pixbuf */
static void composite_pointer(GdkPixbuf *pixbuf, GdkWindow *wm_window) {
  GdkCursor *cursor;
  GdkPixbuf *cursor_pixbuf;
  GdkSeat *seat;
  GdkDevice *device;
  gint cx, cy, xhot, yhot;

  cursor = gdk_cursor_new_for_display(gdk_display_get_default(), GDK_LEFT_PTR);
  cursor_pixbuf = gdk_cursor_get_image(cursor);
  g_object_unref(cursor);

  if (cursor_pixbuf == NULL)
    return;

  seat = gdk_display_get_default_seat(gdk_display_get_default());
  device = gdk_seat_get_pointer(seat);

  /* Get cursor position relative to window */
  gdk_window_get_device_position(wm_window, device, &cx, &cy, NULL);

  const gchar *xhot_str = gdk_pixbuf_get_option(cursor_pixbuf, "x_hot");
  const gchar *yhot_str = gdk_pixbuf_get_option(cursor_pixbuf, "y_hot");
  xhot = xhot_str ? atoi(xhot_str) : 0;
  yhot = yhot_str ? atoi(yhot_str) : 0;

  gint cursor_x = cx - xhot;
  gint cursor_y = cy - yhot;

  /* Composite if within bounds */
  if (cursor_x >= 0 && cursor_y >= 0 &&
      cursor_x < gdk_pixbuf_get_width(pixbuf) &&
      cursor_y < gdk_pixbuf_get_height(pixbuf)) {
    gint cursor_width = MIN(gdk_pixbuf_get_width(cursor_pixbuf),
                            gdk_pixbuf_get_width(pixbuf) - cursor_x);
    gint cursor_height = MIN(gdk_pixbuf_get_height(cursor_pixbuf),
                             gdk_pixbuf_get_height(pixbuf) - cursor_y);

    gdk_pixbuf_composite(cursor_pixbuf, pixbuf, cursor_x, cursor_y,
                         cursor_width, cursor_height, cursor_x, cursor_y, 1.0,
                         1.0, GDK_INTERP_BILINEAR, 255);
  }

  g_object_unref(cursor_pixbuf);
}

/**
 * makas_screenshot_capture_window:
 *
 * Captures a window at (x, y) with:
 * - Window decorations (title bar, borders)
 * - Full window content (even if off-screen or occluded)
 * - Transparent rounded corners (using XShape)
 * - Optional mouse pointer
 */
GdkPixbuf *makas_screenshot_capture_window(MakasScreenshot *self, gint x,
                                           gint y, gboolean include_pointer) {
  GdkWindow *window, *wm_window = NULL;
  GdkPixbuf *screenshot = NULL;
  Window wm_xid;
  Display *display;
  GdkRectangle wm_rect;

  g_return_val_if_fail(MAKAS_IS_SCREENSHOT(self), NULL);

  display = GDK_DISPLAY_XDISPLAY(gdk_display_get_default());

  /* Find window at coordinates */
  window = find_window_at_coords(x, y);
  if (window == NULL) {
    g_warning("No window found at coordinates (%d, %d)", x, y);
    return NULL;
  }

  /* Find the WM frame window (includes decorations) */
  wm_xid = find_wm_window(window);
  if (wm_xid == None) {
    g_warning("Could not find WM window");
    return NULL;
  }

  /* Get GdkWindow for the WM frame */
  wm_window =
      gdk_x11_window_foreign_new_for_display(gdk_display_get_default(), wm_xid);
  if (wm_window == NULL) {
    g_warning("Could not create GdkWindow for WM frame");
    return NULL;
  }

  /* Get WM window dimensions (includes decorations) */
  gdk_window_get_frame_extents(wm_window, &wm_rect);

  /* Capture using XComposite (gets full window, even off-screen/occluded) */
  screenshot =
      capture_window_pixmap(display, wm_xid, wm_rect.width, wm_rect.height);

  if (screenshot == NULL) {
    g_warning("Failed to capture window pixmap");
    g_object_unref(wm_window);
    return NULL;
  }

  /* Ensure we have alpha channel for XShape transparency */
  if (!gdk_pixbuf_get_has_alpha(screenshot)) {
    GdkPixbuf *tmp = gdk_pixbuf_add_alpha(screenshot, FALSE, 0, 0, 0);
    g_object_unref(screenshot);
    screenshot = tmp;
  }

  /* Apply XShape mask for transparent rounded corners */
  int scale_factor = gdk_window_get_scale_factor(wm_window);
  apply_xshape_mask(screenshot, display, wm_xid, scale_factor);

  /* Composite pointer if requested */
  if (include_pointer) {
    composite_pointer(screenshot, wm_window);
  }

  g_object_unref(wm_window);

  return screenshot;
}

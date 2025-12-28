#include "makas-screenshot.h"
#include "glib.h"

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

// find_wm_window is just a copy-pasta from gnome-screenshot (with the same
// name)
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

    if (root == parent)
      return xid;

    xid = parent;
  } while (TRUE);
}

static GdkWindow *find_window_at_coords(gint x, gint y) {
  GdkScreen *screen = gdk_screen_get_default();
  GdkWindow *found = NULL;

  gint current_desktop = -1;
  if (GDK_IS_X11_SCREEN(screen)) {
    current_desktop = gdk_x11_screen_get_current_desktop(screen);
  }

  GList *windows = gdk_screen_get_window_stack(screen);
  if (!windows)
    return NULL;

  windows = g_list_reverse(windows);

  for (GList *l = windows; l != NULL; l = l->next) {
    GdkWindow *win = l->data;

    GdkWindowTypeHint type_hint = gdk_window_get_type_hint(win);

    // Just ignore the dock and the desktop. Might wanto to expose the option to
    // include them in the future.
    if (type_hint == GDK_WINDOW_TYPE_HINT_DESKTOP ||
        type_hint == GDK_WINDOW_TYPE_HINT_DOCK)
      continue;

    if (!gdk_window_is_viewable(win))
      continue;

    if (current_desktop != -1 && GDK_IS_X11_WINDOW(win)) {
      guint32 win_desktop = gdk_x11_window_get_desktop(win);

      // 0xFFFFFFFF is "Pinned" (Always on Visible Workspace)
      if (win_desktop != (guint32)current_desktop &&
          win_desktop != 0xFFFFFFFF) {
        continue;
      }
    }

    GdkRectangle rect;
    gdk_window_get_frame_extents(win, &rect);

    if (x >= rect.x && x < rect.x + rect.width && y >= rect.y &&
        y < rect.y + rect.height) {
      // This is included here to handle a hypothetical scenario where
      // the window doesn't exist by the time it must be captured.
      // We actually don't try to find the window before the delay, We find it
      // right before capturing it. So this precaution might not be necessary.
      gdk_window_set_events(win,
                            gdk_window_get_events(win) | GDK_STRUCTURE_MASK);

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

/* Capture window logic implemented below */
GdkPixbuf *makas_screenshot_capture_window(MakasScreenshot *self, gint x,
                                           gint y, gboolean include_pointer) {
  GdkWindow *window, *wm_window = NULL;
  GdkPixbuf *screenshot = NULL;
  Window wm_xid;
  Display *display;
  g_autoptr(GError) error = NULL;

  g_return_val_if_fail(MAKAS_IS_SCREENSHOT(self), NULL);

  screenshot = NULL;

  // Fallback to X11
  display = GDK_DISPLAY_XDISPLAY(gdk_display_get_default());

  window = find_window_at_coords(x, y);
  if (window == NULL) {
    g_warning("No window found at coordinates (%d, %d)", x, y);
    return NULL;
  }

  GdkRectangle inner_rect;
  gdk_window_get_frame_extents(window, &inner_rect);
  // --- Getting the WM frame ---
  wm_xid = find_wm_window(window);
  if (wm_xid == None) {
    g_warning("Could not find WM window");
    return NULL;
  }

  /* Get GdkWindow for the WM frame */
  wm_window = gdk_x11_window_foreign_new_for_display(
      gdk_window_get_display(window), wm_xid);

  GdkRectangle frame_rect;
  gdk_window_get_frame_extents(wm_window, &frame_rect);

  GdkPixbuf *frame_pixbuf = capture_window_pixmap(
      display, wm_xid, frame_rect.width, frame_rect.height);

  if (!frame_pixbuf) {
    g_warning("Failed to capture window pixmap");
    g_object_unref(wm_window);
    return NULL;
  }

  if (!gdk_pixbuf_get_has_alpha(frame_pixbuf)) {
    GdkPixbuf *tmp = gdk_pixbuf_add_alpha(frame_pixbuf, FALSE, 0, 0, 0);
    g_object_unref(frame_pixbuf);
    frame_pixbuf = tmp;
  }

  /* Apply XShape mask to the FULL frame first */
  int scale_factor = gdk_window_get_scale_factor(wm_window);
  apply_xshape_mask(frame_pixbuf, display, wm_xid, scale_factor);

  g_object_unref(wm_window);

  int crop_x = inner_rect.x - frame_rect.x;
  int crop_y = 0;
  int crop_width = inner_rect.width;

  int crop_height = inner_rect.y - frame_rect.y + inner_rect.height;

  screenshot = gdk_pixbuf_new_subpixbuf(frame_pixbuf, crop_x, crop_y,
                                        crop_width, crop_height);
  screenshot = gdk_pixbuf_copy(screenshot);

  if (include_pointer) {
    makas_screenshot_composite_cursor(self, screenshot, frame_rect.x + crop_x,
                                      frame_rect.y + crop_y);
  }

  g_object_unref(frame_pixbuf);

  return screenshot;
}

void makas_screenshot_composite_cursor(MakasScreenshot *self, GdkPixbuf *pixbuf,
                                       gint root_x_offset, gint root_y_offset) {
  g_return_if_fail(MAKAS_IS_SCREENSHOT(self));
  g_return_if_fail(GDK_IS_PIXBUF(pixbuf));

  GdkDisplay *display = gdk_display_get_default();
  GdkSeat *seat = gdk_display_get_default_seat(display);
  GdkDevice *pointer = gdk_seat_get_pointer(seat);

  GdkScreen *screen;
  gint x, y;
  gdk_device_get_position(pointer, &screen, &x, &y);

  GdkCursor *cursor = gdk_cursor_new_for_display(display, GDK_LEFT_PTR);
  if (!cursor) {
    g_warning("Could not create cursor for compositing");
    return;
  }

  GdkPixbuf *cursor_pixbuf = gdk_cursor_get_image(cursor);
  if (!cursor_pixbuf) {
    // Some themes/cursors might not support getting the image directly this way
    g_object_unref(cursor);
    return;
  }

  gint hot_x = 0;
  gint hot_y = 0;

  const gchar *hot_x_str = gdk_pixbuf_get_option(cursor_pixbuf, "x_hot");
  const gchar *hot_y_str = gdk_pixbuf_get_option(cursor_pixbuf, "y_hot");

  if (hot_x_str)
    hot_x = atoi(hot_x_str);
  if (hot_y_str)
    hot_y = atoi(hot_y_str);

  gint dest_x = x - root_x_offset - hot_x;
  gint dest_y = y - root_y_offset - hot_y;

  gint pb_width = gdk_pixbuf_get_width(pixbuf);
  gint pb_height = gdk_pixbuf_get_height(pixbuf);
  gint cur_width = gdk_pixbuf_get_width(cursor_pixbuf);
  gint cur_height = gdk_pixbuf_get_height(cursor_pixbuf);

  /* Intersection logic to ensure safe memory access */
  gint inter_x = MAX(0, dest_x);
  gint inter_y = MAX(0, dest_y);
  gint inter_right = MIN(pb_width, dest_x + cur_width);
  gint inter_bottom = MIN(pb_height, dest_y + cur_height);
  gint inter_w = inter_right - inter_x;
  gint inter_h = inter_bottom - inter_y;

  if (inter_w > 0 && inter_h > 0) {
    gdk_pixbuf_composite(cursor_pixbuf, pixbuf, inter_x, inter_y, inter_w,
                         inter_h, dest_x, dest_y, 1.0, 1.0, GDK_INTERP_BILINEAR,
                         255);
  }

  g_object_unref(cursor_pixbuf);
  g_object_unref(cursor);
}

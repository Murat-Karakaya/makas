import Gtk from "gi://Gtk?version=3.0";
import Gdk from "gi://Gdk?version=3.0";
import GObject from "gi://GObject";
import GLib from "gi://GLib";
import Gio from "gi://Gio";

import { selectArea, selectWindow } from "./area-selection.js";
import {
  compositeCursor,
  settings,
  wait,
  captureWindowWithXShape,
  captureWithShell,
} from "./utils.js";
import { PreScreenshot } from "./prescreenshot.js";
import { flashRect } from "./flash.js";
import { PostScreenshot } from "./postscreenshot.js";
import { CaptureMode } from "./constants.js";

export const ScreenshotPage = GObject.registerClass(
  class ScreenshotPage extends Gtk.Box {
    _init() {
      super._init({
        orientation: Gtk.Orientation.VERTICAL,
      });

      this.lastPixbuf = null;

      this.stack = new Gtk.Stack({
        transition_type: Gtk.StackTransitionType.SLIDE_LEFT_RIGHT,
        transition_duration: 300,
      });

      this.preScreenshot = new PreScreenshot({
        onTakeScreenshot: this.onTakeScreenshot.bind(this),
      });
      this.postScreenshot = new PostScreenshot({
        onBack: this.onBackFromPost.bind(this),
      });

      this.stack.add_named(this.preScreenshot, "pre");
      this.stack.add_named(this.postScreenshot, "post");

      this.add(this.stack);
    }

    onBackFromPost() {
      this.stack.set_visible_child_name("pre");
      this.preScreenshot.setStatus("Ready");
      this.lastPixbuf = null;
    }

    async onTakeScreenshot({ captureMode, delay, includePointer }) {
      const app = Gio.Application.get_default();
      if (app) {
        app.hold();
      } else {
        print("Screenshot: WARNING - App not found via get_default()");
      }

      const topLevel = this.get_toplevel();

      try {
        // Wait for window to hide
        const windowWait = settings.get_int("window-wait");
        if (windowWait > delay * 100) {
          topLevel.hide();
          await wait(windowWait * 10);
        }

        let selectionResult = null;
        print(`Screenshot: Selection phase, mode=${captureMode}`);

        if (captureMode === CaptureMode.AREA) {
          selectionResult = await selectArea();
          if (!selectionResult) {
            print("Screenshot: Area selection cancelled");
            this.preScreenshot.setStatus("Capture cancelled");
            return;
          }
        } else if (captureMode === CaptureMode.WINDOW) {
          const backend = settings.get_int("capture-backend");
          if (backend === 1) { // X11
            selectionResult = await selectWindow();
            if (!selectionResult) {
              print("Screenshot: Window selection cancelled");
              this.preScreenshot.setStatus("Capture cancelled");
              return;
            }
          } else {
            // Shell backend takes the active window automatically
            selectionResult = { clickX: 0, clickY: 0 }; // Just to trigger the logic
          }
        }

        if (windowWait < delay * 100) {
          await this.startDelay(delay * 100 - windowWait, windowWait);
          topLevel.hide();
          await wait(windowWait * 10);
        }

        await this.performCapture(selectionResult, {
          captureMode,
          includePointer,
        });
      } catch (e) {
        print(`Screenshot error during flow: ${e.message}`);
        this.preScreenshot.setStatus(`Error: ${e.message}`);
      } finally {
        print("Screenshot: Restoring window");
        topLevel.show();
        topLevel.present();
        if (app) app.release();
      }
    }

    async startDelay(delay, windowWait) {
      print(`Waiting... ${(delay + windowWait) / 100}s`);
      this.preScreenshot.setStatus(`Capturing in ${(delay + windowWait) / 100}s...`);

      if (delay <= 0) return;

      let remaining = delay;
      return new Promise((resolve) => {
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 10, () => {
          remaining--;
          if ((remaining + windowWait) % 100 === 0) {
            this.preScreenshot.setStatus(`Capturing in ${(remaining + windowWait) / 100}s...`);
            print(`Waiting... ${(remaining + windowWait) / 100}s`);
          }
          if (remaining <= 0) {
            resolve();
            return GLib.SOURCE_REMOVE;
          }
          return GLib.SOURCE_CONTINUE;
        });
      });
    }

    async performCapture(
      selectionResult,
      { captureMode, includePointer },
    ) {
      print("Screenshot: Capturing...");
      this.preScreenshot.setStatus("Capturing...");
      let pixbuf = null;

      if (settings.get_int("capture-backend") === 0) {
        pixbuf = await captureWithShell(includePointer, captureMode, selectionResult);

        if (pixbuf) {
          print(`Screenshot: Captured ${Object.keys(CaptureMode)[captureMode]} via Shell D-Bus`);
          this.lastPixbuf = pixbuf;

          this.postScreenshot.setImage(pixbuf);
          this.stack.set_visible_child_name("post");

          return;
        }
        print("Screenshot: Shell D-Bus capture failed, falling back to X11");
      }

      switch (captureMode) {
        case CaptureMode.SCREEN:
          const rootWindow = Gdk.get_default_root_window();
          pixbuf = Gdk.pixbuf_get_from_window(
            rootWindow,
            0,
            0,
            rootWindow.get_width(),
            rootWindow.get_height(),
          );
          flashRect(0, 0, pixbuf.get_width(), pixbuf.get_height());
          if (includePointer) {
            compositeCursor(pixbuf, 0, 0);
          }
          break;
        case CaptureMode.WINDOW:
          if (selectionResult && selectionResult.clickX !== undefined) {
            const result = captureWindowWithXShape(
              selectionResult.clickX,
              selectionResult.clickY
            );

            if (result) {
              pixbuf = result.pixbuf;
              flashRect(result.offsetX, result.offsetY, pixbuf.get_width(), pixbuf.get_height());

              if (includePointer) {
                compositeCursor(pixbuf, result.offsetX, result.offsetY);
              }
            }
          }
          break;
        case CaptureMode.AREA:
          if (selectionResult) {
            const rootWindow = Gdk.get_default_root_window();
            pixbuf = Gdk.pixbuf_get_from_window(
              rootWindow,
              selectionResult.x,
              selectionResult.y,
              selectionResult.width,
              selectionResult.height,
            );
            flashRect(
              selectionResult.x,
              selectionResult.y,
              selectionResult.width,
              selectionResult.height
            );
            if (includePointer) {
              compositeCursor(pixbuf, selectionResult.x, selectionResult.y);
            }
          }
          break;
      }

      this.lastPixbuf = pixbuf;
      this.postScreenshot.setImage(pixbuf);
      this.stack.set_visible_child_name("post");
      this.preScreenshot.afterScreenShoot();
    }
  },
);

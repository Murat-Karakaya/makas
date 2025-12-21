import Gtk from "gi://Gtk?version=3.0";
import Gdk from "gi://Gdk?version=3.0";
import GObject from "gi://GObject";
import GLib from "gi://GLib";
import Gio from "gi://Gio";

import { selectArea, selectWindow } from "./area-selection.js";
import {
  compositePointer,
  settings,
  wait,
  captureWindowWithXShape,
  captureWithShell,
} from "./utils.js";
import { PreScreenshot } from "./prescreenshot.js";
import { PostScreenshot } from "./postscreenshot.js";

// Capture mode enumeration
const CaptureMode = {
  SCREEN: 0,
  WINDOW: 1,
  AREA: 2,
};

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
      this.preScreenshot.updateFilename();
      this.preScreenshot.setStatus("Ready");
      this.lastPixbuf = null;
    }

    async onTakeScreenshot({ captureMode, delay, includePointer, folder, filename }) {
      const app = Gio.Application.get_default();
      if (app) {
        app.hold();
      } else {
        print("Screenshot: WARNING - App not found via get_default()");
      }

      const topLevel = this.get_toplevel();

      if (topLevel && topLevel.hide) {
        print("Screenshot: Hiding window");
        topLevel.hide();
      }

      try {
        // Wait for window to hide
        const windowWait = settings.get_int("window-wait");
        if (windowWait > delay * 1000) {
          await wait(windowWait);
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

        if (windowWait < delay * 1000) {
          await this.startDelay(delay);
        }

        await this.performCapture(selectionResult, {
          captureMode,
          includePointer,
          folder,
          filename,
        });
      } catch (e) {
        print(`Screenshot error during flow: ${e.message}`);
        this.preScreenshot.setStatus(`Error: ${e.message}`);
      } finally {
        print("Screenshot: Restoring window");
        if (topLevel && topLevel.show) {
          topLevel.show();
          topLevel.present();
        }
        if (app) app.release();
      }
    }

    async startDelay(delay) {
      print(`Screenshot: Delay phase, delay=${delay}`);
      this.preScreenshot.setStatus(`Capturing in ${delay}s...`);

      if (delay <= 0) return;

      let remaining = delay;
      return new Promise((resolve) => {
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
          remaining--;
          if (remaining > 0) {
            this.preScreenshot.setStatus(`Capturing in ${remaining}s...`);
            print(`Screenshot: Waiting... ${remaining}`);
            return GLib.SOURCE_CONTINUE;
          } else {
            resolve();
            return GLib.SOURCE_REMOVE;
          }
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

      const backend = settings.get_int("capture-backend");
      const useShell = backend === 0;

      if (useShell) {
        let shellParams = { mode: captureMode };
        if (captureMode === CaptureMode.AREA && selectionResult) {
          shellParams.x = selectionResult.x;
          shellParams.y = selectionResult.y;
          shellParams.width = selectionResult.width;
          shellParams.height = selectionResult.height;
        }

        pixbuf = await captureWithShell(includePointer, shellParams);

        if (pixbuf) {
          print(`Screenshot: Captured ${Object.keys(CaptureMode)[captureMode]} via Shell D-Bus`);
          // Skip pointer compositing since Shell handles it
          if (includePointer) {
            includePointer = false;
          }
        } else {
          print("Screenshot: Shell D-Bus capture failed, falling back to X11");
        }
      }

      if (!pixbuf) {
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
            break;
          case CaptureMode.WINDOW:
            if (selectionResult && selectionResult.clickX !== undefined) {
              pixbuf = captureWindowWithXShape(
                selectionResult.clickX,
                selectionResult.clickY,
                includePointer,
              );
              // Skip pointer compositing since C library handles it
              if (pixbuf && includePointer) {
                includePointer = false;
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
            }
            break;
        }
      }

      if (includePointer && captureMode !== CaptureMode.AREA) {
        pixbuf = compositePointer(pixbuf);
      }

      this.lastPixbuf = pixbuf;

      this.postScreenshot.setImage(pixbuf);
      this.stack.set_visible_child_name("post");
    }
  },
);

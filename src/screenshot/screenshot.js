import Gtk from "gi://Gtk?version=3.0";
import Gdk from "gi://Gdk?version=3.0";
import GObject from "gi://GObject";
import GLib from "gi://GLib";
import Gio from "gi://Gio";

import { settings } from "../window.js";
import { selectArea, selectWindow } from "./area-selection.js";
import { compositePointer, getDestinationPath } from "./utils.js";
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

    onTakeScreenshot({ captureMode, delay, includePointer, folder, filename }) {
      print("Screenshot: _onTakeScreenshot enter");

      const app = Gio.Application.get_default();
      if (app) {
        print(`Screenshot: App found ${app}, holding`);
        app.hold();
      } else {
        print("Screenshot: WARNING - App not found via get_default()");
      }

      const topLevel = this.get_toplevel();

      if (topLevel && topLevel.hide) {
        print("Screenshot: Hiding window");
        topLevel.hide();
      }

      GLib.timeout_add(GLib.PRIORITY_DEFAULT, 300, () => {
        print(`Screenshot: Selection phase, mode=${captureMode}`);
        if (captureMode === CaptureMode.AREA) {
          selectArea((result) => {
            if (!result) {
              print("Screenshot: Area selection cancelled");
              this.preScreenshot.setStatus("Capture cancelled");
              this.finishScreenshot(app, topLevel);
            } else {
              this.startDelay(app, topLevel, result, {
                delay,
                captureMode,
                includePointer,
                folder,
                filename,
              });
            }
          });
          return GLib.SOURCE_REMOVE;
        }

        if (captureMode === CaptureMode.WINDOW) {
          selectWindow((result) => {
            if (!result) {
              print("Screenshot: Window selection cancelled");
              this.preScreenshot.setStatus("Capture cancelled");
              this.finishScreenshot(app, topLevel);
            } else {
              this.startDelay(app, topLevel, result, {
                delay,
                captureMode,
                includePointer,
                folder,
                filename,
              });
            }
          });
          return GLib.SOURCE_REMOVE;
        }

        this.startDelay(app, topLevel, null, {
          delay,
          captureMode,
          includePointer,
          folder,
          filename,
        });
        return GLib.SOURCE_REMOVE;
      });
    }

    startDelay(
      app,
      topLevel,
      selectionResult,
      { delay, captureMode, includePointer, folder, filename },
    ) {
      print(`Screenshot: Delay phase, delay=${delay}`);
      this.preScreenshot.setStatus(`Capturing in ${delay}s...`);

      if (delay > 0) {
        let remaining = delay;
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
          remaining--;
          this.preScreenshot.setStatus(`Capturing in ${remaining}s...`);
          print(`Screenshot: Waiting... ${remaining}`);
          if (remaining <= 0) {
            this.performCapture(app, topLevel, selectionResult, {
              captureMode,
              includePointer,
              folder,
              filename,
            });
            return GLib.SOURCE_REMOVE;
          }
          return GLib.SOURCE_CONTINUE;
        });
        return;
      }
      this.performCapture(app, topLevel, selectionResult, {
        captureMode,
        includePointer,
        folder,
        filename,
      });
    }

    performCapture(
      app,
      topLevel,
      selectionResult,
      { captureMode, includePointer, folder, filename },
    ) {
      print("Screenshot: Capturing...");
      this.preScreenshot.setStatus("Capturing...");
      let pixbuf = null;

      try {
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
            if (selectionResult && selectionResult.window) {
              pixbuf = Gdk.pixbuf_get_from_window(
                selectionResult.window,
                0,
                0,
                selectionResult.width,
                selectionResult.height,
              );
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
          default:
            this.preScreenshot.setStatus("Capture cancelled or failed");
            break;
        }

        if (includePointer && captureMode !== CaptureMode.AREA) {
          pixbuf = compositePointer(pixbuf);
        }

        this.lastPixbuf = pixbuf;

        const filepath = getDestinationPath({ folder, filename });
        if (filepath) {
          pixbuf.savev(filepath, "png", [], []);
          this.preScreenshot.setStatus(`Saved: ${filepath}`);
          if (folder) {
            settings.set_string("screenshot-last-save-directory", folder);
          }
        }

        this.postScreenshot.setImage(pixbuf);
        this.stack.set_visible_child_name("post");
      } catch (e) {
        print(`Screenshot error: ${e.message}`);
        this.preScreenshot.setStatus(`Error: ${e.message}`);
      }

      this.finishScreenshot(app, topLevel);
    }

    finishScreenshot(app, topLevel) {
      print("Screenshot: Restoring window");
      if (topLevel && topLevel.show) {
        topLevel.show();
        topLevel.present();
      }
      if (app) app.release();
    }
  },
);

import Gtk from "gi://Gtk?version=3.0";
import GLib from "gi://GLib";
import Gio from "gi://Gio";
import GObject from "gi://GObject";
import { CaptureMode, CaptureBackend } from "./constants.js";
import { selectArea } from "./popupWindows/area-selection.js";
import { selectWindow } from "./popupWindows/selectWindow.js";
import { settings, wait } from "./utils.js";
import { performCapture } from "./performCapture.js";

export const PreScreenshot = GObject.registerClass(
  class PreScreenshot extends Gtk.Box {
    _init({ setUpPostScreenshot }) {
      super._init({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 16,
        valign: Gtk.Align.CENTER,
        halign: Gtk.Align.CENTER,
        margin_start: 20,
        margin_end: 20,
        margin_bottom: 20,
        margin_top: 20,
      });

      this.setUpPostScreenshot = setUpPostScreenshot;
      this.captureMode = CaptureMode.SCREEN;

      this.buildUI();
      this.setUpValues();
      this.syncValues();
    }

    buildUI() {
      const modeFrame = new Gtk.Frame({ label: "Capture Mode" });
      const modeBox = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        spacing: 12,
        margin_top: 8,
        margin_bottom: 8,
        margin_start: 12,
        margin_end: 12,
        halign: Gtk.Align.CENTER,
      });

      this.screenRadio = new Gtk.RadioButton({ label: "Screen" });
      this.windowRadio = new Gtk.RadioButton({
        label: "Window",
        group: this.screenRadio,
      });
      this.areaRadio = new Gtk.RadioButton({
        label: "Area",
        group: this.screenRadio,
      });

      modeBox.pack_start(this.screenRadio, false, false, 0);
      modeBox.pack_start(this.windowRadio, false, false, 0);
      modeBox.pack_start(this.areaRadio, false, false, 0);
      modeFrame.add(modeBox);
      this.add(modeFrame);

      const optionsFrame = new Gtk.Frame({ label: "Options" });
      const optionsGrid = new Gtk.Grid({
        row_spacing: 8,
        column_spacing: 12,
        margin_top: 8,
        margin_bottom: 8,
        margin_start: 12,
        margin_end: 12,
      });

      const delayLabel = new Gtk.Label({
        label: "Delay (seconds):",
        halign: Gtk.Align.START,
      });
      this.delaySpinner = new Gtk.SpinButton({
        adjustment: new Gtk.Adjustment({
          lower: 0,
          upper: 60 * 60 * 24,
          step_increment: 1,
        }),
      });

      const pointerLabel = new Gtk.Label({
        label: "Include pointer:",
        halign: Gtk.Align.START,
      });
      this.pointerSwitch = new Gtk.Switch({
        active: settings.get_boolean("include-pointer"),
        halign: Gtk.Align.START,
      });

      optionsGrid.attach(delayLabel, 0, 0, 1, 1);
      optionsGrid.attach(this.delaySpinner, 1, 0, 1, 1);
      optionsGrid.attach(pointerLabel, 0, 1, 1, 1);
      optionsGrid.attach(this.pointerSwitch, 1, 1, 1, 1);
      optionsFrame.add(optionsGrid);
      this.add(optionsFrame);

      const buttonBox = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        spacing: 12,
        halign: Gtk.Align.CENTER,
        margin_top: 8,
      });

      //this.cancelBtn = new Gtk.Button({ label: "Cancel" });

      //buttonBox.pack_start(this.cancelBtn, false, false, 0);

      this.shootBtn = new Gtk.Button({ label: "Take Screenshot" });
      this.shootBtn
        .get_style_context()
        .add_class(Gtk.STYLE_CLASS_SUGGESTED_ACTION);

      buttonBox.pack_start(this.shootBtn, false, false, 0);

      this.add(buttonBox);

      this.statusLabel = new Gtk.Label({
        halign: Gtk.Align.CENTER,
        margin_top: 8,
      });
      this.add(this.statusLabel);

      this.shootBtn.connect("clicked", () => {
        
        const captureBackendValue = settings.get_string("capture-backend")
        
        const isWindowHideNedeed = captureBackendValue !== CaptureBackend.X11 && this.captureMode === CaptureMode.WINDOW;
        
        this.onTakeScreenshot(
          this.captureMode,
          this.delaySpinner.get_value_as_int(),
          this.pointerSwitch.get_active(),
          settings.get_boolean("hide-window") || isWindowHideNedeed,
          captureBackendValue,
        );

        this.shootBtn.set_sensitive(false);
      });
    }

    setStatus(text) {
      this.statusLabel.set_text(text);
    }

    syncValues() {
      this.delaySpinner.connect("value-changed", () => {
        if (settings.get_boolean("last-screenshot-delay")) {
          settings.set_int("screenshot-delay", this.delaySpinner.get_value_as_int());
        }
      });
      this.pointerSwitch.connect("notify::active", () => {
        if (settings.get_boolean("last-include-pointer")) {
          settings.set_boolean("include-pointer", this.pointerSwitch.get_active());
        }
      });

      this.screenRadio.connect("toggled", () => {
        if (this.screenRadio.get_active()) this.captureMode = CaptureMode.SCREEN;
        if (settings.get_boolean("last-screenshot-mode")) {
          settings.set_string("screenshot-mode", CaptureMode.SCREEN);
        }
      });
      this.windowRadio.connect("toggled", () => {
        if (this.windowRadio.get_active()) this.captureMode = CaptureMode.WINDOW;
        if (settings.get_boolean("last-screenshot-mode")) {
          settings.set_string("screenshot-mode", CaptureMode.WINDOW);
        }
      });
      this.areaRadio.connect("toggled", () => {
        if (this.areaRadio.get_active()) this.captureMode = CaptureMode.AREA;
        if (settings.get_boolean("last-screenshot-mode")) {
          settings.set_string("screenshot-mode", CaptureMode.AREA);
        }
      });
    }

    setUpValues() {
      this.setStatus("Ready");
      this.pointerSwitch.set_active(settings.get_boolean("include-pointer"));
      this.delaySpinner.set_value(settings.get_int("screenshot-delay"));
      this.captureMode = settings.get_string("screenshot-mode")
    }

    async onTakeScreenshot( captureMode, delay, includePointer , isHideWindow, captureBackendValue) {
      
      console.log(captureBackendValue, CaptureBackend.X11)
      
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
          isHideWindow && topLevel.hide();
          await wait(windowWait * 10);
        }

        let selectionResult = null;
        print(`Screenshot: Selection phase, mode=${captureMode}`);

        if (captureMode === CaptureMode.AREA) {
          selectionResult = await selectArea();
          if (!selectionResult) {
            print("Screenshot: Area selection cancelled");
            this.setStatus("Capture cancelled");
            return;
          }
        } else if (captureMode === CaptureMode.WINDOW) {
          if (captureBackendValue === CaptureBackend.X11) {
            selectionResult = await selectWindow();
            if (!selectionResult) {
              print("Screenshot: Window selection cancelled");
              this.setStatus("Capture cancelled");
              return;
            }
          } else {
            // Shell backend takes the active window automatically
            selectionResult = { clickX: 0, clickY: 0 }; // Just to trigger the logic
          }
        }

        if (windowWait < delay * 100) {
          await this.startDelay(delay * 100 - windowWait, windowWait);
          isHideWindow && topLevel.hide();
          await wait(windowWait * 10);
        }

        const pixbuf = await performCapture(selectionResult, captureBackendValue, {
          captureMode,
          includePointer,
        });

        this.completeScreenShot(pixbuf);
      } catch (e) {
        print(`Screenshot error during flow: ${e.message}`);
        this.setStatus(`Error: ${e.message}`);
      } finally {
        if (isHideWindow) {
          topLevel.show();
          topLevel.present();
          if (app) app.release()
        };
        this.shootBtn.set_sensitive(true);
      }
    }

    async startDelay(delay, windowWait) {
      print(`Waiting... ${(delay + windowWait) / 100}s`);
      this.setStatus(`Capturing in ${(delay + windowWait) / 100}s...`);

      if (delay <= 0) return;

      let remaining = delay;
      return new Promise((resolve) => {
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 10, () => {
          remaining--;
          if ((remaining + windowWait) % 100 === 0) {
            this.setStatus(`Capturing in ${(remaining + windowWait) / 100}s...`);
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

    completeScreenShot(pixbuf) {
      this.setUpPostScreenshot(pixbuf);
      this.setUpValues();
    }

  },
);

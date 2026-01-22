import Gtk from "gi://Gtk?version=3.0";
import GLib from "gi://GLib";
import Gio from "gi://Gio";
import GObject from "gi://GObject";
import { CaptureMode, CaptureBackend, SOURCE_PATH } from "../constants.js";
import { selectArea } from "../popupWindows/area-selection.js";
import { settings, wait, showScreenshotNotification } from "../utils.js";
import { performCapture } from "../performCapture.js";
import { flashRect } from "../popupWindows/flash.js";

export const PreScreenshot = GObject.registerClass(
  class PreScreenshot extends Gtk.Box {
    _init({ setUpPostScreenshot }) {
      super._init({
        orientation: Gtk.Orientation.VERTICAL,
        valign: Gtk.Align.CENTER,
        halign: Gtk.Align.CENTER,
      });

      this.setUpPostScreenshot = setUpPostScreenshot;

      this.buildUI();
      this.setUpValues();
      this.backendListener();
    }

    buildUI() {
      const builder = new Gtk.Builder();
      builder.add_from_resource(SOURCE_PATH + "/screenshot/prescreenshot/prescreenshot.ui");

      const mainBox = builder.get_object("main");
      this.add(mainBox);

      this.screenRadio = builder.get_object("screen");
      this.windowRadio = builder.get_object("window");
      this.areaRadio = builder.get_object("area");

      this.screenRadio.connect("toggled", () => {
        if (this.screenRadio.get_active()) this.captureMode = CaptureMode.SCREEN;
      });
      this.windowRadio.connect("toggled", () => {
        if (this.windowRadio.get_active()) this.captureMode = CaptureMode.WINDOW;
      });
      this.areaRadio.connect("toggled", () => {
        if (this.areaRadio.get_active()) this.captureMode = CaptureMode.AREA;
      });

      this.delaySpinner = builder.get_object("delaySpinner");
      
      this.pointerSwitch = builder.get_object("pointerSwitch");
      this.pointerRow = builder.get_object("pointerRow");
      
      this.shootBtn = builder.get_object("shootBtn");
      this.statusLabel = builder.get_object("statusLabel");

      // Set adjustment for the spin button as it might be missing in UI
      this.delaySpinner.set_adjustment(new Gtk.Adjustment({
        lower: 0,
        upper: 60 * 60 * 24,
        step_increment: 1,
        page_increment: 10,
        value: 0
      }));

      this.shootBtn.connect("clicked", () => this.onTakeScreenshot());
    }

    async onTakeScreenshot() {
      this.shootBtn.set_sensitive(false);

      const delay = this.delaySpinner.get_value_as_int()
      const includePointer = this.pointerSwitch.get_active();
      const captureBackendValue = this.captureBackendValue;
      const isHideWindow = settings.get_boolean("hide-window");
      const topLevel = this.get_toplevel();
      const captureMode = this.captureMode;

      try {
        const windowWait = settings.get_int("window-wait");

        if (delay * 1000 > windowWait) await this.startDelay(delay * 1000 - windowWait, windowWait);

        if (isHideWindow) {
          topLevel.hide();
          await wait(windowWait); // Wait for window to hide
        }

        if (delay * 1000 > windowWait) await wait(windowWait); // Wait for window to hide

        let selectionResult = { clickX: 0, clickY: 0 };
        print(`Selection phase, mode=${captureMode}`);


        let pixbuf;
        if (captureMode === CaptureMode.AREA) {
          const screenPixbuf = await performCapture(captureBackendValue, { captureMode, includePointer, topLevel });

          if (!screenPixbuf) {
            throw new Error("Area capture failed");
          }

          selectionResult = await selectArea(screenPixbuf);
          if (!selectionResult) {
            return this.setStatus("Capture cancelled");
          }

          console.log(selectionResult);
          console.log(screenPixbuf.get_width());
          console.log(screenPixbuf.get_height());

          pixbuf = screenPixbuf.new_subpixbuf(
            Math.max(0, selectionResult.x), // These two
            Math.max(0, selectionResult.y), // Actually fix a bug
            Math.min(screenPixbuf.get_width(), selectionResult.width),  // These two
            Math.min(screenPixbuf.get_height(), selectionResult.height) // Are currently a sanity check
          );

          flashRect(selectionResult.x, selectionResult.y, selectionResult.width, selectionResult.height);
        } else {
          pixbuf = await performCapture(captureBackendValue, { captureMode, includePointer, topLevel });
        }

        if (!pixbuf) {
          return this.setStatus("Capture cancelled");
        }

        const app = Gio.Application.get_default();
        showScreenshotNotification(app);
        this.transitionToPostScreenshot(pixbuf);
      } catch (e) {
        print(`${e.message}`);
        this.setStatus(`${e.message}`);
      } finally {
        if (!topLevel.get_visible()) { // Don't depend on isHideWindow. Some screen capture methods hide the window automatically.
          topLevel.show();
          topLevel.present();
        };
        this.shootBtn.set_sensitive(true);
      }
    }

    async startDelay(timerMs, windowWaitMs) {
      const timer = timerMs/10
      const windowWait = windowWaitMs/10
      const getRemainingSeconds = ()=> ((timer + windowWait) - ((timer + windowWait) % 100))/100
      
      print(`Waiting... ${(timer + windowWait) / 100}s`);
      this.setStatus(`Capturing in ${getRemainingSeconds()}s...`);

      if (timer <= 0) return;

      let remaining = timer;
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

    setStatus(text) {
      this.statusLabel.set_text(text);
    }
    
    vfunc_map() {
      super.vfunc_map();
      this.setBackend(settings.get_string("capture-backend-auto"));
    }
    
    setUpValues (){
      this.pointerSwitch.set_active(settings.get_boolean("include-pointer"));
      this.delaySpinner.set_value(settings.get_int("screenshot-delay"));
      this.setCaptureMode(settings.get_string("screenshot-mode"));
      this.setStatus("Ready");
    }

    transitionToPostScreenshot(pixbuf) {
      if (settings.get_boolean("last-screenshot-delay")) {
        settings.set_int("screenshot-delay", this.delaySpinner.get_value_as_int());
      }
      if (settings.get_boolean("last-include-pointer")) {
        settings.set_boolean("include-pointer", this.pointerSwitch.get_active());
      }
      if (settings.get_boolean("last-screenshot-mode")) {
        settings.set_string("screenshot-mode", this.captureMode);
      }
      
      this.setUpPostScreenshot(pixbuf);
      this.setUpValues();
    }
    
    setBackend(backend) {
      this.captureBackendValue = backend;
      if (backend === CaptureBackend.GRIM || backend === CaptureBackend.PORTAL) {
        this.windowRadio.hide();
        if (this.captureMode === CaptureMode.WINDOW) {
          const settingValue = settings.get_string("screenshot-mode")
          this.setCaptureMode(settingValue === CaptureMode.WINDOW ? CaptureMode.SCREEN : settingValue);
        }
      } else {
        this.windowRadio.show();
      }
      
      if (backend === CaptureBackend.PORTAL) {
        this.pointerRow.hide();
        // One thing to consider here is that we don't change the pointer switch value.
        // Benefit: If the user changes to a backend that supports pointer capture, 
        // The switch value will remain unchanged.
        // Not so clean part: We still send the switch value. So the Portal backend
        // mustn't throw an error when the switch value is true and it should simply ignore it.
      } else {
        this.pointerRow.show();
      }
    }
    
    setCaptureMode(mode) {
      this.captureMode = mode;
      switch (this.captureMode) {
        case CaptureMode.SCREEN:
          this.screenRadio.set_active(true);
          break;
        case CaptureMode.WINDOW:
          this.windowRadio.set_active(true);
          break;
        case CaptureMode.AREA:
          this.areaRadio.set_active(true);
          break;
      }
    }

    backendListener() {
      this._captureBackendChangedId = settings.connect(
        "changed::capture-backend-auto",
        () => {
          this.setBackend(settings.get_string("capture-backend-auto"));
        }
      );
    }

  },
);

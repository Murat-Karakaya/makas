import Gtk from "gi://Gtk?version=3.0";
import GObject from "gi://GObject";
import { getCurrentDate, settings } from "./utils.js";
import { CaptureMode } from "./constants.js";

export const PreScreenshot = GObject.registerClass(
  class PreScreenshot extends Gtk.Box {
    _init(callbacks) {
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

      this.callbacks = callbacks;
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
        value: settings.get_int("screenshot-delay"),
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

      this.shootBtn = new Gtk.Button({ label: "Take Screenshot" });
      this.shootBtn
        .get_style_context()
        .add_class(Gtk.STYLE_CLASS_SUGGESTED_ACTION);

      buttonBox.pack_start(this.shootBtn, false, false, 0);
      this.add(buttonBox);

      this.statusLabel = new Gtk.Label({
        label: "Ready",
        halign: Gtk.Align.CENTER,
        margin_top: 8,
      });
      this.add(this.statusLabel);

      this.shootBtn.connect("clicked", () =>
        this.callbacks.onTakeScreenshot({
          captureMode: this.captureMode,
          delay: this.delaySpinner.get_value_as_int(),
          includePointer: this.pointerSwitch.get_active(),
        }),
      );
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
          settings.set_int("screenshot-mode", CaptureMode.SCREEN);
        }
      });
      this.windowRadio.connect("toggled", () => {
        if (this.windowRadio.get_active()) this.captureMode = CaptureMode.WINDOW;
        if (settings.get_boolean("last-screenshot-mode")) {
          settings.set_int("screenshot-mode", CaptureMode.WINDOW);
        }
      });
      this.areaRadio.connect("toggled", () => {
        if (this.areaRadio.get_active()) this.captureMode = CaptureMode.AREA;
        if (settings.get_boolean("last-screenshot-mode")) {
          settings.set_int("screenshot-mode", CaptureMode.AREA);
        }
      });
    }

    setUpValues() {
      this.pointerSwitch.set_active(settings.get_boolean("include-pointer"));

      switch (settings.get_int("screenshot-mode")) {
        case CaptureMode.WINDOW:
          this.windowRadio.set_active(true);
          this.captureMode = CaptureMode.WINDOW;
          break;
        case CaptureMode.AREA:
          this.areaRadio.set_active(true);
          this.captureMode = CaptureMode.AREA;
          break;
        default:
          this.screenRadio.set_active(true);
          this.captureMode = CaptureMode.SCREEN;
          break;
      }
    }
  },
);

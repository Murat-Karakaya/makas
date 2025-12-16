import Gtk from "gi://Gtk?version=3.0";
import GObject from "gi://GObject";
import { settings } from "../window.js";
import { getCurrentDate } from "./utils.js";

// Capture mode enumeration
const CaptureMode = {
  SCREEN: 0,
  WINDOW: 1,
  AREA: 2,
};

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

      const screenRadio = new Gtk.RadioButton({ label: "Screen" });
      const windowRadio = new Gtk.RadioButton({
        label: "Window",
        group: screenRadio,
      });
      const areaRadio = new Gtk.RadioButton({
        label: "Area",
        group: screenRadio,
      });

      modeBox.pack_start(screenRadio, false, false, 0);
      modeBox.pack_start(windowRadio, false, false, 0);
      modeBox.pack_start(areaRadio, false, false, 0);
      modeFrame.add(modeBox);
      this.add(modeFrame);

      screenRadio.connect("toggled", () => {
        if (screenRadio.get_active()) this.captureMode = CaptureMode.SCREEN;
      });
      windowRadio.connect("toggled", () => {
        if (windowRadio.get_active()) this.captureMode = CaptureMode.WINDOW;
      });
      areaRadio.connect("toggled", () => {
        if (areaRadio.get_active()) this.captureMode = CaptureMode.AREA;
      });

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
      this._delaySpinner = new Gtk.SpinButton({
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
      this._pointerSwitch = new Gtk.Switch({
        active: settings.get_boolean("include-pointer"),
        halign: Gtk.Align.START,
      });

      optionsGrid.attach(delayLabel, 0, 0, 1, 1);
      optionsGrid.attach(this._delaySpinner, 1, 0, 1, 1);
      optionsGrid.attach(pointerLabel, 0, 1, 1, 1);
      optionsGrid.attach(this._pointerSwitch, 1, 1, 1, 1);
      optionsFrame.add(optionsGrid);
      this.add(optionsFrame);

      // === File Section ===
      const fileFrame = new Gtk.Frame({ label: "Save Location" });
      const fileGrid = new Gtk.Grid({
        row_spacing: 8,
        column_spacing: 12,
        margin_top: 8,
        margin_bottom: 8,
        margin_start: 12,
        margin_end: 12,
      });

      const folderLabel = new Gtk.Label({
        label: "Folder:",
        halign: Gtk.Align.START,
      });
      this.folderBtn = new Gtk.FileChooserButton({
        title: "Select Folder",
        action: Gtk.FileChooserAction.SELECT_FOLDER,
        width_chars: 30,
      });
      this.folderBtn.set_current_folder(
        settings.get_string("default-screenshot-folder"),
      );

      const nameLabel = new Gtk.Label({
        label: "Filename:",
        halign: Gtk.Align.START,
      });
      this.filenameEntry = new Gtk.Entry({
        text: `Screenshot-${getCurrentDate()}.png`,
        placeholder_text: "screenshot.png",
        width_chars: 30,
      });

      fileGrid.attach(folderLabel, 0, 0, 1, 1);
      fileGrid.attach(this.folderBtn, 1, 0, 1, 1);
      fileGrid.attach(nameLabel, 0, 1, 1, 1);
      fileGrid.attach(this.filenameEntry, 1, 1, 1, 1);
      fileFrame.add(fileGrid);
      this.add(fileFrame);

      // === Action Buttons ===
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
          delay: this._delaySpinner.get_value_as_int(),
          includePointer: this._pointerSwitch.get_active(),
          folder: this.folderBtn.get_filename(),
          filename: this.filenameEntry.get_text(),
        }),
      );
    }

    setStatus(text) {
      this.statusLabel.set_text(text);
    }

    updateFilename() {
      this.filenameEntry.set_text(`Screenshot-${getCurrentDate()}.png`);
    }
  },
);

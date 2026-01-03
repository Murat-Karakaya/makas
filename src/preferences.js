import Gtk from "gi://Gtk?version=3.0";
import GObject from "gi://GObject";
import Gio from "gi://Gio";

import { hasShellScreenshot, settings } from "./screenshot/utils.js";

export const PreferencesWindow = GObject.registerClass(
  {
    GTypeName: "PreferencesWindow",
  },
  class PreferencesWindow extends Gtk.Dialog {
    constructor(parent) {
      super({
        title: "Preferences",
        transient_for: parent,
        modal: true,
        default_width: 450,
        default_height: 400,
      });

      this.add_button("Close", Gtk.ResponseType.CLOSE);
      this.connect("response", () => this.destroy());

      const contentArea = this.get_content_area();
      contentArea.set_spacing(12);
      contentArea.set_margin_top(12);
      contentArea.set_margin_bottom(12);
      contentArea.set_margin_start(12);
      contentArea.set_margin_end(12);

      const grid = new Gtk.Grid({
        row_spacing: 12,
        column_spacing: 12,
        column_homogeneous: false,
      });
      contentArea.add(grid);

      let row = 0;

      this.screenshotLabel = new Gtk.Label({
        label: "Default Screenshot Folder:",
        halign: Gtk.Align.START,
      });
      this.screenshotPathLabel = new Gtk.Label({
        label: settings.get_string("screenshot-save-folder"),
        hexpand: true,
        halign: Gtk.Align.START,
      });
      this.screenshotFolderButton = new Gtk.Button({ label: "Browse" });

      grid.attach(this.screenshotLabel, 0, row, 1, 1);
      grid.attach(this.screenshotPathLabel, 1, row, 1, 1);
      grid.attach(this.screenshotFolderButton, 2, row, 1, 1);
      row++;

      this.screenshotFolderButton.connect("clicked", () =>
        this.onOpenFolderSelector("screenshot-save-folder"),
      );

      this.lastFolderCheck = new Gtk.CheckButton({
        label: "Remember last used folder",
        halign: Gtk.Align.START,
      });

      grid.attach(this.lastFolderCheck, 2, row, 1, 1);
      row++;

      // Separator
      grid.attach(new Gtk.Separator({ orientation: Gtk.Orientation.HORIZONTAL }), 0, row, 3, 1);
      row++;

      this.delayLabel = new Gtk.Label({
        label: "Default Delay (seconds):",
        halign: Gtk.Align.START,
      });
      this.delaySpinner = new Gtk.SpinButton({
        adjustment: new Gtk.Adjustment({
          lower: 0,
          upper: 3600,
          step_increment: 1,
        }),
      });

      grid.attach(this.delayLabel, 0, row, 1, 1);
      grid.attach(this.delaySpinner, 1, row, 2, 1);
      row++;

      this.lastDelayCheck = new Gtk.CheckButton({
        label: "Remember last used delay",
        halign: Gtk.Align.START,
      });

      grid.attach(this.lastDelayCheck, 2, row, 1, 1);
      row++;

      // Separator
      grid.attach(new Gtk.Separator({ orientation: Gtk.Orientation.HORIZONTAL }), 0, row, 3, 1);
      row++;

      this.pointerLabel = new Gtk.Label({
        label: "Include Pointer:",
        halign: Gtk.Align.START,
      });
      this.pointerSwitch = new Gtk.Switch({
        halign: Gtk.Align.START,
      });

      grid.attach(this.pointerLabel, 0, row, 1, 1);
      grid.attach(this.pointerSwitch, 1, row, 2, 1);
      row++;

      this.lastPointerCheck = new Gtk.CheckButton({
        label: "Remember last pointer option",
        halign: Gtk.Align.START,
      });

      grid.attach(this.lastPointerCheck, 2, row, 1, 1);
      row++;

      // Separator
      grid.attach(new Gtk.Separator({ orientation: Gtk.Orientation.HORIZONTAL }), 0, row, 3, 1);
      row++;

      // --- Screenshot Mode ---
      this.modeLabel = new Gtk.Label({
        label: "Default Mode:",
        halign: Gtk.Align.START,
      });
      this.modeCombo = new Gtk.ComboBoxText();
      this.modeCombo.append_text("Screen");
      this.modeCombo.append_text("Window");
      this.modeCombo.append_text("Area");

      grid.attach(this.modeLabel, 0, row, 1, 1);
      grid.attach(this.modeCombo, 1, row, 2, 1);
      row++;

      this.lastModeCheck = new Gtk.CheckButton({
        label: "Remember last used mode",
        halign: Gtk.Align.START,
      });

      grid.attach(this.lastModeCheck, 2, row, 1, 1);
      row++;

      grid.attach(new Gtk.Separator({ orientation: Gtk.Orientation.HORIZONTAL }), 0, row, 3, 1);
      row++;

      this.waitLabel = new Gtk.Label({
        label: "Window Transition Wait (deciseconds):",
        halign: Gtk.Align.START,
      });
      this.waitSpinner = new Gtk.SpinButton({
        adjustment: new Gtk.Adjustment({
          lower: 0,
          upper: 500,
          step_increment: 20,
        }),
      });

      grid.attach(this.waitLabel, 0, row, 1, 1);
      grid.attach(this.waitSpinner, 1, row, 2, 1);
      row++;

      grid.attach(new Gtk.Separator({ orientation: Gtk.Orientation.HORIZONTAL }), 0, row, 3, 1);
      row++;

      this.backendLabel = new Gtk.Label({
        label: "Capture Backend:",
        halign: Gtk.Align.START,
      });
      this.backendCombo = new Gtk.ComboBoxText();
      this.backendCombo.append_text("Shell (Wayland/X11)");
      this.backendCombo.append_text("X11 (Legacy)");
      this.backendCombo.append_text("Wayland (Grim)");

      grid.attach(this.backendLabel, 0, row, 1, 1);
      grid.attach(this.backendCombo, 1, row, 2, 1);
      row++;


      this.connect("destroy", () => {
        if (this._settingsSignalId) settings.disconnect(this._settingsSignalId);
      });

      this.syncValues();
    }

    onOpenFolderSelector(key) {
      // Store reference to prevent garbage collection
      this.fileChooser = new Gtk.FileChooserNative({
        title: "Select a Folder",
        transient_for: this,
        action: Gtk.FileChooserAction.SELECT_FOLDER,
        accept_label: "Select",
        cancel_label: "Cancel",
        modal: true,
      });

      this.fileChooser.connect("response", (dialog, response) => {
        if (response === Gtk.ResponseType.ACCEPT) {
          const folderPath = dialog.get_filename();
          if (folderPath) {
            this.screenshotPathLabel.set_text(folderPath);
            settings.set_string(key, folderPath);
            print(`${key} set to: ${folderPath}`);
          }
        } else {
          print("File selection cancelled.");
        }

        this.fileChooser.destroy();
      });

      this.fileChooser.show();
    }

    syncValues() {
      settings.bind("last-screenshot-delay", this.lastDelayCheck, "active", Gio.SettingsBindFlags.DEFAULT);
      settings.bind("screenshot-delay", this.delaySpinner, "value", Gio.SettingsBindFlags.DEFAULT);

      settings.bind("last-screenshot-mode", this.lastModeCheck, "active", Gio.SettingsBindFlags.DEFAULT);
      settings.bind("screenshot-mode", this.modeCombo, "active", Gio.SettingsBindFlags.DEFAULT);

      settings.bind("last-include-pointer", this.lastPointerCheck, "active", Gio.SettingsBindFlags.DEFAULT);
      settings.bind("include-pointer", this.pointerSwitch, "active", Gio.SettingsBindFlags.DEFAULT);

      settings.bind("window-wait", this.waitSpinner, "value", Gio.SettingsBindFlags.DEFAULT);

      const shellAvailable = hasShellScreenshot();

      if (!shellAvailable) {
        // This kind of hoop is made to prevent the combo box from being
        // sensitive otherwise it will remain sensitive for some reason.
        this.backendCombo.connect('realize', () => {
          this.backendCombo.set_sensitive(false);
        });
        this.backendCombo.set_tooltip_text("GNOME Shell screenshot service not found. X11 backend is mandatory.");
      }
      settings.bind("capture-backend", this.backendCombo, "active", Gio.SettingsBindFlags.DEFAULT);

      settings.bind("last-screenshot-save-folder", this.lastFolderCheck, "active", Gio.SettingsBindFlags.DEFAULT);
    }
  },
);



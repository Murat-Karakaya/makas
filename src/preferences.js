import Gtk from "gi://Gtk?version=3.0";
import GObject from "gi://GObject";
import Gio from "gi://Gio";

import { CaptureBackend, CaptureMode } from "./screenshot/constants.js"
import {
  hasShellScreenshot,
  hasGrimScreenshot,
  hasX11Screenshot,
  availableBackends,
  settings
} from "./screenshot/utils.js";

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

      const screenshotLabel = new Gtk.Label({
        label: "Default Screenshot Folder:",
        halign: Gtk.Align.START,
      });
      this.screenshotPathLabel = new Gtk.Label({
        label: settings.get_string("screenshot-save-folder"),
        hexpand: true,
        halign: Gtk.Align.START,
      });
      this.screenshotFolderButton = new Gtk.Button({ label: "Browse" });

      grid.attach(screenshotLabel, 0, row, 1, 1);
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

      const delayLabel = new Gtk.Label({
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

      grid.attach(delayLabel, 0, row, 1, 1);
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

      const pointerLabel = new Gtk.Label({
        label: "Include Pointer:",
        halign: Gtk.Align.START,
      });
      this.pointerSwitch = new Gtk.Switch({
        halign: Gtk.Align.START,
      });

      grid.attach(pointerLabel, 0, row, 1, 1);
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
      const modeLabel = new Gtk.Label({
        label: "Default Mode:",
        halign: Gtk.Align.START,
      });
      this.modeCombo = new Gtk.ComboBoxText();
      this.modeCombo.append(CaptureMode.SCREEN, "Screen");
      this.modeCombo.append(CaptureMode.WINDOW, "Window");
      this.modeCombo.append(CaptureMode.AREA, "Area");

      grid.attach(modeLabel, 0, row, 1, 1);
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

      const waitLabel = new Gtk.Label({
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

      grid.attach(waitLabel, 0, row, 1, 1);
      grid.attach(this.waitSpinner, 1, row, 2, 1);
      row++;

      grid.attach(new Gtk.Separator({ orientation: Gtk.Orientation.HORIZONTAL }), 0, row, 3, 1);
      row++;

      const backendLabel = new Gtk.Label({
        label: "Capture Backend:",
        halign: Gtk.Align.START,
      });

      this.backendStore = new Gtk.ListStore();
      this.backendStore.set_column_types([
        GObject.TYPE_STRING,  // ID
        GObject.TYPE_STRING,  // Label
        GObject.TYPE_BOOLEAN  // Sensitive
      ]);

      this.backendCombo = new Gtk.ComboBox({
        model: this.backendStore,
        id_column: 0,
      });

      const renderer = new Gtk.CellRendererText();
      this.backendCombo.pack_start(renderer, true);
      this.backendCombo.add_attribute(renderer, "text", 1);
      this.backendCombo.add_attribute(renderer, "sensitive", 2);

      const backendData = [
        [CaptureBackend.SHELL, "Shell (GNOME/Cinnamon)", hasShellScreenshot()],
        [CaptureBackend.X11, "X11", hasX11Screenshot()],
        [CaptureBackend.GRIM, "Wayland (Grim)", hasGrimScreenshot()],
      ];

      for (const [id, label, available] of backendData) {
        const iter = this.backendStore.insert(-1);
        this.backendStore.set(iter, [0, 1, 2], [id, label, available]);

        if (available && this.backendCombo.get_active() === -1) {
          this.backendCombo.set_active_iter(iter);
        }
      }

      grid.attach(backendLabel, 0, row, 1, 1);
      grid.attach(this.backendCombo, 1, row, 2, 1);
      row++;

      this.isHideWindow = new Gtk.Switch({
        halign: Gtk.Align.START,
      });

      const isHideWindowLabel = new Gtk.Label({
        label: "Hide window at capture:",
        halign: Gtk.Align.START,
      });

      grid.attach(isHideWindowLabel, 0, row, 1, 1);
      grid.attach(this.isHideWindow, 1, row, 2, 1);
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
        }
        this.fileChooser.destroy();
      });

      this.fileChooser.show();
    }

    syncValues() {
      settings.bind("last-screenshot-delay", this.lastDelayCheck, "active", Gio.SettingsBindFlags.DEFAULT);
      settings.bind("screenshot-delay", this.delaySpinner, "value", Gio.SettingsBindFlags.DEFAULT);

      settings.bind("last-screenshot-mode", this.lastModeCheck, "active", Gio.SettingsBindFlags.DEFAULT);
      settings.bind("screenshot-mode", this.modeCombo, "active-id", Gio.SettingsBindFlags.DEFAULT);

      settings.bind("last-include-pointer", this.lastPointerCheck, "active", Gio.SettingsBindFlags.DEFAULT);
      settings.bind("include-pointer", this.pointerSwitch, "active", Gio.SettingsBindFlags.DEFAULT);

      settings.bind("window-wait", this.waitSpinner, "value", Gio.SettingsBindFlags.DEFAULT);

      settings.bind("hide-window", this.isHideWindow, "active", Gio.SettingsBindFlags.DEFAULT);

      settings.bind("capture-backend", this.backendCombo, "active-id", Gio.SettingsBindFlags.DEFAULT);

      settings.bind("last-screenshot-save-folder", this.lastFolderCheck, "active", Gio.SettingsBindFlags.DEFAULT);
    }
  },
);



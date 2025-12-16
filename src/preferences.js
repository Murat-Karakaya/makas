import Gtk from "gi://Gtk?version=3.0";
import GObject from "gi://GObject";
import Pango from "gi://Pango";

import { settings } from "./window.js";

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
        default_width: 400,
        default_height: 300,
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

      // Screenshot Folder Row
      const screenshotLabel = new Gtk.Label({
        label: "Screenshot Folder:",
        halign: Gtk.Align.START,
      });
      const screenshotPathLabel = new Gtk.Label({
        label: settings.get_string("default-screenshot-folder"),
        hexpand: true,
        halign: Gtk.Align.START,
        ellipsize: Pango.EllipsizeMode.MIDDLE,
      });
      const screenshotFolderButton = new Gtk.Button({ label: "Browse" });

      grid.attach(screenshotLabel, 0, 0, 1, 1);
      grid.attach(screenshotPathLabel, 1, 0, 1, 1);
      grid.attach(screenshotFolderButton, 2, 0, 1, 1);

      screenshotFolderButton.connect("clicked", () =>
        this._onOpenFolderSelector("default-screenshot-folder"),
      );

      // Screenshot Delay Row
      const delayLabel = new Gtk.Label({
        label: "Screenshot Delay:",
        halign: Gtk.Align.START,
      });
      const delaySpinner = new Gtk.SpinButton({
        adjustment: new Gtk.Adjustment({
          lower: 0,
          upper: 60 * 60 * 24,
          step_increment: 1,
        }),
        value: settings.get_int("screenshot-delay"),
      });
      delaySpinner.connect("value-changed", () => {
        settings.set_int("screenshot-delay", delaySpinner.get_value_as_int());
      });

      grid.attach(delayLabel, 0, 2, 1, 1);
      grid.attach(delaySpinner, 1, 2, 2, 1);

      // Include Pointer Row
      const pointerLabel = new Gtk.Label({
        label: "Include Mouse Pointer:",
        halign: Gtk.Align.START,
      });
      const pointerSwitch = new Gtk.Switch({
        active: settings.get_boolean("include-pointer"),
        halign: Gtk.Align.START,
      });
      pointerSwitch.connect("state-set", (widget, state) => {
        settings.set_boolean("include-pointer", state);
        return false;
      });

      grid.attach(pointerLabel, 0, 3, 1, 1);
      grid.attach(pointerSwitch, 1, 3, 2, 1);

      // Sync labels when settings change
      this._settingsSignalId = settings.connect("changed", (settings, key) => {
        switch (key) {
          case "default-screenshot-folder":
            screenshotPathLabel.set_text(settings.get_string(key));
            break;
          case "default-recorder-folder":
            recorderPathLabel.set_text(settings.get_string(key));
            break;
          case "screenshot-delay":
            delaySpinner.set_value(settings.get_int(key));
            break;
          case "include-pointer":
            pointerSwitch.set_active(settings.get_boolean(key));
            break;
        }
      });

      this.connect("destroy", () => {
        if (this._settingsSignalId) {
          settings.disconnect(this._settingsSignalId);
        }
      });
    }

    _onOpenFolderSelector(key) {
      // Store reference to prevent garbage collection
      this._fileChooser = new Gtk.FileChooserNative({
        title: "Select a Folder",
        transient_for: this,
        action: Gtk.FileChooserAction.SELECT_FOLDER,
        accept_label: "Select",
        cancel_label: "Cancel",
        modal: true,
      });

      this._fileChooser.connect("response", (dialog, response) => {
        if (response === Gtk.ResponseType.ACCEPT) {
          const folderPath = dialog.get_filename();
          if (folderPath) {
            settings.set_string(key, folderPath);
            console.log(`${key} set to: ${folderPath}`);
          }
        } else {
          console.log("File selection cancelled.");
        }

        // Clean up the reference
        this._fileChooser = null;
      });

      this._fileChooser.show();
    }
  },
);

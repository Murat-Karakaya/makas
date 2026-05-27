import Gtk from "gi://Gtk?version=3.0";
import GObject from "gi://GObject";
import Gio from "gi://Gio";

import { CaptureMode, SOURCE_PATH } from "./screenshot/constants.js";
import {
  backends,
  settings,
  getBackupFolder,
} from "./screenshot/utils.js";

export class PreferencesWindow {
  constructor(parent) {
    const builder = new Gtk.Builder();
    builder.add_from_resource(SOURCE_PATH + "/preferneces.ui");

    const dialog = builder.get_object("preferences-dialog");
    dialog.set_transient_for(parent);
    dialog.set_modal(true);

    // Get widgets
    const closeBtn = builder.get_object("close-btn");
    const fileChooser = builder.get_object("file-chooser");
    const folderCheckbox = builder.get_object("folder-checkbox");
    const modeCombo = builder.get_object("mode-combo");
    const modeCheckbox = builder.get_object("mode-checkbox");
    const delaySpinner = builder.get_object("delay-spinner");
    const delayCheckbox = builder.get_object("delay-checkbox");
    const pointerSwitch = builder.get_object("pointer-switch");
    const pointerCheckbox = builder.get_object("pointer-checkbox");
    const autosaveSwitch = builder.get_object("autosave-switch");
    const autocopySwitch = builder.get_object("autocopy-switch");
    const flashSwitch = builder.get_object("flash-switch");
    const notificationSwitch = builder.get_object("notification-switch");
    const backendCombo = builder.get_object("backend-combo");
    const windowTransitionWait = builder.get_object("window-transition-wait");
    const showWindowCheckbox = builder.get_object("show-window-checkbox");

    // Close buttons
    closeBtn.connect("clicked", () => dialog.destroy());
    dialog.connect("response", () => dialog.destroy());

    // File Chooser Button setup
    let currentFolder = settings.get_string("screenshot-save-folder");
    if (!currentFolder || currentFolder.label===0) {
    	currentFolder = getBackupFolder();
    	settings.set_string("screenshot-save-folder", currentFolder);
    }

    fileChooser.set_filename(currentFolder);
    fileChooser.connect("file-set", () => {
      const folderPath = fileChooser.get_filename();
      if (folderPath) {
        settings.set_string("screenshot-save-folder", folderPath);
      }
    });
    const folderChangedId = settings.connect("changed::screenshot-save-folder", () => {
      const path = settings.get_string("screenshot-save-folder");
      if (path) {
        fileChooser.set_filename(path);
      }
    });

    // Spin button adjustments
    delaySpinner.set_adjustment(new Gtk.Adjustment({
      lower: 0,
      upper: 3600,
      step_increment: 1,
    }));

    windowTransitionWait.set_adjustment(new Gtk.Adjustment({
      lower: 0,
      upper: 5000,
      step_increment: 200,
    }));

    // ComboBoxText options for mode
    modeCombo.append(CaptureMode.SCREEN, "Screen");
    modeCombo.append(CaptureMode.WINDOW, "Window");
    modeCombo.append(CaptureMode.AREA, "Area");

    // Bindings using Gio.Settings.bind
    settings.bind("last-screenshot-save-folder", folderCheckbox, "active", Gio.SettingsBindFlags.DEFAULT);
    settings.bind("screenshot-mode", modeCombo, "active-id", Gio.SettingsBindFlags.DEFAULT);
    settings.bind("last-screenshot-mode", modeCheckbox, "active", Gio.SettingsBindFlags.DEFAULT);
    settings.bind("screenshot-delay", delaySpinner, "value", Gio.SettingsBindFlags.DEFAULT);
    settings.bind("last-screenshot-delay", delayCheckbox, "active", Gio.SettingsBindFlags.DEFAULT);
    settings.bind("include-pointer", pointerSwitch, "active", Gio.SettingsBindFlags.DEFAULT);
    settings.bind("last-include-pointer", pointerCheckbox, "active", Gio.SettingsBindFlags.DEFAULT);
    settings.bind("auto-save", autosaveSwitch, "active", Gio.SettingsBindFlags.DEFAULT);
    settings.bind("auto-copy", autocopySwitch, "active", Gio.SettingsBindFlags.DEFAULT);
    settings.bind("show-notification", notificationSwitch, "active", Gio.SettingsBindFlags.DEFAULT);
    settings.bind("window-wait", windowTransitionWait, "value", Gio.SettingsBindFlags.DEFAULT);

    // Inverted bindings / Custom sync for show-window-checkbox (hide-window)
    showWindowCheckbox.set_active(!settings.get_boolean("hide-window"));
    showWindowCheckbox.connect("toggled", () => {
      settings.set_boolean("hide-window", !showWindowCheckbox.get_active());
    });
    const hideWindowChangedId = settings.connect("changed::hide-window", () => {
      showWindowCheckbox.set_active(!settings.get_boolean("hide-window"));
    });

    // Inverted bindings / Custom sync for flash-switch (enable-flash)
    flashSwitch.set_active(!settings.get_boolean("enable-flash"));
    flashSwitch.connect("state-set", (widget, state) => {
      settings.set_boolean("enable-flash", !state);
      return false;
    });
    const enableFlashChangedId = settings.connect("changed::enable-flash", () => {
      flashSwitch.set_active(!settings.get_boolean("enable-flash"));
    });

    // Backend setup (custom ListStore for sensitivity)
    const backendStore = new Gtk.ListStore();
    backendStore.set_column_types([
      GObject.TYPE_STRING, // ID
      GObject.TYPE_STRING, // Label
      GObject.TYPE_BOOLEAN // Sensitive
    ]);

    backendCombo.set_model(backendStore);
    backendCombo.set_id_column(0);

    const renderer = new Gtk.CellRendererText();
    backendCombo.pack_start(renderer, true);
    backendCombo.add_attribute(renderer, "text", 1);
    backendCombo.add_attribute(renderer, "sensitive", 2);

    const backendData = [];
    for (const key in backends) {
      backendData.push([key, backends[key].label, backends[key].isAvailable()]);
    }

    for (const [id, backendLabel, available] of backendData) {
      const iter = backendStore.insert(-1);
      backendStore.set(iter, [0, 1, 2], [id, backendLabel, available]);
    }

    settings.bind("capture-backend-auto", backendCombo, "active-id", Gio.SettingsBindFlags.DEFAULT);

    const backendChangedId = backendCombo.connect("changed", () => {
      const activeId = backendCombo.get_active_id();
      if (activeId) {
        settings.set_string("capture-backend", activeId);
      }
    });

    // Clean up settings connections on dialog destroy to avoid memory leaks
    dialog.connect("destroy", () => {
      settings.disconnect(folderChangedId);
      settings.disconnect(hideWindowChangedId);
      settings.disconnect(enableFlashChangedId);
      backendCombo.disconnect(backendChangedId);
    });

    return dialog;
  }
}

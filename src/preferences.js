import Gtk from 'gi://Gtk?version=3.0';
import GObject from 'gi://GObject';
import Pango from 'gi://Pango';

import { settings } from './window.js';

export const PreferencesWindow = GObject.registerClass({
    GTypeName: 'PreferencesWindow',
}, class PreferencesWindow extends Gtk.Dialog {
    constructor(parent) {
        super({
            title: 'Preferences',
            transient_for: parent,
            modal: true,
            default_width: 400,
            default_height: 300,
        });

        this.add_button('Close', Gtk.ResponseType.CLOSE);
        this.connect('response', () => this.destroy());

        let contentArea = this.get_content_area();
        contentArea.set_spacing(12);
        contentArea.set_margin_top(12);
        contentArea.set_margin_bottom(12);
        contentArea.set_margin_start(12);
        contentArea.set_margin_end(12);

        const grid = new Gtk.Grid({
            row_spacing: 12,
            column_spacing: 12,
            column_homogeneous: false
        });
        contentArea.add(grid);

        // Screenshot Folder Row
        const screenshotLabel = new Gtk.Label({ label: "Screenshot Folder:", halign: Gtk.Align.START });
        const screenshotPathLabel = new Gtk.Label({
            label: settings.get_string('default-screenshot-folder'),
            hexpand: true,
            halign: Gtk.Align.START,
            ellipsize: Pango.EllipsizeMode.MIDDLE
        });
        const screenshotFolderButton = new Gtk.Button({ label: 'Browse' });

        grid.attach(screenshotLabel, 0, 0, 1, 1);
        grid.attach(screenshotPathLabel, 1, 0, 1, 1);
        grid.attach(screenshotFolderButton, 2, 0, 1, 1);

        screenshotFolderButton.connect('clicked', () => this._onOpenFolderSelector("default-screenshot-folder"));

        // Recorder Folder Row
        const recorderLabel = new Gtk.Label({ label: "Recording Folder:", halign: Gtk.Align.START });
        const recorderPathLabel = new Gtk.Label({
            label: settings.get_string('default-recorder-folder'),
            hexpand: true,
            halign: Gtk.Align.START,
            ellipsize: Pango.EllipsizeMode.MIDDLE
        });
        const recorderFolderButton = new Gtk.Button({ label: 'Browse' });

        grid.attach(recorderLabel, 0, 1, 1, 1);
        grid.attach(recorderPathLabel, 1, 1, 1, 1);
        grid.attach(recorderFolderButton, 2, 1, 1, 1);

        recorderFolderButton.connect('clicked', () => this._onOpenFolderSelector("default-recorder-folder"));

        // Sync labels when settings change
        this._settingsSignalId = settings.connect('changed', (settings, key) => {
            if (key === 'default-screenshot-folder') {
                screenshotPathLabel.set_text(settings.get_string(key));
            } else if (key === 'default-recorder-folder') {
                recorderPathLabel.set_text(settings.get_string(key));
            }
        });

        this.connect('destroy', () => {
            if (this._settingsSignalId) {
                settings.disconnect(this._settingsSignalId);
            }
        });
    }

    _onOpenFolderSelector(key) {
        // Store reference to prevent garbage collection
        this._fileChooser = new Gtk.FileChooserNative({
            title: 'Select a Folder',
            transient_for: this,
            action: Gtk.FileChooserAction.SELECT_FOLDER,
            accept_label: 'Select',
            cancel_label: 'Cancel',
            modal: true,
        });

        this._fileChooser.connect('response', (dialog, response) => {
            if (response === Gtk.ResponseType.ACCEPT) {
                // For GTK3, use get_filename() for FileChooserNative
                const folderPath = dialog.get_filename();
                if (folderPath) {
                    settings.set_string(key, folderPath);
                    console.log(`${key} set to: ${folderPath}`);
                }
            } else {
                console.log('File selection cancelled.');
            }

            // Clean up the reference
            this._fileChooser = null;
        });

        this._fileChooser.show();
    }
});
import Gtk from 'gi://Gtk?version=3.0';
import GObject from 'gi://GObject';

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

        const screenshotFolderButton = new Gtk.Button({
            label: 'Browse',
        });

        screenshotFolderButton.connect('clicked', () => this._onOpenFolderSelector("default-screenshot-folder"));



        const recorderFolderButton = new Gtk.Button({
            label: 'Browse',
        });

        recorderFolderButton.connect('clicked', () => this._onOpenFolderSelector("default-recorder-folder"));


        contentArea.add(screenshotFolderButton);
        contentArea.add(recorderFolderButton);
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
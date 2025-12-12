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

        // Placeholder for settings - add your settings controls here

        const ScreenshotFolderEntry = new Gtk.FileChooserButton({});



        ScreenshotFolderEntry.set_current_folder(settings.get_string('default-screenshot-folder'));
        ScreenshotFolderEntry.connect('file-set', () => {
            settings.set_string('default-screenshot-folder', ScreenshotFolderEntry.get_filename());
        });
        contentArea.add(ScreenshotFolderEntry);
    }
});
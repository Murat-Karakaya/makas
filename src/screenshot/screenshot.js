import Gtk from 'gi://Gtk?version=3.0';
import Gdk from 'gi://Gdk?version=3.0';
import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import { settings } from '../window.js';
import { selectArea, selectWindow } from './area-selection.js';
import { compositePointer, getCurrentDate } from './utils.js';

// Capture mode enumeration
const CaptureMode = {
    SCREEN: 0,
    WINDOW: 1,
    AREA: 2,
};

export const ScreenshotPage = GObject.registerClass(
    class ScreenshotPage extends Gtk.Box {
        _init() {
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

            this._captureMode = CaptureMode.SCREEN;
            this._lastPixbuf = null;

            this._buildUI();
        }

        _buildUI() {
            // === Capture Mode Section ===
            const modeFrame = new Gtk.Frame({ label: 'Capture Mode' });
            const modeBox = new Gtk.Box({
                orientation: Gtk.Orientation.HORIZONTAL,
                spacing: 12,
                margin_top: 8,
                margin_bottom: 8,
                margin_start: 12,
                margin_end: 12,
                halign: Gtk.Align.CENTER,
            });

            this._screenRadio = new Gtk.RadioButton({ label: 'Screen' });
            this._windowRadio = new Gtk.RadioButton({ label: 'Window', group: this._screenRadio });
            this._areaRadio = new Gtk.RadioButton({ label: 'Area', group: this._screenRadio });

            modeBox.pack_start(this._screenRadio, false, false, 0);
            modeBox.pack_start(this._windowRadio, false, false, 0);
            modeBox.pack_start(this._areaRadio, false, false, 0);
            modeFrame.add(modeBox);
            this.add(modeFrame);

            this._screenRadio.connect('toggled', () => {
                if (this._screenRadio.get_active()) this._captureMode = CaptureMode.SCREEN;
            });
            this._windowRadio.connect('toggled', () => {
                if (this._windowRadio.get_active()) this._captureMode = CaptureMode.WINDOW;
            });
            this._areaRadio.connect('toggled', () => {
                if (this._areaRadio.get_active()) this._captureMode = CaptureMode.AREA;
            });

            // === Options Section ===
            const optionsFrame = new Gtk.Frame({ label: 'Options' });
            const optionsGrid = new Gtk.Grid({
                row_spacing: 8,
                column_spacing: 12,
                margin_top: 8,
                margin_bottom: 8,
                margin_start: 12,
                margin_end: 12,
            });

            // Delay spinner
            const delayLabel = new Gtk.Label({ label: 'Delay (seconds):', halign: Gtk.Align.START });
            this._delaySpinner = new Gtk.SpinButton({
                adjustment: new Gtk.Adjustment({
                    lower: 0,
                    upper: 60 * 60 * 24,
                    step_increment: 1,
                }),
                value: settings.get_int('screenshot-delay'),
            });

            // Include pointer toggle
            const pointerLabel = new Gtk.Label({ label: 'Include pointer:', halign: Gtk.Align.START });
            this._pointerSwitch = new Gtk.Switch({
                active: settings.get_boolean('include-pointer'),
                halign: Gtk.Align.START,
            });

            optionsGrid.attach(delayLabel, 0, 0, 1, 1);
            optionsGrid.attach(this._delaySpinner, 1, 0, 1, 1);
            optionsGrid.attach(pointerLabel, 0, 1, 1, 1);
            optionsGrid.attach(this._pointerSwitch, 1, 1, 1, 1);
            optionsFrame.add(optionsGrid);
            this.add(optionsFrame);

            // === File Section ===
            const fileFrame = new Gtk.Frame({ label: 'Save Location' });
            const fileGrid = new Gtk.Grid({
                row_spacing: 8,
                column_spacing: 12,
                margin_top: 8,
                margin_bottom: 8,
                margin_start: 12,
                margin_end: 12,
            });

            const folderLabel = new Gtk.Label({ label: 'Folder:', halign: Gtk.Align.START });
            this._folderBtn = new Gtk.FileChooserButton({
                title: 'Select Folder',
                action: Gtk.FileChooserAction.SELECT_FOLDER,
                width_chars: 30,
            });
            this._folderBtn.set_current_folder(settings.get_string('default-screenshot-folder'));

            const nameLabel = new Gtk.Label({ label: 'Filename:', halign: Gtk.Align.START });
            this._filenameEntry = new Gtk.Entry({
                text: `Screenshot-${getCurrentDate()}.png`,
                placeholder_text: 'screenshot.png',
                width_chars: 30,
            });

            fileGrid.attach(folderLabel, 0, 0, 1, 1);
            fileGrid.attach(this._folderBtn, 1, 0, 1, 1);
            fileGrid.attach(nameLabel, 0, 1, 1, 1);
            fileGrid.attach(this._filenameEntry, 1, 1, 1, 1);
            fileFrame.add(fileGrid);
            this.add(fileFrame);

            // === Action Buttons ===
            const buttonBox = new Gtk.Box({
                orientation: Gtk.Orientation.HORIZONTAL,
                spacing: 12,
                halign: Gtk.Align.CENTER,
                margin_top: 8,
            });

            this._shootBtn = new Gtk.Button({ label: 'Take Screenshot' });
            this._shootBtn.get_style_context().add_class(Gtk.STYLE_CLASS_SUGGESTED_ACTION);

            this._copyBtn = new Gtk.Button({ label: 'Copy to Clipboard' });
            this._copyBtn.set_sensitive(false);

            buttonBox.pack_start(this._shootBtn, false, false, 0);
            buttonBox.pack_start(this._copyBtn, false, false, 0);
            this.add(buttonBox);


            this._statusLabel = new Gtk.Label({
                label: 'Ready',
                halign: Gtk.Align.CENTER,
                margin_top: 8,
            });
            this.add(this._statusLabel);


            this._shootBtn.connect('clicked', () => this._onTakeScreenshot());
            this._copyBtn.connect('clicked', () => this._onCopyToClipboard());
        }

        _getDestinationPath() {
            let folder = this._folderBtn.get_filename();
            const name = this._filenameEntry.get_text();
            if (!folder || !name) return null;
            if (!folder.endsWith('/')) folder += '/';
            return folder + name;
        }

        _onTakeScreenshot() {
            print('Screenshot: _onTakeScreenshot enter');

            const app = Gio.Application.get_default();
            if (app) {
                print(`Screenshot: App found ${app}, holding`);
                app.hold(); // Hold app to prevent it from exiting
            } else {
                print('Screenshot: WARNING - App not found via get_default()');
            }

            const topLevel = this.get_toplevel();

            // STEP 1: Hide Window
            if (topLevel && topLevel.hide) {
                print('Screenshot: Hiding window');
                topLevel.hide();
            }

            // Start flow after small delay to allow hide
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 300, () => {

                print(`Screenshot: Selection phase, mode=${this._captureMode}`);

                // STEP 2: Selection
                if (this._captureMode === CaptureMode.AREA) {
                    selectArea((result) => {
                        if (!result) {
                            print('Screenshot: Area selection cancelled');
                            this._statusLabel.set_text('Capture cancelled');
                            this._finishScreenshot(app, topLevel);
                        } else {
                            this._startDelay(app, topLevel, result);
                        }
                    });
                    return GLib.SOURCE_REMOVE;
                }

                if (this._captureMode === CaptureMode.WINDOW) {
                    selectWindow((result) => {
                        if (!result) {
                            print('Screenshot: Window selection cancelled');
                            this._statusLabel.set_text('Capture cancelled');
                            this._finishScreenshot(app, topLevel);
                        } else {
                            this._startDelay(app, topLevel, result);
                        }
                    });
                    return GLib.SOURCE_REMOVE;
                }

                // Screen mode
                this._startDelay(app, topLevel, null);
                return GLib.SOURCE_REMOVE;
            });
        }

        _startDelay(app, topLevel, selectionResult) {

            const delay = this._delaySpinner.get_value_as_int();
            print(`Screenshot: Delay phase, delay=${delay}`);

            if (delay > 0) {
                let remaining = delay;
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
                    remaining--;
                    print(`Screenshot: Waiting... ${remaining}`);
                    if (remaining <= 0) {
                        this._performCapture(app, topLevel, selectionResult);
                        return GLib.SOURCE_REMOVE;
                    }
                    return GLib.SOURCE_CONTINUE;
                });
                return;
            }
            this._performCapture(app, topLevel, selectionResult);
        }

        _performCapture(app, topLevel, selectionResult) {
            print('Screenshot: Capturing...');
            let pixbuf = null;

            try {

                switch (this._captureMode) {
                    case CaptureMode.SCREEN:
                        const rootWindow = Gdk.get_default_root_window();
                        pixbuf = Gdk.pixbuf_get_from_window(
                            rootWindow, 
                            0, 0, 
                            rootWindow.get_width(), rootWindow.get_height()
                        );
                        break;
                    case CaptureMode.WINDOW:
                        if (selectionResult && selectionResult.window) {
                            pixbuf = Gdk.pixbuf_get_from_window(
                                selectionResult.window,
                                0, 0,
                                selectionResult.width, selectionResult.height
                            );
                        }
                        break;
                    case CaptureMode.AREA:
                        if (selectionResult) {
                            const rootWindow = Gdk.get_default_root_window();
                            pixbuf = Gdk.pixbuf_get_from_window(
                                rootWindow,
                                selectionResult.x,
                                selectionResult.y,
                                selectionResult.width,
                                selectionResult.height
                            );
                        }
                        break;

                    default:
                        this._statusLabel.set_text('Capture cancelled or failed');
                        break;
                }

                // Add pointer if enabled
                if (this._pointerSwitch.get_active() && this._captureMode !== CaptureMode.AREA) {
                    pixbuf = compositePointer(pixbuf);
                }

                this._lastPixbuf = pixbuf;
                this._copyBtn.set_sensitive(true);

                // Save to file
                const filepath = this._getDestinationPath();
                if (filepath) {
                    pixbuf.savev(filepath, 'png', [], []);
                    this._statusLabel.set_text(`Saved: ${filepath}`);

                    // Update last save directory
                    const folder = this._folderBtn.get_filename();
                    if (folder) {
                        settings.set_string('screenshot-last-save-directory', folder);
                    }

                    // Update filename for next screenshot
                    this._filenameEntry.set_text(`Screenshot-${getCurrentDate()}.png`);
                }

            } catch (e) {
                print(`Screenshot error: ${e.message}`);
                this._statusLabel.set_text(`Error: ${e.message}`);
            }

            this._finishScreenshot(app, topLevel);
        }

        _finishScreenshot(app, topLevel) {
            print('Screenshot: Restoring window');

            if (topLevel && topLevel.show) {
                topLevel.show();
                topLevel.present();
            }

            if (app) app.release();
            this._shootBtn.set_sensitive(true);
        }

        _onCopyToClipboard() {
            if (!this._lastPixbuf) {
                this._statusLabel.set_text('No screenshot to copy');
                return;
            }
            
            // This bypasses bugs happening in my environment with the constant Gdk.SELECTION_CLIPBOARD
            const CLIPBOARD_ATOM = Gdk.Atom.intern('CLIPBOARD', false);

            const clipboard = Gtk.Clipboard.get(CLIPBOARD_ATOM);
            clipboard.set_image(this._lastPixbuf);
            clipboard.store();
            
            this._statusLabel.set_text('Copied to clipboard');
        }
    }
);

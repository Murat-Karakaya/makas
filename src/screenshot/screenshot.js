/**
 * screenshot.js - Screenshot page with gnome-screenshot feature parity
 * 
 * Features:
 * - Capture modes: Screen, Window, Area
 * - Delay timer (0-60 seconds)
 * - Include pointer toggle
 * - Copy to clipboard
 * - Save with file chooser
 */

import Gtk from 'gi://Gtk?version=3.0';
import Gdk from 'gi://Gdk?version=3.0';
import GdkPixbuf from 'gi://GdkPixbuf';
import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import { settings } from '../window.js';
import { getCurrentDate } from '../utils.js';
import { selectAreaAsync, selectWindowAsync, selectArea, selectWindow } from './area-selection.js';

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
            });

            this._captureMode = CaptureMode.SCREEN;
            this._lastPixbuf = null;

            this._buildUI();
            this._connectSettings();

            // Handle destruction to prevent calls on disposed objects
            this._isDestroyed = false;
            this.connect('destroy', () => {
                this._isDestroyed = true;
            });
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
                    upper: 60,
                    step_increment: 1,
                }),
                value: settings.get_int('screenshot-delay'),
            });
            this._delaySpinner.connect('value-changed', () => {
                settings.set_int('screenshot-delay', this._delaySpinner.get_value_as_int());
            });

            // Include pointer toggle
            const pointerLabel = new Gtk.Label({ label: 'Include pointer:', halign: Gtk.Align.START });
            this._pointerSwitch = new Gtk.Switch({
                active: settings.get_boolean('include-pointer'),
                halign: Gtk.Align.START,
            });
            this._pointerSwitch.connect('state-set', (widget, state) => {
                settings.set_boolean('include-pointer', state);
                return false;
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

            // === Status Label ===
            this._statusLabel = new Gtk.Label({
                label: 'Ready',
                halign: Gtk.Align.CENTER,
                margin_top: 8,
            });
            this.add(this._statusLabel);

            // Connect button signals
            this._shootBtn.connect('clicked', () => this._onTakeScreenshot());
            this._copyBtn.connect('clicked', () => this._onCopyToClipboard());
        }

        _connectSettings() {
            settings.connect('changed::screenshot-delay', () => {
                this._delaySpinner.set_value(settings.get_int('screenshot-delay'));
            });
            settings.connect('changed::include-pointer', () => {
                this._pointerSwitch.set_active(settings.get_boolean('include-pointer'));
            });
        }

        _getDestinationPath() {
            let folder = this._folderBtn.get_filename();
            const name = this._filenameEntry.get_text();
            if (!folder || !name) return null;
            if (!folder.endsWith('/')) folder += '/';
            return folder + name;
        }

        _onTakeScreenshot() {
            print('Screenshot: _onTakeScreenshot enter (callback version)');
            if (this._isDestroyed) {
                print('Screenshot: Destroyed, aborting');
                return;
            }

            const app = Gio.Application.get_default();
            if (app) {
                print(`Screenshot: App found ${app}, holding`);
                app.hold();
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
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 200, () => {
                if (this._isDestroyed) {
                    this._finishScreenshot(app, topLevel);
                    return GLib.SOURCE_REMOVE;
                }

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
            if (this._isDestroyed) {
                this._finishScreenshot(app, topLevel);
                return;
            }

            const delay = this._delaySpinner.get_value_as_int();
            print(`Screenshot: Delay phase, delay=${delay}`);

            if (delay > 0) {
                let remaining = delay;
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
                    if (this._isDestroyed) {
                        this._finishScreenshot(app, topLevel);
                        return GLib.SOURCE_REMOVE;
                    }
                    remaining--;
                    print(`Screenshot: Waiting... ${remaining}`);
                    if (remaining <= 0) {
                        this._performCapture(app, topLevel, selectionResult);
                        return GLib.SOURCE_REMOVE;
                    }
                    return GLib.SOURCE_CONTINUE;
                });
            } else {
                // Small delay to ensure UI cleared if delay was 0
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
                    this._performCapture(app, topLevel, selectionResult);
                    return GLib.SOURCE_REMOVE;
                });
            }
        }

        _performCapture(app, topLevel, selectionResult) {
            if (this._isDestroyed) {
                this._finishScreenshot(app, topLevel);
                return;
            }

            print('Screenshot: Capturing...');
            try {
                this._captureScreenshot(selectionResult); // This is still async-ish but internally synchronous enough for pixbuf
            } catch (e) {
                print(`Screenshot error: ${e.message}`);
                if (!this._isDestroyed) this._statusLabel.set_text(`Error: ${e.message}`);
            }

            this._finishScreenshot(app, topLevel);
        }

        _finishScreenshot(app, topLevel) {
            print('Screenshot: Restoring window');
            this._restoreWindow(topLevel);
            if (app) app.release();
            if (!this._isDestroyed) {
                this._shootBtn.set_sensitive(true);
            }
        }

        _restoreWindow(topLevel) {
            if (this._isDestroyed) return;
            if (topLevel && topLevel.show) {
                topLevel.show();
                topLevel.present();
            }
        }

        async _captureScreenshot(selectionResult) {
            try {
                if (this._isDestroyed) return;

                let pixbuf = null;

                switch (this._captureMode) {
                    case CaptureMode.SCREEN:
                        pixbuf = this._captureScreen();
                        break;
                    case CaptureMode.WINDOW:
                        pixbuf = this._captureWindow(selectionResult); // Pass selection result
                        break;
                    case CaptureMode.AREA:
                        // Use the result we got earlier
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
                }

                if (!pixbuf) {
                    this._statusLabel.set_text('Capture cancelled or failed');
                    return;
                }

                // Add pointer if enabled
                if (settings.get_boolean('include-pointer') && this._captureMode !== CaptureMode.AREA) {
                    pixbuf = this._compositePointer(pixbuf);
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
                        settings.set_string('last-save-directory', folder);
                    }

                    // Update filename for next screenshot
                    this._filenameEntry.set_text(`Screenshot-${getCurrentDate()}.png`);
                } else {
                    this._statusLabel.set_text('Screenshot captured (not saved)');
                }
            } catch (e) {
                print(`Screenshot error: ${e.message}`);
                this._statusLabel.set_text(`Error: ${e.message}`);
            }
        }

        _captureScreen() {
            const rootWindow = Gdk.get_default_root_window();
            const width = rootWindow.get_width();
            const height = rootWindow.get_height();
            return Gdk.pixbuf_get_from_window(rootWindow, 0, 0, width, height);
        }

        _captureWindow(selectionResult) {
            const screen = Gdk.Screen.get_default();
            let activeWindow = null;

            if (selectionResult) {
                // Find window at clicked active coordinates
                const rootWindow = Gdk.get_default_root_window();
                // This is a bit of a hack in GDK3/X11, getting the window at position from root
                // Note: get_window_at_position is not always reliable for toplevels managed by WM
                // But let's try to find it via display
                const display = Gdk.Display.get_default();
                // We might need to iterate windows or use the pointer logic again but at specific coords?
                // Actually, Gdk.Window.at_pointer is deprecated or specific.

                // Better approach with GDK3: Active window is often what we want if we clicked it to activate?
                // But clicking the overlay overlay might confuse things.
                // However, the overlay is destroyed before we get here. 
                // So the click event passed through? No, we grabbed it.

                // Let's use get_window_at_position from the root window
                // Note: This returns a GdkWindow, which might be a child window.
                activeWindow = rootWindow.get_window_at_position(selectionResult.x, selectionResult.y);
            }

            if (!activeWindow) {
                activeWindow = screen.get_active_window();
            }

            // Fallback: get window under pointer
            if (!activeWindow) {
                const seat = Gdk.Display.get_default().get_default_seat();
                const pointer = seat.get_pointer();
                activeWindow = pointer.get_window_at_position(null, null);
            }

            // Ultimate fallback: capture entire screen
            if (!activeWindow || activeWindow === Gdk.get_default_root_window()) {
                this._statusLabel.set_text('No active window, capturing screen');
                return this._captureScreen();
            }

            // Get toplevel window
            activeWindow = activeWindow.get_toplevel();

            // Get window geometry including frame
            const [, x, y, width, height] = activeWindow.get_geometry();

            // Capture from root window at window position for frame decorations
            const rootWindow = Gdk.get_default_root_window();
            const [originX, originY] = activeWindow.get_origin();

            return Gdk.pixbuf_get_from_window(
                rootWindow,
                originX,
                originY,
                width,
                height
            );
        }

        _compositePointer(pixbuf) {
            try {
                const display = Gdk.Display.get_default();
                const cursor = Gdk.Cursor.new_for_display(display, Gdk.CursorType.LEFT_PTR);
                const cursorPixbuf = cursor.get_image();

                if (!cursorPixbuf) {
                    return pixbuf;
                }

                // Get cursor position
                const seat = display.get_default_seat();
                const pointer = seat.get_pointer();
                const [, x, y] = pointer.get_position();

                // Get cursor hotspot
                const xHotStr = cursorPixbuf.get_option('x_hot');
                const yHotStr = cursorPixbuf.get_option('y_hot');
                const xHot = xHotStr ? parseInt(xHotStr) : 0;
                const yHot = yHotStr ? parseInt(yHotStr) : 0;

                const cursorX = x - xHot;
                const cursorY = y - yHot;

                // Only composite if cursor is within screenshot bounds
                if (cursorX >= 0 && cursorY >= 0 &&
                    cursorX < pixbuf.get_width() && cursorY < pixbuf.get_height()) {

                    const cursorWidth = Math.min(
                        cursorPixbuf.get_width(),
                        pixbuf.get_width() - cursorX
                    );
                    const cursorHeight = Math.min(
                        cursorPixbuf.get_height(),
                        pixbuf.get_height() - cursorY
                    );

                    cursorPixbuf.composite(
                        pixbuf,
                        cursorX, cursorY,
                        cursorWidth, cursorHeight,
                        cursorX, cursorY,
                        1.0, 1.0,
                        GdkPixbuf.InterpType.BILINEAR,
                        255
                    );
                }
            } catch (e) {
                print(`Failed to composite pointer: ${e.message}`);
            }

            return pixbuf;
        }

        _onCopyToClipboard() {
            if (!this._lastPixbuf) {
                this._statusLabel.set_text('No screenshot to copy');
                return;
            }

            const clipboard = Gtk.Clipboard.get(Gdk.SELECTION_CLIPBOARD);
            clipboard.set_image(this._lastPixbuf);
            this._statusLabel.set_text('Copied to clipboard');
        }
    }
);

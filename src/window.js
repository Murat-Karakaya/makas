/* window.js
 *
 * Copyright 2025 Murat
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk?version=3.0';

import { RecorderPage } from './recorder/recorder.js';
import { ScreenshotPage } from './screenshot/screenshot.js';
import Gio from 'gi://Gio';

export const settings = new Gio.Settings({ schema_id: 'org.example.ScreenRecorder' });

export const ScreenrecorderWindow = GObject.registerClass({
    GTypeName: 'ScreenrecorderWindow',
}, class ScreenrecorderWindow extends Gtk.ApplicationWindow {
    constructor(application) {
        super({ application, title: "ScreenRecorder", default_width: 800, default_height: 600 });

        // Main Box
        this.main_box = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            visible: true
        });
        this.add(this.main_box);

        const toolbar = new Gtk.Toolbar({
            visible: true,
        });

        // Stack Switcher
        let stack = new Gtk.Stack({
            transition_type: Gtk.StackTransitionType.SLIDE_LEFT_RIGHT,
            visible: true
        });

        toolbar.toolbar_style = Gtk.ToolbarStyle.BOTH;
        toolbar.get_style_context().add_class(Gtk.STYLE_CLASS_PRIMARY_TOOLBAR);
        this.main_box.add(toolbar);

        let toolItem = new Gtk.ToolItem({
            visible: true,
            halign: Gtk.Align.CENTER,
        });
        toolbar.insert(toolItem, 0);

        let switcher = new Gtk.StackSwitcher({
            stack: stack,
            margin_bottom: 2,
            visible: true,
        });

        toolItem.add(switcher);
        this.main_box.pack_start(stack, true, true, 0);

        // --- Page 1: Screenshot ---
        let screenshotPage = new ScreenshotPage();
        screenshotPage.show_all();
        stack.add_titled(screenshotPage, "screenshot", "Screenshot");


        // --- Page 2: Recorder ---
        let recorderPage = new RecorderPage();
        recorderPage.show_all();
        stack.add_titled(recorderPage, "recorder", "Recorder");
    }
});


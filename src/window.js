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
    Template: 'resource:///org/example/ScreenRecorder/window.ui',
    InternalChildren: ['main_box'],
}, class ScreenrecorderWindow extends Gtk.ApplicationWindow {
    constructor(application) {
        super({ application });


        //GTK Header
        let headerBar = new Gtk.HeaderBar({
            title: "Screen Recorder",
            show_close_button: true,
            visible: true
        });

        this.set_titlebar(headerBar);

        // Stack Switcher
        let stack = new Gtk.Stack({
            transition_type: Gtk.StackTransitionType.SLIDE_LEFT_RIGHT,
            visible: true
        });

        let switcher = new Gtk.StackSwitcher({
            stack: stack,
            margin_top: 10,
            margin_bottom: 10,
            visible: true
        });

        let toolbar = new Gtk.Toolbar({
            visible: true,
        });

        toolbar.toolbar_style = Gtk.ToolbarStyle.BOTH;
        toolbar.get_style_context().add_class(Gtk.STYLE_CLASS_PRIMARY_TOOLBAR);

        let toolItem = new Gtk.ToolItem({ visible: true });
        toolItem.add(switcher);
        toolbar.insert(toolItem, 0);
        this._main_box.pack_start(toolbar, false, false, 0);
        this._main_box.pack_start(stack, true, true, 0);

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


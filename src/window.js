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
import { PreferencesWindow } from './preferences.js';

export const settings = new Gio.Settings({ schema_id: 'org.example.ScreenRecorder' });

export const ScreenrecorderWindow = GObject.registerClass({
    GTypeName: 'ScreenrecorderWindow',
}, class ScreenrecorderWindow extends Gtk.ApplicationWindow {
    constructor(application) {
        super({ application, title: "ScreenRecorder", default_width: 500, default_height: 400 });

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
        const stack = new Gtk.Stack({
            transition_type: Gtk.StackTransitionType.SLIDE_LEFT_RIGHT,
            margin_start: 25,
            margin_end: 25,
            margin_top: 25,
            margin_bottom: 25,
            visible: true
        });

        toolbar.toolbar_style = Gtk.ToolbarStyle.BOTH;
        toolbar.get_style_context().add_class(Gtk.STYLE_CLASS_PRIMARY_TOOLBAR);
        this.main_box.add(toolbar);

        // Add expanding separator to push switcher to center. I know this is ugly but I don't know how to do it better.
        const leftSeparator = new Gtk.SeparatorToolItem({
            draw: false,
            visible: true,
        });
        leftSeparator.set_expand(true);
        toolbar.insert(leftSeparator, 0);

        // Add switcher in the middle
        const toolSwitcherContainer = new Gtk.ToolItem({
            visible: true,
        });
        const switcher = new Gtk.StackSwitcher({
            stack: stack,
            margin_bottom: 2,
            margin_start: 25,
            visible: true,
        });
        toolSwitcherContainer.add(switcher);
        toolbar.insert(toolSwitcherContainer, -1);

        // Add expanding separator after switcher
        const rightSeparator = new Gtk.SeparatorToolItem({
            draw: false,
            visible: true,
        });
        rightSeparator.set_expand(true);
        toolbar.insert(rightSeparator, -1);

        // Menu button with dropdown
        const menuToolItem = new Gtk.ToolItem({
            visible: true,
        });

        const menuButton = new Gtk.MenuButton({
            visible: true,
            relief: Gtk.ReliefStyle.NONE,
        });

        // Set menu icon from icon theme
        const menuIcon = new Gtk.Image({
            icon_name: 'open-menu-symbolic',
            icon_size: Gtk.IconSize.SMALL_TOOLBAR,
            visible: true,
        });
        menuButton.set_image(menuIcon);

        // Create popover menu
        const popover = new Gtk.Popover();
        const popoverBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            margin: 5,
            visible: true,
        });

        const preferencesButton = new Gtk.ModelButton({
            text: 'Preferences',
            visible: true,
        });
        preferencesButton.connect('clicked', () => {
            popover.popdown();
            const prefsWindow = new PreferencesWindow(this);
            prefsWindow.show_all();
        });

        popoverBox.add(preferencesButton);
        popover.add(popoverBox);
        popover.set_relative_to(menuButton);
        menuButton.set_popover(popover);

        menuToolItem.add(menuButton);
        toolbar.insert(menuToolItem, -1);

        // Add Stack
        this.main_box.pack_start(stack, true, true, 0);

        // --- Page 1: Screenshot ---
        const screenshotPage = new ScreenshotPage();
        screenshotPage.show_all();
        stack.add_titled(screenshotPage, "screenshot", "Screenshot");


        // --- Page 2: Recorder ---
        const recorderPage = new RecorderPage();
        recorderPage.show_all();
        stack.add_titled(recorderPage, "recorder", "Recorder");
    }
});

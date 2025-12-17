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

import GObject from "gi://GObject";
import Gtk from "gi://Gtk?version=3.0";
import Gio from "gi://Gio";

import { ScreenshotPage } from "./screenshot/screenshot.js";
import { PreferencesWindow } from "./preferences.js";

export const settings = new Gio.Settings({
  schema_id: "com.github.Murat-Karakaya.Makas",
});

export const ScreenshotWindow = GObject.registerClass(
  {
    GTypeName: "ScreenshotWindow",
  },
  class ScreenshotWindow extends Gtk.ApplicationWindow {
    constructor(application) {
      super({
        application,
        title: "Makas",
        default_width: 500,
        default_height: 400,
      });

      // Main Box
      this.main_box = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        visible: true,
      });
      this.add(this.main_box);

      const toolbar = new Gtk.Toolbar({
        visible: true,
      });
      toolbar.toolbar_style = Gtk.ToolbarStyle.BOTH;
      toolbar.get_style_context().add_class(Gtk.STYLE_CLASS_PRIMARY_TOOLBAR);
      this.main_box.add(toolbar);

      // Menu button with dropdown
      const menuToolItem = new Gtk.ToolItem({
        visible: true,
      });

      const menuButton = new Gtk.MenuButton({
        visible: true,
        relief: Gtk.ReliefStyle.NONE,
      });

      menuButton.set_image(
        new Gtk.Image({
          icon_name: "open-menu-symbolic",
          icon_size: Gtk.IconSize.SMALL_TOOLBAR,
          visible: true,
        }),
      );

      // Create popover menu
      const popover = new Gtk.Popover();
      const popoverBox = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        margin: 5,
        visible: true,
      });

      const preferencesButton = new Gtk.ModelButton({
        text: "Preferences",
        visible: true,
      });
      preferencesButton.connect("clicked", () => {
        popover.popdown();
        const prefsWindow = new PreferencesWindow(this);
        prefsWindow.show_all();
      });

      popoverBox.add(preferencesButton);
      popover.add(popoverBox);
      popover.set_relative_to(menuButton);
      menuButton.set_popover(popover);

      menuToolItem.add(menuButton);
      toolbar.insert(menuToolItem, 0);

      // --- Page 1: Screenshot ---
      const screenshotPage = new ScreenshotPage();
      screenshotPage.show_all();
      this.main_box.add(screenshotPage);
    }
  },
);

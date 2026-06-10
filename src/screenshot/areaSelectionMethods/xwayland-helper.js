#!/usr/bin/env gjs -m
/**
 * XWayland Helper Script
 *
 * This script is spawned as a subprocess with GDK_BACKEND=x11 to force XWayland.
 * It performs the area selection and writes the result to a JSON file.
 *
 * Usage: gjs -m xwayland-helper.js <background-image-path> <result-json-path>
 */

import Gtk from "gi://Gtk?version=3.0";
import GdkPixbuf from "gi://GdkPixbuf";
import Gio from "gi://Gio";
import system from "system";
import { selectAreaX11 } from "./selectAreaX11.js";


const args = system.programArgs;
let bgImagePath, resultPath;

// Simple heuristic to find args
const cleanArgs = args.filter(a => !a.endsWith(".js") && !a.endsWith(".mjs") && a !== "-m");
if (cleanArgs.length >= 2) {
    bgImagePath = cleanArgs[0];
    resultPath = cleanArgs[1];
} else {
    // Fallback if filtering failed (e.g. if script name is not in args)
    if (args.length >= 2) {
        bgImagePath = args[0];
        resultPath = args[1];
    }
}

if (!bgImagePath || !resultPath) {
    print(`Usage: gjs -m xwayland-helper.js <background-image-path> <result-json-path>`);
    print(`Received args: ${JSON.stringify(args)}`);
    system.exit(1);
}

Gtk.init(null);

const bgPixbuf = GdkPixbuf.Pixbuf.new_from_file(bgImagePath);

const result = await selectAreaX11(bgPixbuf);
const returning = result ? {abort:false, ...result} : {abort: true};

const file = Gio.File.new_for_path(resultPath);
const outputStream = file.replace(null, false, Gio.FileCreateFlags.NONE, null);
const encoder = new TextEncoder();
outputStream.write_all(encoder.encode(JSON.stringify(returning)), null);
outputStream.close(null);

import Gtk from "gi://Gtk?version=3.0";
import cairo from "gi://cairo";

export class SelectionDrawer {
    constructor() {
        this.themeColor = null;
    }

    /**
     * Get the theme's selected background color.
     * @param {Gtk.Widget} widget 
     */
    _updateThemeColor(widget) {
        if (this.themeColor) return;

        const context = widget.get_style_context();
        const [success, color] = context.lookup_color('theme_selected_bg_color');
        
        if (success) {
            this.themeColor = { r: color.red, g: color.green, b: color.blue, a: 0.8 };
        } else {
            // Fallback (blue-ish)
            this.themeColor = { r: 0.2, g: 0.6, b: 1.0, a: 0.8 };
        }
    }

    /**
     * Draw the selection overlay.
     * @param {cairo.Context} cr 
     * @param {Gtk.Widget} widget 
     * @param {cairo.Surface} bgSurface - The background screenshot surface
     * @param {Object} rect - Global selection rectangle {x, y, width, height}
     * @param {Object} geometry - The window's geometry in global coordinates {x, y, width, height}
     * @param {boolean} isSelecting - Whether a selection is active (button pressed)
     */
    draw(cr, widget, bgSurface, rect, geometry, isSelecting) {
        this._updateThemeColor(widget);

        // 1. Draw Background
        // The bgSurface is usually the full screenshot (root coords).
        // We need to draw the part of it corresponding to this window.
        // We translate the source so that (0,0) of the source aligns with global (0,0).
        // Since we are drawing into a window at global (geometry.x, geometry.y),
        // we offset the source by -geometry.x, -geometry.y.
        
        if (bgSurface) {
            cr.setSourceSurface(bgSurface, -geometry.x, -geometry.y);
            cr.paint();
        } else {
            cr.setSourceRGBA(0, 0, 0, 0.3);
            cr.paint();
        }

        // 2. Dim Overlay
        cr.setOperator(cairo.Operator.OVER);
        cr.setSourceRGBA(0, 0, 0, 0.4);

        const w = widget.get_allocated_width();
        const h = widget.get_allocated_height();

        // Convert global selection rect to local window coordinates
        const localSelX = rect.x - geometry.x;
        const localSelY = rect.y - geometry.y;
        const selW = rect.width;
        const selH = rect.height;

        // Draw the dimming layer with a "hole" for the selection
        cr.rectangle(0, 0, w, h);
        
        if (selW > 0 && selH > 0) {
            // Subtract the selection rectangle (using winding rule)
            // Draw the hole in the opposite direction or just rely on EvenOdd rule if set?
            // Cairo default fill rule is Winding. 
            // A simple way to create a hole is to draw the box again with negative width/height?
            // Or use rectangle + new_sub_path?
            // Safest: rectangle(0,0,w,h) then rectangle(x+w, y, -w, h)
            cr.rectangle(localSelX + selW, localSelY, -selW, selH);
        }
        cr.fill();

        // 3. Selection Border
        if (isSelecting && selW > 0 && selH > 0) {
            const style = widget.get_style_context();
            style.save();
            style.add_class(Gtk.STYLE_CLASS_RUBBERBAND);
            
            // Use theme color
            cr.setSourceRGBA(
                this.themeColor.r, 
                this.themeColor.g, 
                this.themeColor.b, 
                this.themeColor.a
            );
            
            // Adjust line width based on scale? 
            // Usually 2px is fine, maybe scale it if HiDPI
            const scale = widget.get_scale_factor ? widget.get_scale_factor() : 1;
            cr.setLineWidth(2 * scale);
            
            cr.rectangle(localSelX, localSelY, selW, selH);
            cr.stroke();
            style.restore();
        }
    }
}
